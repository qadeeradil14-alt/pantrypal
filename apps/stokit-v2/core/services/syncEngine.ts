import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { supabase } from '../../lib/supabase';
import type { DurableState, Receipt } from '../../types';
import { emptyDurableState } from '../repositories/durableRepository';
import {
  isCanonicalState,
  mergeCanonicalSources,
  shouldProcessRealtimeRevision,
} from './canonicalSync';
import { runObservedOperation, setCrashContext } from './crashReporter';
import {
  initializeReplicaState,
  recordLocalMutation,
  replicaEnvelopeDigest,
  syncStateDigest,
} from './replicaSync';
import { reconcileShoppingSession } from './shoppingEntrySync';

const CANONICAL_CLOUD_TABLE = 'household_snapshots';
const REPLICA_TABLE = 'household_sync_replicas';
const RECEIPT_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

type SyncContext = { householdId: string };
type CanonicalRow = { state: DurableState; updated_at: number };
type ReplicaRow = { state: DurableState };
type RealtimeCanonicalRecord = { updated_at?: number };

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHouseholdId: string | null = null;
let canonicalSyncRequested = false;
let canonicalSyncQueue: Promise<void> | null = null;
let canonicalRetryOptions: { isDeferredRetry?: boolean } | undefined;
let deferredRetryScheduled = false;
let lastAppliedRevision = 0;

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
}

function activeSessionStats(state: DurableState): { itemCount: number; pickedCount: number; sessionId: string } {
  const entries = state.activeSession?.entries ?? [];
  return {
    itemCount: entries.length,
    pickedCount: entries.filter((entry) => entry.picked).length,
    sessionId: state.activeSession?.tripId ?? 'none',
  };
}

function shoppingSyncTrace(
  operation: string,
  state: DurableState,
  details: Record<string, string | number | null> = {},
): void {
  const stats = activeSessionStats(state);
  const fields = Object.entries({
    operation,
    sessionId: stats.sessionId,
    sessionStatus: state.activeSession?.status ?? 'idle',
    currentStore: state.activeSession?.storeQueue[state.activeSession.currentIndex] ?? 'none',
    sequence: state.syncMeta?.clock ?? 0,
    device: state.syncMeta?.replicaId ?? 'unknown',
    ...details,
  }).map(([key, value]) => `${key}=${value ?? 'none'}`);
  console.log(`[Shopping Sync] ${fields.join(' ')}`);
}

async function durableStore() {
  return (await import('../../store/durable-store')).useDurableStore;
}

function durableSnapshot(state: DurableState): DurableState {
  return {
    items: state.items,
    stores: state.stores,
    priceHistory: state.priceHistory,
    receipts: state.receipts,
    trips: state.trips,
    activity: state.activity,
    prefs: state.prefs,
    activeSession: state.activeSession,
    updatedAt: state.updatedAt,
    syncMeta: state.syncMeta,
  };
}

function cloudReceipt(receipt: Receipt): Receipt {
  if (receipt.imagePath) return { ...receipt, imageUri: null };
  return receipt.imageUri?.startsWith('file://') ? { ...receipt, imageUri: null } : receipt;
}

function cloudSnapshot(state: DurableState): DurableState {
  return {
    ...durableSnapshot(state),
    receipts: state.receipts.map(cloudReceipt),
    activeSession: state.activeSession
      ? { ...state.activeSession, receipts: state.activeSession.receipts.map(cloudReceipt) }
      : null,
  };
}

async function syncContext(): Promise<SyncContext | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const householdStore = (await import('../../store/household-store')).useHouseholdStore;
  if (!householdStore.getState().household) await householdStore.getState().ensureHousehold();
  const householdId = householdStore.getState().household?.id;
  return householdId ? { householdId } : null;
}

async function withSignedReceiptUrls(state: DurableState): Promise<DurableState> {
  const sign = async (receipt: Receipt): Promise<Receipt> => {
    if (!receipt.imagePath) return receipt;
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(receipt.imagePath, SIGNED_URL_TTL_SECONDS);
    return error ? receipt : { ...receipt, imageUri: data.signedUrl };
  };
  return {
    ...state,
    receipts: await Promise.all(state.receipts.map(sign)),
    activeSession: state.activeSession
      ? { ...state.activeSession, receipts: await Promise.all(state.activeSession.receipts.map(sign)) }
      : null,
  };
}

async function uploadReceipt(householdId: string, receipt: Receipt): Promise<Receipt> {
  if (!receipt.imageUri?.startsWith('file://')) return receipt;
  const ext = receipt.imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const imagePath = `${householdId}/${receipt.id}.${ext}`;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const base64 = await new File(receipt.imageUri).base64();
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(
        imagePath,
        decode(base64),
        { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true },
      );
      if (!error) return { ...receipt, imagePath };
      if (__DEV__) console.warn(`[Sync] receipt.upload attempt=${attempt} entity=${receipt.id} reason=${error.message}`);
    } catch (error) {
      if (__DEV__) console.warn(`[Sync] receipt.upload attempt=${attempt} entity=${receipt.id}`, error);
    }
    if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
  }
  return receipt;
}

async function prepareLatestState(context: SyncContext): Promise<DurableState> {
  const store = await durableStore();
  const initial = durableSnapshot(store.getState());
  const uploadedReceipts = await Promise.all(initial.receipts.map((receipt) => uploadReceipt(context.householdId, receipt)));
  const uploadedActiveReceipts = initial.activeSession
    ? await Promise.all(initial.activeSession.receipts.map((receipt) => uploadReceipt(context.householdId, receipt)))
    : [];
  const paths = new Map<string, string>();
  for (const receipt of uploadedReceipts) if (receipt.imagePath) paths.set(receipt.id, receipt.imagePath);
  for (const receipt of uploadedActiveReceipts) if (receipt.imagePath) paths.set(receipt.id, receipt.imagePath);

  const latest = durableSnapshot(store.getState());
  const replicaId = latest.syncMeta?.replicaId ?? `replica-${Date.now().toString(36)}`;
  const initialized = initializeReplicaState(latest, replicaId);
  const uploaded: DurableState = {
    ...initialized,
    receipts: initialized.receipts.map((receipt) => paths.has(receipt.id)
      ? { ...receipt, imagePath: paths.get(receipt.id)! }
      : receipt),
    activeSession: initialized.activeSession
      ? {
          ...initialized.activeSession,
          receipts: initialized.activeSession.receipts.map((receipt) => paths.has(receipt.id)
            ? { ...receipt, imagePath: paths.get(receipt.id)! }
            : receipt),
        }
      : null,
  };
  const prepared = syncStateDigest(uploaded) === syncStateDigest(initialized)
    ? initialized
    : recordLocalMutation(initialized, uploaded, replicaId, 'receipt.upload');
  if (replicaEnvelopeDigest(prepared) !== replicaEnvelopeDigest(latest)) {
    store.getState().applyRemotePatch(prepared);
  }
  return prepared;
}

function reconcileState(state: DurableState, replicaId: string): DurableState {
  if (!state.activeSession) return state;
  const reconciled = { ...state, activeSession: reconcileShoppingSession(state.activeSession, state.items) };
  return syncStateDigest(reconciled) === syncStateDigest(state)
    ? state
    : recordLocalMutation(state, reconciled, replicaId, 'shopping.reconcile');
}

async function readCanonical(context: SyncContext): Promise<{
  row: CanonicalRow | null;
  migrationReplicas: DurableState[];
}> {
  const { data, error } = await supabase
    .from(CANONICAL_CLOUD_TABLE)
    .select('state, updated_at')
    .eq('household_id', context.householdId)
    .maybeSingle();
  if (error) throw error;
  const row = data ? data as CanonicalRow : null;
  if (isCanonicalState(row?.state)) return { row, migrationReplicas: [] };

  const { data: replicaRows, error: replicaError } = await supabase
    .from(REPLICA_TABLE)
    .select('state')
    .eq('household_id', context.householdId);
  if (replicaError) throw replicaError;
  return {
    row,
    migrationReplicas: ((replicaRows ?? []) as ReplicaRow[]).map((replica) => replica.state),
  };
}

async function compareAndSwapCanonical(
  context: SyncContext,
  observedRevision: number | null,
  state: DurableState,
  revision: number,
): Promise<boolean> {
  if (observedRevision == null) {
    const { data, error } = await supabase
      .from(CANONICAL_CLOUD_TABLE)
      .insert({ household_id: context.householdId, state, updated_at: revision })
      .select('updated_at')
      .maybeSingle();
    if (error?.code === '23505') return false;
    if (error) throw error;
    return Boolean(data);
  }

  const { data, error } = await supabase
    .from(CANONICAL_CLOUD_TABLE)
    .update({ state, updated_at: revision })
    .eq('household_id', context.householdId)
    .eq('updated_at', observedRevision)
    .select('updated_at')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function applyCanonicalState(
  committed: DurableState,
  revision: number,
  localReplicaId: string,
): Promise<boolean> {
  lastAppliedRevision = Math.max(lastAppliedRevision, revision);
  const store = await durableStore();
  const current = durableSnapshot(store.getState());
  const merged = reconcileState(
    mergeCanonicalSources(current, committed, [], localReplicaId),
    localReplicaId,
  );
  const needsFollowup = syncStateDigest(merged) !== syncStateDigest(committed)
    || replicaEnvelopeDigest(merged) !== replicaEnvelopeDigest(committed);
  const signed = await withSignedReceiptUrls(merged);
  store.getState().applyRemotePatch(signed);
  return needsFollowup;
}

async function convergeCanonical(options?: { isDeferredRetry?: boolean }): Promise<void> {
  setCrashContext({ operation: 'sync.canonical' });
  const context = await syncContext();
  if (!context) return;
  await prepareLatestState(context);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const store = await durableStore();
      const local = durableSnapshot(store.getState());
      const localReplicaId = local.syncMeta?.replicaId ?? `replica-${Date.now().toString(36)}`;
      const { row, migrationReplicas } = await readCanonical(context);
      const observedRevision = row ? Number(row.updated_at) : null;
      let merged = mergeCanonicalSources(local, row?.state ?? null, migrationReplicas, localReplicaId);
      merged = reconcileState(merged, localReplicaId);
      const remoteIsCanonical = isCanonicalState(row?.state);
      const remoteMatches = remoteIsCanonical
        && syncStateDigest(row.state) === syncStateDigest(merged)
        && replicaEnvelopeDigest(row.state) === replicaEnvelopeDigest(merged);

      if (remoteMatches && observedRevision != null) {
        const needsFollowup = await applyCanonicalState(merged, observedRevision, localReplicaId);
        if (needsFollowup) canonicalSyncRequested = true;
        deferredRetryScheduled = false;
        return;
      }

      const revision = Math.max(Date.now(), (observedRevision ?? 0) + 1, merged.updatedAt + 1);
      const committed = cloudSnapshot({ ...merged, updatedAt: revision });
      if (!await compareAndSwapCanonical(context, observedRevision, committed, revision)) {
        if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
        continue;
      }

      lastAppliedRevision = revision;
      const needsFollowup = await applyCanonicalState(committed, revision, localReplicaId);
      if (needsFollowup) canonicalSyncRequested = true;
      deferredRetryScheduled = false;
      const stats = activeSessionStats(committed);
      if (__DEV__) console.log(`[Sync] canonical.commit revision=${revision} device=${localReplicaId} sequence=${committed.syncMeta?.clock ?? 0} itemCount=${committed.items.length} sessionId=${stats.sessionId} pickedCount=${stats.pickedCount}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
    }
  }

  if (__DEV__) console.warn('[Sync] canonical convergence failed', lastError);
  if (!options?.isDeferredRetry && !deferredRetryScheduled) {
    deferredRetryScheduled = true;
    setTimeout(() => {
      deferredRetryScheduled = false;
      void runObservedOperation('sync.retry', () => requestCanonicalSync({ isDeferredRetry: true }));
    }, RETRY_BASE_DELAY_MS * (RETRY_ATTEMPTS + 1));
  }
}

function requestCanonicalSync(options?: { isDeferredRetry?: boolean }): Promise<void> {
  canonicalSyncRequested = true;
  canonicalRetryOptions = options;
  if (!canonicalSyncQueue) {
    canonicalSyncQueue = (async () => {
      while (canonicalSyncRequested) {
        canonicalSyncRequested = false;
        const nextOptions = canonicalRetryOptions;
        canonicalRetryOptions = undefined;
        await convergeCanonical(nextOptions);
      }
    })().finally(() => { canonicalSyncQueue = null; });
  }
  return canonicalSyncQueue;
}

export function pushLocalState(
  _state: DurableState,
  options?: { isDeferredRetry?: boolean },
): Promise<void> {
  return requestCanonicalSync(options);
}

export function pullFromSupabase(): Promise<void> {
  return requestCanonicalSync();
}

export async function clearCloudState(): Promise<DurableState> {
  const context = await syncContext();
  const store = await durableStore();
  const current = durableSnapshot(store.getState());
  const replicaId = current.syncMeta?.replicaId ?? `replica-${Date.now().toString(36)}`;
  const cleared = recordLocalMutation(
    initializeReplicaState(current, replicaId),
    { ...emptyDurableState, prefs: { ...emptyDurableState.prefs }, updatedAt: Date.now() },
    replicaId,
    'state.clear',
  );
  store.getState().applyRemotePatch(cleared);
  await pushLocalState(cleared);
  if (context) {
    await supabase.storage.from(RECEIPT_BUCKET).remove(
      current.receipts.map((receipt) => receipt.imagePath).filter((path): path is string => Boolean(path)),
    );
  }
  return cleared;
}

export async function startSyncEngine(): Promise<void> {
  const context = await syncContext();
  if (!context || activeHouseholdId === context.householdId) return;
  stopSyncEngine();
  activeHouseholdId = context.householdId;
  await pullFromSupabase();

  syncChannel = supabase
    .channel(`household-canonical:${context.householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: CANONICAL_CLOUD_TABLE,
        filter: `household_id=eq.${context.householdId}`,
      },
      (payload) => {
        const record = payload.new as RealtimeCanonicalRecord | undefined;
        const revision = Number(record?.updated_at ?? 0);
        if (!shouldProcessRealtimeRevision(revision, lastAppliedRevision)) return;
        void runObservedOperation('sync.realtime', async () => {
          const store = await durableStore();
          shoppingSyncTrace('realtime.received', durableSnapshot(store.getState()), { revision });
          await pullFromSupabase();
        });
      },
    )
    .subscribe((status) => {
      const traceSubscription = async () => {
        const store = await durableStore();
        shoppingSyncTrace('realtime.subscription', durableSnapshot(store.getState()), { status });
        if (status === 'SUBSCRIBED') await pullFromSupabase();
      };
      void runObservedOperation(status === 'SUBSCRIBED' ? 'sync.subscribed' : 'sync.subscription', traceSubscription);
    });
}

export function stopSyncEngine(): void {
  if (syncChannel) {
    const channel = syncChannel;
    void runObservedOperation('sync.unsubscribe', () => supabase.removeChannel(channel));
  }
  syncChannel = null;
  activeHouseholdId = null;
  lastAppliedRevision = 0;
}

export async function refreshGeofencedStoreData(): Promise<void> {
  await runObservedOperation('geofencing.refresh', async () => {
    const { isGeofencingRunning, startGeofencing } = await import('./geofencing');
    if (await isGeofencingRunning()) {
      const { stores, items } = (await durableStore()).getState();
      await startGeofencing(stores, items);
    }
  });
}
