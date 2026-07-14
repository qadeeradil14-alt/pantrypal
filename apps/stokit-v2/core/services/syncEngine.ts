import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import type { DurableState, Receipt } from '../../types';
import { emptyDurableState } from '../repositories/durableRepository';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
  replicaEnvelopeDigest,
  syncStateDigest,
  type SyncMergeDecision,
} from './replicaSync';
import { reconcileShoppingSession } from './shoppingEntrySync';
import { resetSyncWatermark } from './syncWatermark';
import { runObservedOperation, setCrashContext } from './crashReporter';

const LEGACY_CLOUD_TABLE = 'household_snapshots';
const REPLICA_TABLE = 'household_sync_replicas';
const RECEIPT_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

type SyncContext = { householdId: string; userId: string };
type ReplicaRow = {
  user_id: string;
  replica_id: string;
  state: DurableState;
  client_clock: number;
  updated_at: string;
};

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHouseholdId: string | null = null;
let pushRequested = false;
let pushDrain: Promise<void> | null = null;
let pushRetryOptions: { isDeferredRetry?: boolean } | undefined;
let deferredRetryScheduled = false;
let pullRequested = false;
let syncPullQueue: Promise<void> | null = null;

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
  return householdId ? { householdId, userId: session.user.id } : null;
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
  const latest = durableSnapshot(store.getState());
  const replicaId = latest.syncMeta?.replicaId;
  if (!replicaId) return initializeReplicaState(latest, `replica-${Date.now().toString(36)}`);

  const receipts = await Promise.all(latest.receipts.map((receipt) => uploadReceipt(context.householdId, receipt)));
  const activeReceipts = latest.activeSession
    ? await Promise.all(latest.activeSession.receipts.map((receipt) => uploadReceipt(context.householdId, receipt)))
    : [];
  const uploaded = {
    ...latest,
    receipts,
    activeSession: latest.activeSession ? { ...latest.activeSession, receipts: activeReceipts } : null,
  };
  const prepared = syncStateDigest(uploaded) === syncStateDigest(latest)
    ? latest
    : recordLocalMutation(latest, uploaded, replicaId, 'receipt.upload');
  if (prepared !== latest) store.getState().applyRemotePatch(prepared);
  return prepared;
}

async function pushLatestReplica(options?: { isDeferredRetry?: boolean }): Promise<void> {
  setCrashContext({ operation: 'sync.push' });
  const context = await syncContext();
  if (!context) return;
  const prepared = await prepareLatestState(context);
  const snapshot = cloudSnapshot(prepared);
  const replicaId = snapshot.syncMeta!.replicaId;
  let error: { message: string } | null = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const result = await supabase.from(REPLICA_TABLE).upsert({
      household_id: context.householdId,
      user_id: context.userId,
      replica_id: replicaId,
      state: snapshot,
      client_clock: snapshot.syncMeta!.clock,
    }, { onConflict: 'household_id,user_id,replica_id' });
    error = result.error;
    if (!error) break;
    if (__DEV__) console.warn(`[Sync] replica.push attempt=${attempt} device=${replicaId} sequence=${snapshot.syncMeta!.clock} reason=${error.message}`);
    if (attempt < RETRY_ATTEMPTS) await retryDelay(attempt);
  }

  if (error) {
    if (!options?.isDeferredRetry && !deferredRetryScheduled) {
      deferredRetryScheduled = true;
      setTimeout(() => {
        deferredRetryScheduled = false;
        void runObservedOperation('sync.retry', async () => {
          const store = await durableStore();
          await pushLocalState(durableSnapshot(store.getState()), { isDeferredRetry: true });
        });
      }, RETRY_BASE_DELAY_MS * (RETRY_ATTEMPTS + 1));
    }
    return;
  }

  deferredRetryScheduled = false;
  const stats = activeSessionStats(snapshot);
  if (__DEV__) console.log(`[Sync] replica.push accepted entity=state operation=upsert timestamp=${snapshot.updatedAt} device=${replicaId} sequence=${snapshot.syncMeta!.clock} itemCount=${snapshot.items.length} sessionId=${stats.sessionId} pickedCount=${stats.pickedCount}`);
}

export function pushLocalState(
  _state: DurableState,
  options?: { isDeferredRetry?: boolean },
): Promise<void> {
  pushRequested = true;
  pushRetryOptions = options;
  if (!pushDrain) {
    pushDrain = (async () => {
      while (pushRequested) {
        pushRequested = false;
        const nextOptions = pushRetryOptions;
        pushRetryOptions = undefined;
        await pushLatestReplica(nextOptions);
      }
    })().finally(() => { pushDrain = null; });
  }
  return pushDrain;
}

function logMergeDecision(decision: SyncMergeDecision): void {
  if (!__DEV__) return;
  console.log(`[Sync] merge entity=${decision.entityId} operation=${decision.operation} device=${decision.originatingDevice} sequence=${decision.sequence} decision=accept reason=${decision.reason}`);
}

async function pullLatestReplicas(): Promise<void> {
  setCrashContext({ operation: 'sync.pull' });
  const context = await syncContext();
  if (!context) return;
  const store = await durableStore();
  const local = durableSnapshot(store.getState());
  const localReplicaId = local.syncMeta?.replicaId ?? `replica-${Date.now().toString(36)}`;
  const [{ data: replicaRows, error: replicaError }, { data: legacyRow }] = await Promise.all([
    supabase
      .from(REPLICA_TABLE)
      .select('user_id, replica_id, state, client_clock, updated_at')
      .eq('household_id', context.householdId),
    supabase
      .from(LEGACY_CLOUD_TABLE)
      .select('state, updated_at')
      .eq('household_id', context.householdId)
      .maybeSingle(),
  ]);
  if (replicaError) {
    if (__DEV__) console.warn(`[Sync] replica.pull reason=${replicaError.message}`);
    return;
  }

  const rows = (replicaRows ?? []) as ReplicaRow[];
  let merged: DurableState;
  if (rows.length === 0) {
    const legacy = legacyRow?.state as DurableState | undefined;
    const baseline = legacy && Number(legacy.updatedAt ?? legacyRow?.updated_at ?? 0) > local.updatedAt
      ? legacy
      : local;
    merged = initializeReplicaState(baseline, localReplicaId);
  } else {
    merged = mergeReplicaStates(
      [local, ...rows.map((row) => row.state)],
      localReplicaId,
      logMergeDecision,
    );
  }

  const reconciled = merged.activeSession
    ? { ...merged, activeSession: reconcileShoppingSession(merged.activeSession, merged.items) }
    : merged;
  if (syncStateDigest(reconciled) !== syncStateDigest(merged)) {
    merged = recordLocalMutation(merged, reconciled, localReplicaId, 'shopping.reconcile');
  } else {
    merged = reconciled;
  }

  const ownRow = rows.find((row) => row.user_id === context.userId && row.replica_id === localReplicaId);
  const localChanged = syncStateDigest(local) !== syncStateDigest(merged)
    || replicaEnvelopeDigest(local) !== replicaEnvelopeDigest(merged);
  if (localChanged) {
    const signed = await withSignedReceiptUrls(merged);
    store.getState().applyRemotePatch(signed);
    if (__DEV__) console.log(`[Sync] replica.pull applied entity=state operation=merge timestamp=${merged.updatedAt} device=${localReplicaId} sequence=${merged.syncMeta!.clock} reason=deterministic_replica_merge`);
  }

  if (!ownRow || replicaEnvelopeDigest(ownRow.state) !== replicaEnvelopeDigest(merged)) {
    await pushLocalState(merged);
  }
}

export function pullFromSupabase(): Promise<void> {
  pullRequested = true;
  if (!syncPullQueue) {
    syncPullQueue = (async () => {
      while (pullRequested) {
        pullRequested = false;
        await pullLatestReplicas();
      }
    })().finally(() => { syncPullQueue = null; });
  }
  return syncPullQueue;
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
    await Promise.all([
      supabase.from(LEGACY_CLOUD_TABLE).delete().eq('household_id', context.householdId),
      supabase.storage.from(RECEIPT_BUCKET).remove(
        current.receipts.map((receipt) => receipt.imagePath).filter((path): path is string => Boolean(path)),
      ),
    ]);
  }
  return cleared;
}

export async function startSyncEngine(): Promise<void> {
  const context = await syncContext();
  if (!context || activeHouseholdId === context.householdId) return;
  stopSyncEngine();
  activeHouseholdId = context.householdId;

  syncChannel = supabase
    .channel(`household-replicas:${context.householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: REPLICA_TABLE,
        filter: `household_id=eq.${context.householdId}`,
      },
      () => { void runObservedOperation('sync.realtime', pullFromSupabase); },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void runObservedOperation('sync.subscribed', pullFromSupabase);
    });
}

export function stopSyncEngine(): void {
  if (syncChannel) void runObservedOperation('sync.unsubscribe', async () => {
    await supabase.removeChannel(syncChannel!);
  });
  syncChannel = null;
  activeHouseholdId = null;
  resetSyncWatermark();
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
