import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import type { DurableState, Receipt } from '../../types';
import { shouldApplyRemoteSnapshot, remoteSkipReason, markRemoteApplied, markPushed, isSelfEcho, resetSyncWatermark } from './syncWatermark';

const CLOUD_TABLE = 'household_snapshots';
const RECEIPT_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHouseholdId: string | null = null;

function activeSessionStats(state: DurableState): { itemCount: number; pickedCount: number; sessionId: string } {
  const entries = state.activeSession?.entries ?? [];
  return {
    itemCount: entries.length,
    pickedCount: entries.filter((entry) => entry.picked).length,
    sessionId: state.activeSession?.tripId ?? 'none',
  };
}

async function durableStore() {
  return (await import('../../store/durable-store')).useDurableStore;
}

/**
 * Extract the plain DurableState fields from the Zustand store state so a
 * push never serializes store actions or the `hydrated` flag into the cloud
 * snapshot.
 */
function durableSnapshot(state: DurableState): DurableState {
  return {
    items: state.items,
    stores: state.stores,
    priceHistory: state.priceHistory,
    receipts: state.receipts,
    trips: state.trips,
    activity: state.activity,
    prefs: state.prefs,
    activeSession: state.activeSession ?? null,
    updatedAt: state.updatedAt,
  };
}

async function householdId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const householdStore = (await import('../../store/household-store')).useHouseholdStore;
  if (!householdStore.getState().household) await householdStore.getState().ensureHousehold();
  return householdStore.getState().household?.id ?? null;
}

async function withSignedReceiptUrls(state: DurableState): Promise<DurableState> {
  const receipts = await Promise.all(state.receipts.map(async (receipt) => {
    if (!receipt.imagePath) return receipt;
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(receipt.imagePath, SIGNED_URL_TTL_SECONDS);
    return error ? receipt : { ...receipt, imageUri: data.signedUrl };
  }));
  return { ...state, receipts };
}

async function uploadReceipt(householdId: string, receipt: Receipt): Promise<Receipt> {
  if (!receipt.imageUri?.startsWith('file://')) return receipt;
  try {
    const ext = receipt.imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const imagePath = `${householdId}/${receipt.id}.${ext}`;
    const base64 = await new File(receipt.imageUri).base64();
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(
      imagePath,
      decode(base64),
      { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true },
    );
    return error ? receipt : { ...receipt, imagePath };
  } catch (err) {
    if (__DEV__) console.warn('[Sync Engine] Receipt upload failed', err);
    return receipt;
  }
}

export async function pushLocalState(state: DurableState): Promise<void> {
  const id = await householdId();
  if (!id) return;

  try {
    const receipts = await Promise.all(state.receipts.map((receipt) => uploadReceipt(id, receipt)));
    const snapshot = { ...state, receipts };
    const { error } = await supabase.from(CLOUD_TABLE).upsert({
      household_id: id,
      state: snapshot,
      updated_at: snapshot.updatedAt,
    }, { onConflict: 'household_id' });
    if (error && __DEV__) console.warn('[Sync Engine] Snapshot push failed:', error.message);
    if (!error) {
      markPushed(snapshot.updatedAt);
      const { itemCount, pickedCount, sessionId } = activeSessionStats(snapshot);
      console.log(`[Shopping Sync] active_session_snapshot_written version/updatedAt=${snapshot.updatedAt} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
      const store = await durableStore();
      const uploadedById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
      const currentReceipts = store.getState().receipts.map((receipt) => {
        const uploaded = uploadedById.get(receipt.id);
        return uploaded?.imagePath && uploaded.imageUri === receipt.imageUri
          ? { ...receipt, imagePath: uploaded.imagePath }
          : receipt;
      });
      store.getState().applyRemotePatch({ receipts: currentReceipts });
    }
  } catch (err) {
    if (__DEV__) console.warn('[Sync Engine] Offline or push failed.', err);
  }
}

export async function pullFromSupabase(): Promise<void> {
  const id = await householdId();
  if (!id) return;
  const store = await durableStore();

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('state, updated_at')
    .eq('household_id', id)
    .maybeSingle();
  if (error) return;

  if (!data?.state) {
    const local = store.getState();
    if (local.items.length || local.stores.length || local.receipts.length || local.trips.length) {
      await pushLocalState({ ...durableSnapshot(local), updatedAt: Date.now() });
      return;
    }

    const [{ data: items }, { data: stores }, { data: receipts }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('household_id', id),
      supabase.from('pantry_stores').select('*').eq('household_id', id),
      supabase.from('pantry_receipts').select('*').eq('household_id', id),
    ]);
    if (!items?.length && !stores?.length && !receipts?.length) return;

    const migrated: DurableState = {
      ...local,
      items: (items ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        quantity: Number(row.quantity),
        unit: row.unit,
        status: row.status,
        storageLocation: row.storage_location,
        storeId: row.store_id,
        expiryDate: row.expiry_date,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      })),
      stores: (stores ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        logoColor: row.logo_color ?? undefined,
        logoEmoji: row.logo_emoji ?? undefined,
        logoUrl: row.logo_url ?? undefined,
        placeId: row.place_id ?? undefined,
        address: row.address ?? undefined,
        lat: row.lat == null ? undefined : Number(row.lat),
        lng: row.lng == null ? undefined : Number(row.lng),
        openingHours: row.opening_hours ?? undefined,
        isOpen: row.is_open ?? undefined,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      })),
      priceHistory: local.priceHistory,
      receipts: (receipts ?? []).map((row: any) => ({
        id: row.id,
        tripId: row.trip_id,
        storeId: row.store_id,
        amount: Number(row.amount),
        status: row.status,
        imageUri: row.image_uri,
        createdAt: Number(row.created_at),
      })),
      updatedAt: Date.now(),
    };
    store.getState().applyRemotePatch(migrated);
    await pushLocalState(migrated);
    return;
  }

  const remote = data.state as DurableState;
  const remoteUpdatedAt = (remote.updatedAt ?? data.updated_at ?? 0) as number;
  const hasActiveSession = 'activeSession' in remote;

  const localUpdatedAt = store.getState().updatedAt;
  if (!shouldApplyRemoteSnapshot(remoteUpdatedAt, localUpdatedAt)) {
    const reason = remoteSkipReason(remoteUpdatedAt, localUpdatedAt);
    console.log(`[Shopping Sync] active_session_reconcile_skipped reason=${reason} version/updatedAt=${remoteUpdatedAt} localUpdatedAt=${localUpdatedAt}`);
    // The cloud snapshot is strictly older than this device's durable state
    // (e.g. edits made offline whose push never reached Supabase). Reconcile
    // by pushing the newer local state up so other members converge on it,
    // instead of leaving the stale blob in the cloud. Equal timestamps mean
    // already-in-sync — no push, or realtime would fan out on every launch.
    if (localUpdatedAt > remoteUpdatedAt && !isSelfEcho(remoteUpdatedAt)) {
      console.log(`[Shopping Sync] stale_remote_reconcile_push localUpdatedAt=${localUpdatedAt} remoteUpdatedAt=${remoteUpdatedAt}`);
      await pushLocalState(durableSnapshot(store.getState()));
    }
    return;
  }

  if (hasActiveSession) {
    const { itemCount, pickedCount, sessionId } = activeSessionStats(remote);
    console.log(`[Shopping Sync] remote_active_session_snapshot_received version/updatedAt=${remoteUpdatedAt} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
  }
  if (hasActiveSession && !remote.activeSession) console.log('[Shopping Sync] remote_trip_end_received');
  const signedRemote = await withSignedReceiptUrls(remote);
  // Local state may have advanced while signed URLs were being fetched (a
  // user edit or a concurrent pull) — re-check so a now-stale snapshot cannot
  // clobber it after the await.
  if (!shouldApplyRemoteSnapshot(remoteUpdatedAt, store.getState().updatedAt)) {
    console.log(`[Shopping Sync] active_session_reconcile_skipped reason=${remoteSkipReason(remoteUpdatedAt, store.getState().updatedAt)} version/updatedAt=${remoteUpdatedAt} phase=post_sign`);
    return;
  }
  store.getState().applyRemotePatch(signedRemote);
  if (hasActiveSession) console.log('[Shopping Sync] local_state_reconciled');
  if (!isSelfEcho(remoteUpdatedAt)) {
    markRemoteApplied(remoteUpdatedAt);
  }
}

export async function clearCloudState(): Promise<void> {
  const id = await householdId();
  if (!id) return;
  const store = await durableStore();
  await Promise.all([
    supabase.from(CLOUD_TABLE).delete().eq('household_id', id),
    supabase.storage.from(RECEIPT_BUCKET).remove(
      store.getState().receipts
        .map((receipt) => receipt.imagePath)
        .filter((path): path is string => Boolean(path)),
    ),
  ]);
}

export async function startSyncEngine(): Promise<void> {
  const id = await householdId();
  if (!id || activeHouseholdId === id) return;
  stopSyncEngine();
  activeHouseholdId = id;

  syncChannel = supabase
    .channel(`household-snapshot:${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CLOUD_TABLE,
        filter: `household_id=eq.${id}`,
      },
      () => { void pullFromSupabase(); },
    )
    .subscribe();
}

export function stopSyncEngine(): void {
  if (syncChannel) void supabase.removeChannel(syncChannel);
  syncChannel = null;
  activeHouseholdId = null;
  resetSyncWatermark();
}

export async function refreshGeofencedStoreData(): Promise<void> {
  const { isGeofencingRunning, startGeofencing } = await import('./geofencing');
  if (await isGeofencingRunning()) {
    const { stores, items } = (await durableStore()).getState();
    await startGeofencing(stores, items);
  }
}
