import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import type { DurableState, Receipt } from '../../types';
import { shouldApplyRemote, markRemoteApplied, resetSyncWatermark } from './syncWatermark';

const CLOUD_TABLE = 'household_snapshots';
const RECEIPT_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHouseholdId: string | null = null;

async function durableStore() {
  return (await import('../../store/durable-store')).useDurableStore;
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
      await pushLocalState({ ...local, updatedAt: Date.now() });
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
  if (!shouldApplyRemote(remoteUpdatedAt)) return;
  store.getState().applyRemotePatch(await withSignedReceiptUrls(remote));
  markRemoteApplied(remoteUpdatedAt);
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
