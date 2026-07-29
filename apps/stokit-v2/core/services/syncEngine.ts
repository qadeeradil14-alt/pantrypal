import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import type { DurableState, Receipt, ShoppingEntry } from '../../types';
import { shouldApplyRemoteSnapshot, remoteSkipReason, markRemoteApplied, markPushed, isSelfEcho, resetSyncWatermark } from './syncWatermark';
import {
  decodeShoppingSession,
  encodeShoppingSession,
  reconcileShoppingSession,
} from './shoppingEntrySync';
import { createDebouncedPullScheduler, createRealtimeFallbackScheduler } from './realtimePullScheduler';
import { syncDiag, syncDiagEnabled } from './syncDiag'; // DIAG: temporary — remove after OTA 389 investigation
import { withTimeout } from './withTimeout';
import { hasLocalSyncContribution, mergeDurableSnapshotForPush } from './mergeDurableSnapshot';

const CLOUD_TABLE = 'household_snapshots';
const RECEIPT_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// pullFromSupabase's network calls (the snapshot select, and each receipt's
// signed-URL fetch) had no timeout. A single stalled request left them
// pending forever, and since createDebouncedPullScheduler only invokes the
// next pull after the current one settles, that one hang silently blocked
// EVERY subsequent realtime-triggered pull — sync would work, then stop
// entirely on one device while the other kept converging normally. Bounding
// every pull-path network call guarantees pullFromSupabase always settles,
// so the scheduler can never get stuck.
const PULL_TIMEOUT_MS = 10_000;

function isEmptySharedSnapshot(state: DurableState): boolean {
  return state.items.length === 0
    && state.stores.length === 0
    && state.priceHistory.length === 0
    && state.receipts.length === 0
    && state.trips.length === 0
    && state.activity.length === 0
    && state.activeSession == null
    && (state.deletedItems?.length ?? 0) === 0
    && (state.deletedStores?.length ?? 0) === 0
    && (state.deletedTrips?.length ?? 0) === 0
    && (state.deletedReceipts?.length ?? 0) === 0
    && (state.closedTripIds?.length ?? 0) === 0
    && Object.keys(state.prefsUpdatedAt ?? {}).length === 0;
}

function hasSharedSnapshotContent(state: DurableState): boolean {
  return !isEmptySharedSnapshot(state);
}

function isFreshInstallState(state: DurableState): boolean {
  return state.updatedAt === 0 && isEmptySharedSnapshot(state);
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
}

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHouseholdId: string | null = null;
const initialHouseholdSyncComplete = new Set<string>();
const realtimePullScheduler = createDebouncedPullScheduler(() => pullFromSupabase(), 150);
const realtimeFallbackScheduler = createRealtimeFallbackScheduler(
  () => realtimePullScheduler.schedule(),
  5_000,
);

// Persistent offline flush. When a push fails (typically no connectivity) the
// engine keeps retrying on a capped exponential backoff instead of giving up
// after a single deferred attempt. This is what carries edits made while
// offline to other devices the moment connectivity returns — without needing a
// fresh mutation or an app foreground. Cleared on the first successful push.
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlushDelayMs = 0;
const FLUSH_MAX_DELAY_MS = 30_000;

function scheduleOfflineFlush(): void {
  if (pendingFlushTimer) return;
  pendingFlushDelayMs = pendingFlushDelayMs > 0 ? Math.min(pendingFlushDelayMs * 2, FLUSH_MAX_DELAY_MS) : 2_000;
  pendingFlushTimer = setTimeout(() => {
    pendingFlushTimer = null;
    void (async () => {
      const store = await durableStore();
      await pushLocalState(durableSnapshot(store.getState()), { isDeferredRetry: true });
    })();
  }, pendingFlushDelayMs);
}

function clearOfflineFlush(): void {
  if (pendingFlushTimer) {
    clearTimeout(pendingFlushTimer);
    pendingFlushTimer = null;
  }
  pendingFlushDelayMs = 0;
}

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

async function hasPersistedDurableState(): Promise<boolean> {
  return (await import('../../store/durable-store')).hasPersistedDurableState();
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
    activeSession: state.activeSession
      ? reconcileShoppingSession(state.activeSession, state.items)
      : null,
    updatedAt: state.updatedAt,
    deletedItems: state.deletedItems ?? [],
    deletedStores: state.deletedStores ?? [],
    deletedTrips: state.deletedTrips ?? [],
    deletedReceipts: state.deletedReceipts ?? [],
    closedTripIds: state.closedTripIds ?? [],
    prefsUpdatedAt: state.prefsUpdatedAt ?? {},
  };
}

function decodeShoppingState(state: DurableState): DurableState {
  return {
    ...state,
    activeSession: state.activeSession
      ? decodeShoppingSession(state.activeSession)
      : null,
  };
}

function encodeShoppingState(state: DurableState): DurableState {
  return {
    ...state,
    activeSession: state.activeSession
      ? encodeShoppingSession(state.activeSession)
      : null,
  };
}

/**
 * DIAG(RLS): TEMPORARY — collaborator-write investigation (OTA 419).
 * Summarises each entry's id/name and its exact JSON key set, so a capture can
 * show whether the outgoing payload differs from the server copy only by an
 * added `outOfStock` key (the suspected members-RLS rejection cause).
 * Remove together with the rls_* syncDiag call sites.
 */
function diagEntryShapes(entries: ShoppingEntry[] | undefined): Record<string, unknown> {
  const list = entries ?? [];
  return {
    count: list.length,
    ids: list.map((e) => e.entryId),
    names: list.map((e) => e.name),
    keySets: list.map((e) => `${e.entryId}:{${Object.keys(e).sort().join(',')}}`),
    withOutOfStockKey: list.filter((e) => 'outOfStock' in e).map((e) => e.entryId),
  };
}

/** DIAG(RLS): TEMPORARY — see diagEntryShapes. */
async function localMemberIdForDiag(): Promise<string | null> {
  try {
    const householdStore = (await import('../../store/household-store')).useHouseholdStore;
    return householdStore.getState().members.find((member) => member.isMe)?.id ?? null;
  } catch {
    return null;
  }
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
    try {
      const { data, error } = await withTimeout(
        supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(receipt.imagePath, SIGNED_URL_TTL_SECONDS),
        PULL_TIMEOUT_MS,
      );
      return error ? receipt : { ...receipt, imageUri: data.signedUrl };
    } catch {
      // Timed out — keep the receipt as-is rather than blocking the whole
      // pull (and every pull after it) on one stalled signed-URL request.
      return receipt;
    }
  }));
  return { ...state, receipts };
}

async function uploadReceipt(householdId: string, receipt: Receipt): Promise<Receipt> {
  if (!receipt.imageUri?.startsWith('file://')) return receipt;
  const ext = receipt.imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const imagePath = `${householdId}/${receipt.id}.${ext}`;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const base64 = await new File(receipt.imageUri).base64();
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(
        imagePath,
        decode(base64),
        { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true },
      );
      if (!error) return { ...receipt, imagePath };
      if (__DEV__) console.warn(`[Sync Engine] Receipt upload attempt ${attempt} failed`, error.message);
    } catch (err) {
      if (__DEV__) console.warn(`[Sync Engine] Receipt upload attempt ${attempt} failed`, err);
    }
    if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
  }
  return receipt;
}

export async function pushLocalState(state: DurableState, options?: { isDeferredRetry?: boolean }): Promise<void> {
  const id = await householdId();
  if (!id) return;

  if (!initialHouseholdSyncComplete.has(id)) {
    await pullFromSupabase({ forceServerHydration: true });
    if (!initialHouseholdSyncComplete.has(id)) return;
  }

  try {
    const store = await durableStore();
    const currentLocal = durableSnapshot(store.getState());
    const consistentState = currentLocal.updatedAt > state.updatedAt
      ? currentLocal
      : durableSnapshot(state);
    if (isEmptySharedSnapshot(consistentState)) {
      if (__DEV__) console.warn('[Sync Engine] empty_snapshot_push_blocked');
      clearOfflineFlush();
      return;
    }
    const receipts = await Promise.all(consistentState.receipts.map((receipt) => uploadReceipt(id, receipt)));
    const cloudReceipts = receipts.map((receipt) =>
      !receipt.imagePath && receipt.imageUri?.startsWith('file://')
        ? { ...receipt, imageUri: null }
        : receipt,
    );
    const localSnapshot = { ...consistentState, receipts: cloudReceipts };

    // DIAG(RLS): TEMPORARY — resolved once, outside the retry loop, so the
    // push path's timing is unchanged. Remove with the rls_* call sites.
    const diagLocalMemberId = syncDiagEnabled() ? await localMemberIdForDiag() : null;

    let error: { message: string } | null = null;
    let snapshot = localSnapshot;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      const currentResult = await supabase.from(CLOUD_TABLE).select('state, updated_at').eq('household_id', id).maybeSingle();
      if (currentResult.error) {
        error = currentResult.error;
      } else if (!currentResult.data?.state) {
        const writeAt = Math.max(Date.now(), localSnapshot.updatedAt + 1);
        snapshot = { ...localSnapshot, updatedAt: writeAt };
        const insertResult = await supabase.from(CLOUD_TABLE).insert({
          household_id: id,
          state: encodeShoppingState(snapshot),
          updated_at: writeAt,
        });
        error = insertResult.error;
        if (!error) break;
      } else {
        const remote = decodeShoppingState(currentResult.data.state as DurableState);
        const remoteUpdatedAt = Number(currentResult.data.updated_at ?? remote.updatedAt ?? 0);
        const merged = mergeDurableSnapshotForPush(remote, localSnapshot);
        const writeAt = Math.max(Date.now(), remoteUpdatedAt + 1, merged.updatedAt + 1);
        snapshot = { ...merged, updatedAt: writeAt };
        // DIAG(RLS): TEMPORARY — collaborator-write investigation (OTA 419).
        // Logging only; no control flow below is altered. Delete this whole
        // block, the two syncDiag calls after the update, the rls_remote_verify
        // block, and diagEntryShapes/localMemberIdForDiag when done.
        syncDiag('rls_push_attempt', {
          householdId: id,
          localMemberId: diagLocalMemberId,
          tripId: snapshot.activeSession?.tripId ?? null,
          sessionStatus: snapshot.activeSession?.status ?? null,
          shopperId: snapshot.activeSession?.shopperId ?? null,
          isLocalTheShopper: diagLocalMemberId != null
            && snapshot.activeSession?.shopperId === diagLocalMemberId,
          casExpectedUpdatedAt: remoteUpdatedAt,
          writeAt,
          outgoing: diagEntryShapes(snapshot.activeSession?.entries),
          remote: diagEntryShapes(remote.activeSession?.entries),
          remoteSessionStatus: remote.activeSession?.status ?? null,
        });
        const updateResult = await supabase.from(CLOUD_TABLE)
          .update({ state: encodeShoppingState(snapshot), updated_at: writeAt })
          .eq('household_id', id)
          .eq('updated_at', remoteUpdatedAt)
          .select('updated_at')
          .maybeSingle();
        // DIAG(RLS): TEMPORARY — see note above.
        const diagCode = updateResult.error?.code ?? null;
        syncDiag('rls_push_result', {
          attempt,
          httpStatus: (updateResult as { status?: number }).status ?? null,
          rowsReturned: updateResult.data ? 1 : 0,
          errorCode: diagCode,
          errorMessage: updateResult.error?.message ?? null,
          errorDetails: updateResult.error?.details ?? null,
          errorHint: updateResult.error?.hint ?? null,
          classification: diagCode === '42501'
            ? 'RLS_REJECTED'
            : updateResult.error
              ? 'OTHER_ERROR'
              : updateResult.data
                ? 'SUCCESS'
                : 'CAS_CONFLICT',
        });
        error = updateResult.error;
        if (!error && updateResult.data) break;
        if (!error) error = { message: 'snapshot changed during merge' };
      }
      if (__DEV__) console.warn(`[Sync Engine] Snapshot push attempt ${attempt} failed:`, error.message);
      if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
    }

    if (error) {
      syncDiag('push_err', { snapshotUpdatedAt: snapshot.updatedAt, error: error.message }); // DIAG
      // Keep retrying on backoff until connectivity returns — do not give up.
      scheduleOfflineFlush();
      return;
    }
    clearOfflineFlush();
    markPushed(snapshot.updatedAt);
    // DIAG(RLS): TEMPORARY — re-read the row we just wrote so a capture can
    // distinguish "write accepted and persisted" from "write accepted but the
    // item is later removed/ignored". Gated on syncDiagEnabled() so devices
    // without the diag flag issue no extra request at all.
    if (syncDiagEnabled()) {
      try {
        const verify = await supabase.from(CLOUD_TABLE)
          .select('state, updated_at').eq('household_id', id).maybeSingle();
        const verifyState = verify.data?.state as DurableState | undefined;
        syncDiag('rls_remote_verify', {
          householdId: id,
          fetchError: verify.error?.message ?? null,
          remoteUpdatedAt: verify.data?.updated_at ?? null,
          matchesWhatWeWrote: Number(verify.data?.updated_at ?? -1) === snapshot.updatedAt,
          remoteSessionStatus: verifyState?.activeSession?.status ?? null,
          remoteTripId: verifyState?.activeSession?.tripId ?? null,
          remote: diagEntryShapes(verifyState?.activeSession?.entries),
          remoteItemIds: (verifyState?.items ?? []).map((pantryItem) => pantryItem.id),
        });
      } catch {
        // Diagnostics must never affect the push outcome.
      }
    }
    const { itemCount, pickedCount, sessionId } = activeSessionStats(snapshot);
    if (__DEV__) console.log(`[Shopping Sync] active_session_snapshot_written version/updatedAt=${snapshot.updatedAt} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
    const latestLocal = durableSnapshot(store.getState());
    const postPushLocal = latestLocal.updatedAt > consistentState.updatedAt
      ? { ...latestLocal, updatedAt: snapshot.updatedAt + 1 }
      : latestLocal;
    const reconciledSnapshot = mergeDurableSnapshotForPush(snapshot, postPushLocal);
    store.getState().applyRemotePatch({
      ...reconciledSnapshot,
      updatedAt: Math.max(store.getState().updatedAt, reconciledSnapshot.updatedAt),
    });
    const uploadedById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const currentReceipts = store.getState().receipts.map((receipt) => {
      const uploaded = uploadedById.get(receipt.id);
      return uploaded?.imagePath && uploaded.imageUri === receipt.imageUri
        ? { ...receipt, imagePath: uploaded.imagePath }
        : receipt;
    });
    store.getState().applyRemotePatch({ receipts: currentReceipts });
  } catch (err) {
    if (__DEV__) console.warn('[Sync Engine] Offline or push failed.', err);
    // Receipt upload or upsert threw (e.g. offline mid-request) — keep retrying
    // on backoff so pending edits still reach other devices on reconnect.
    scheduleOfflineFlush();
  }
}

export async function pullFromSupabase(options?: { forceServerHydration?: boolean }): Promise<boolean> {
  const id = await householdId();
  if (!id) return true;
  const store = await durableStore();

  let data: { state: unknown; updated_at: number } | null;
  try {
    const result = await withTimeout(
      supabase.from(CLOUD_TABLE).select('state, updated_at').eq('household_id', id).maybeSingle(),
      PULL_TIMEOUT_MS,
    );
    if (result.error) return false;
    data = result.data;
  } catch (err) {
    // Stalled request — bail out so the debounced pull scheduler releases
    // and retries on the next realtime event, instead of hanging forever and
    // silently starving every pull after it.
    syncDiag('pull_timeout', { phase: 'select', message: err instanceof Error ? err.message : String(err) }); // DIAG: temporary — remove after OTA 389/390/391 investigation
    if (__DEV__) console.warn('[Sync Engine] pull select timed out or failed.', err);
    return false;
  }

  if (!data?.state) {
    initialHouseholdSyncComplete.add(id);
    const local = store.getState();
    if (local.items.length || local.stores.length || local.receipts.length || local.trips.length) {
      await pushLocalState({ ...durableSnapshot(local), updatedAt: Date.now() });
      return true;
    }

    const [{ data: items }, { data: stores }, { data: receipts }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('household_id', id),
      supabase.from('pantry_stores').select('*').eq('household_id', id),
      supabase.from('pantry_receipts').select('*').eq('household_id', id),
    ]);
    if (!items?.length && !stores?.length && !receipts?.length) return true;

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
    return true;
  }

  const remote = decodeShoppingState(data.state as DurableState);
  const remoteUpdatedAt = (remote.updatedAt ?? data.updated_at ?? 0) as number;
  const hasActiveSession = 'activeSession' in remote;

  const local = store.getState();
  const localUpdatedAt = local.updatedAt;
  const forceServerHydration = Boolean(options?.forceServerHydration)
    && !(await hasPersistedDurableState())
    && hasSharedSnapshotContent(remote);
  const freshInstallHydration = isFreshInstallState(local) && hasSharedSnapshotContent(remote);
  if (!forceServerHydration && !freshInstallHydration && !shouldApplyRemoteSnapshot(remoteUpdatedAt, localUpdatedAt)) {
    const reason = remoteSkipReason(remoteUpdatedAt, localUpdatedAt);
    syncDiag('pull_path', { path: 'fold_presign', remoteUpdatedAt, localUpdatedAt, reason }); // DIAG
    if (__DEV__) console.log(`[Shopping Sync] active_session_reconcile_skipped reason=${reason} version/updatedAt=${remoteUpdatedAt} localUpdatedAt=${localUpdatedAt}`);
    initialHouseholdSyncComplete.add(id);
    // The whole-snapshot watermark rejects this remote (its top-level updatedAt
    // is not newer than ours). But the per-item merge is non-destructive, so
    // still fold in any items/tombstones the other device has that we are
    // missing — this recovers items added on another device whose snapshot lost
    // the wall-clock timestamp race (clock skew). Our own updatedAt is preserved
    // so folding does not itself churn the watermark.
    // Also fold the active session through the same gated, per-entry merge used
    // on the apply path (gateRemoteActiveSession/mergeShoppingEntries) — without
    // this, a stale watermark permanently skips reconciling the active trip even
    // though the item fold above already recovers regular pantry edits. Guarded
    // by hasActiveSession so an old snapshot that pre-dates this field can never
    // be mistaken for "no session" and clear an in-progress local trip.
    if (!isSelfEcho(remoteUpdatedAt)) {
      const folded = mergeDurableSnapshotForPush(remote, durableSnapshot(store.getState()));
      store.getState().applyRemotePatch({
        ...folded,
        ...(hasActiveSession ? {
          activeSession: folded.activeSession
            ? reconcileShoppingSession(folded.activeSession, folded.items)
            : null,
        } : { activeSession: store.getState().activeSession }),
        updatedAt: store.getState().updatedAt,
      });
    }
    // The cloud snapshot is strictly older than this device's durable state
    // (e.g. edits made offline whose push never reached Supabase). Reconcile by
    // pushing the (now item-merged) local state up so other members converge on
    // it, instead of leaving the stale blob in the cloud. Equal timestamps mean
    // already-in-sync — no push, or realtime would fan out on every launch.
    const mergedLocal = durableSnapshot(store.getState());
    if (!isSelfEcho(remoteUpdatedAt) && (localUpdatedAt > remoteUpdatedAt || hasLocalSyncContribution(remote, mergedLocal))) {
      if (__DEV__) console.log(`[Shopping Sync] stale_remote_reconcile_push localUpdatedAt=${localUpdatedAt} remoteUpdatedAt=${remoteUpdatedAt}`);
      await pushLocalState(mergedLocal);
    }
    return true;
  }

  if (hasActiveSession) {
    const { itemCount, pickedCount, sessionId } = activeSessionStats(remote);
    if (__DEV__) console.log(`[Shopping Sync] remote_active_session_snapshot_received version/updatedAt=${remoteUpdatedAt} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
  }
  if (hasActiveSession && !remote.activeSession && __DEV__) console.log('[Shopping Sync] remote_trip_end_received');
  const signedRemote = await withSignedReceiptUrls(remote);
  const reconciledRemote: DurableState = {
    ...signedRemote,
    activeSession: signedRemote.activeSession
      ? reconcileShoppingSession(signedRemote.activeSession, signedRemote.items)
      : null,
  };
  // Local state may have advanced while signed URLs were being fetched (a
  // user edit or a concurrent pull) — re-check so a now-stale snapshot cannot
  // clobber it after the await.
  const current = store.getState();
  const stillFreshInstallHydration = isFreshInstallState(current) && hasSharedSnapshotContent(remote);
  if (!forceServerHydration && !stillFreshInstallHydration && !shouldApplyRemoteSnapshot(remoteUpdatedAt, current.updatedAt)) {
    syncDiag('pull_path', { path: 'fold_postsign', remoteUpdatedAt, localUpdatedAt: current.updatedAt }); // DIAG
    if (__DEV__) console.log(`[Shopping Sync] active_session_reconcile_skipped reason=${remoteSkipReason(remoteUpdatedAt, store.getState().updatedAt)} version/updatedAt=${remoteUpdatedAt} phase=post_sign`);
    // Non-destructive item/tombstone/active-session fold even when the
    // whole-snapshot watermark rejects — same rationale as the pre-sign skip
    // above.
    if (!isSelfEcho(remoteUpdatedAt)) {
      const folded = mergeDurableSnapshotForPush(reconciledRemote, durableSnapshot(store.getState()));
      store.getState().applyRemotePatch({
        ...folded,
        ...(hasActiveSession
          ? { activeSession: folded.activeSession }
          : { activeSession: store.getState().activeSession }),
        updatedAt: store.getState().updatedAt,
      });
    }
    const mergedLocal = durableSnapshot(store.getState());
    if (!isSelfEcho(remoteUpdatedAt) && (mergedLocal.updatedAt > remoteUpdatedAt || hasLocalSyncContribution(reconciledRemote, mergedLocal))) {
      await pushLocalState(mergedLocal);
    }
    return true;
  }
  syncDiag('pull_path', { path: 'full_apply', remoteUpdatedAt, localUpdatedAt: current.updatedAt }); // DIAG
  store.getState().applyRemotePatch(reconciledRemote);
  initialHouseholdSyncComplete.add(id);
  if (hasActiveSession && __DEV__) console.log('[Shopping Sync] local_state_reconciled');
  if (!isSelfEcho(remoteUpdatedAt)) {
    markRemoteApplied(remoteUpdatedAt);
  }
  return true;
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

  await pullFromSupabase({ forceServerHydration: true });

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
      (payload) => {
        syncDiag('realtime_recv', { eventType: payload.eventType }); // DIAG
        if (__DEV__) console.log(`[Shopping Sync] realtime_snapshot_event event=${payload.eventType} householdId=${id}`);
        if (payload.eventType === 'DELETE') {
          // The snapshot row disappearing usually means the owning account
          // was deleted on another device (ON DELETE CASCADE from
          // auth.users) — confirm via a live auth check instead of silently
          // re-syncing (which would otherwise just re-push local state back
          // up). Dynamic import avoids a store/store circular dependency.
          void import('../../store/auth-store').then(({ useAuthStore }) => {
            void useAuthStore.getState().refreshUser();
          });
        }
        realtimePullScheduler.schedule();
      },
    )
    .subscribe((status, error) => {
      if (activeHouseholdId !== id) return;
      if (status === 'SUBSCRIBED') {
        realtimePullScheduler.schedule();
      }
      if (__DEV__) console.log(`[Shopping Sync] realtime_subscription_status status=${status} householdId=${id}${error ? ` error=${error.message}` : ''}`);
    });
  realtimeFallbackScheduler.start();
}

export function stopSyncEngine(): void {
  realtimeFallbackScheduler.stop();
  realtimePullScheduler.cancel();
  if (syncChannel) void supabase.removeChannel(syncChannel);
  syncChannel = null;
  activeHouseholdId = null;
  initialHouseholdSyncComplete.clear();
  resetSyncWatermark();
}

export async function refreshGeofencedStoreData(): Promise<void> {
  const { isGeofencingRunning, startGeofencing } = await import('./geofencing');
  if (await isGeofencingRunning()) {
    const { stores, items } = (await durableStore()).getState();
    await startGeofencing(stores, items);
  }
}
