import type {
  DurableState,
  DurableSyncMetadata,
  SharedShoppingSession,
  SyncEntityCollection,
  SyncStamp,
} from '../../types';
import { normalizeShoppingSession } from './shoppingLifecycle';

const COLLECTIONS: SyncEntityCollection[] = [
  'items',
  'stores',
  'priceHistory',
  'receipts',
  'trips',
  'activity',
];

type Entity = { id: string };

export type SyncMergeDecision = {
  entityId: string;
  operation: 'accept' | 'delete';
  sequence: number;
  originatingDevice: string;
  reason: 'higher_lamport_clock' | 'replica_tiebreak' | 'tombstone_wins';
};

function emptyEntityMaps(): Record<SyncEntityCollection, Record<string, SyncStamp>> {
  return {
    items: {},
    stores: {},
    priceHistory: {},
    receipts: {},
    trips: {},
    activity: {},
  };
}

function cloneMetadata(meta: DurableSyncMetadata, replicaId: string): DurableSyncMetadata {
  return {
    ...meta,
    replicaId,
    entities: Object.fromEntries(COLLECTIONS.map((key) => [key, { ...meta.entities[key] }])) as DurableSyncMetadata['entities'],
    tombstones: Object.fromEntries(COLLECTIONS.map((key) => [key, { ...meta.tombstones[key] }])) as DurableSyncMetadata['tombstones'],
    singletons: { ...meta.singletons },
    sessionEntries: { ...meta.sessionEntries },
    sessionEntryTombstones: { ...meta.sessionEntryTombstones },
    sessionReceipts: { ...meta.sessionReceipts },
    sessionReceiptTombstones: { ...meta.sessionReceiptTombstones },
    sessionTombstones: { ...(meta.sessionTombstones ?? {}) },
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function equalStamp(a: SyncStamp | undefined, b: SyncStamp | undefined): boolean {
  return Boolean(a && b && a.clock === b.clock && a.replicaId === b.replicaId);
}

function compareStamp(a: SyncStamp | undefined, b: SyncStamp | undefined): number {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  if (a.clock !== b.clock) return a.clock - b.clock;
  return a.replicaId.localeCompare(b.replicaId);
}

function sessionKey(session: SharedShoppingSession, entityId: string): string {
  return `${session.tripId ?? 'idle'}:${entityId}`;
}

function quarantinedSessionTripId(state: DurableState): string | null {
  if (state.syncMeta?.lastOperation?.operation !== 'shopping.invalid_session_quarantine') return null;
  const entityId = state.syncMeta.lastOperation.entityIds.find((id) => id.startsWith('shoppingSession:'));
  const tripId = entityId?.slice('shoppingSession:'.length) ?? '';
  return tripId || null;
}

function sessionStructure(session: SharedShoppingSession | null): unknown {
  if (!session) return null;
  const { entries: _entries, receipts: _receipts, removedItemIds: _removed, ...structure } = session;
  return structure;
}

function normalizeReceiptForSync<T extends { imagePath?: string | null; imageUri?: string | null }>(receipt: T): T {
  return receipt.imagePath ? { ...receipt, imageUri: null } : receipt;
}

function comparableEntity(collection: SyncEntityCollection, value: Entity): Entity {
  return collection === 'receipts'
    ? normalizeReceiptForSync(value as Entity & { imagePath?: string | null; imageUri?: string | null })
    : value;
}

function collectionValues(state: DurableState, collection: SyncEntityCollection): Entity[] {
  return (state[collection] as Entity[]).map((value) => comparableEntity(collection, value));
}

function stampAll(state: DurableState, replicaId: string): DurableSyncMetadata {
  const stamp = { clock: 1, replicaId };
  const entities = emptyEntityMaps();
  for (const collection of COLLECTIONS) {
    for (const value of collectionValues(state, collection)) entities[collection][value.id] = stamp;
  }
  const meta: DurableSyncMetadata = {
    schema: 1,
    replicaId,
    clock: 1,
    entities,
    tombstones: emptyEntityMaps(),
    singletons: { prefs: stamp, activeSession: stamp },
    sessionEntries: {},
    sessionEntryTombstones: {},
    sessionReceipts: {},
    sessionReceiptTombstones: {},
    sessionTombstones: {},
  };
  if (state.activeSession) {
    for (const entry of state.activeSession.entries) meta.sessionEntries[sessionKey(state.activeSession, entry.itemId)] = stamp;
    for (const receipt of state.activeSession.receipts) meta.sessionReceipts[sessionKey(state.activeSession, receipt.id)] = stamp;
    for (const itemId of state.activeSession.removedItemIds ?? []) {
      meta.sessionEntryTombstones[sessionKey(state.activeSession, itemId)] = stamp;
    }
  }
  return meta;
}

export function initializeReplicaState(state: DurableState, replicaId: string): DurableState {
  const normalizedSession = normalizeShoppingSession(state.activeSession);
  const invalidSession = state.activeSession != null && normalizedSession == null;
  const invalidatedTripId = invalidSession && typeof state.activeSession?.tripId === 'string'
    ? state.activeSession.tripId
    : null;
  const normalizedState = { ...state, activeSession: normalizedSession };
  const meta = state.syncMeta
    ? cloneMetadata(state.syncMeta, replicaId)
    : stampAll(normalizedState, replicaId);
  if (invalidSession) {
    meta.clock += 1;
    const stamp = { clock: meta.clock, replicaId };
    meta.singletons.activeSession = stamp;
    if (invalidatedTripId) meta.sessionTombstones![invalidatedTripId] = stamp;
    meta.lastOperation = {
      operation: 'shopping.invalid_session_quarantine',
      at: Date.now(),
      sequence: meta.clock,
      entityIds: invalidatedTripId ? [`shoppingSession:${invalidatedTripId}`] : ['activeSession'],
    };
  }
  return {
    ...normalizedState,
    syncMeta: meta,
  };
}

export function recordLocalMutation(
  previous: DurableState,
  current: DurableState,
  replicaId: string,
  operation: string,
): DurableState {
  const baseline = initializeReplicaState(previous, replicaId);
  const meta = cloneMetadata(baseline.syncMeta!, replicaId);
  const changedIds: string[] = [];
  const nextStamp = (entityId: string): SyncStamp => {
    meta.clock += 1;
    changedIds.push(entityId);
    return { clock: meta.clock, replicaId };
  };

  for (const collection of COLLECTIONS) {
    const before = new Map(collectionValues(baseline, collection).map((value) => [value.id, value]));
    const after = new Map(collectionValues(current, collection).map((value) => [value.id, value]));
    for (const [id, value] of after) {
      if (stableStringify(value) !== stableStringify(before.get(id))) {
        meta.entities[collection][id] = nextStamp(`${collection}:${id}`);
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) meta.tombstones[collection][id] = nextStamp(`${collection}:${id}`);
    }
  }

  if (stableStringify(baseline.prefs) !== stableStringify(current.prefs)) {
    meta.singletons.prefs = nextStamp('prefs');
  }
  if (stableStringify(sessionStructure(baseline.activeSession)) !== stableStringify(sessionStructure(current.activeSession))) {
    meta.singletons.activeSession = nextStamp('activeSession');
  }

  const beforeSession = baseline.activeSession;
  const afterSession = current.activeSession;
  if (beforeSession?.tripId && beforeSession.tripId !== afterSession?.tripId) {
    meta.sessionTombstones![beforeSession.tripId] = nextStamp(`shoppingSession:${beforeSession.tripId}`);
  }
  if (afterSession) {
    const beforeEntries = beforeSession?.tripId === afterSession.tripId
      ? new Map(beforeSession.entries.map((entry) => [entry.itemId, entry]))
      : new Map<string, typeof afterSession.entries[number]>();
    const afterEntries = new Map(afterSession.entries.map((entry) => [entry.itemId, entry]));
    for (const [id, entry] of afterEntries) {
      if (stableStringify(entry) !== stableStringify(beforeEntries.get(id))) {
        meta.sessionEntries[sessionKey(afterSession, id)] = nextStamp(`sessionEntry:${id}`);
      }
    }
    for (const id of beforeEntries.keys()) {
      if (!afterEntries.has(id)) meta.sessionEntryTombstones[sessionKey(afterSession, id)] = nextStamp(`sessionEntry:${id}`);
    }
    for (const id of afterSession.removedItemIds ?? []) {
      if (!beforeSession?.removedItemIds?.includes(id)) {
        meta.sessionEntryTombstones[sessionKey(afterSession, id)] = nextStamp(`sessionEntry:${id}`);
      }
    }

    const beforeReceipts = beforeSession?.tripId === afterSession.tripId
      ? new Map(beforeSession.receipts.map((receipt) => [receipt.id, normalizeReceiptForSync(receipt)]))
      : new Map<string, typeof afterSession.receipts[number]>();
    const afterReceipts = new Map(afterSession.receipts.map((receipt) => [receipt.id, normalizeReceiptForSync(receipt)]));
    for (const [id, receipt] of afterReceipts) {
      if (stableStringify(receipt) !== stableStringify(beforeReceipts.get(id))) {
        meta.sessionReceipts[sessionKey(afterSession, id)] = nextStamp(`sessionReceipt:${id}`);
      }
    }
    for (const id of beforeReceipts.keys()) {
      if (!afterReceipts.has(id)) meta.sessionReceiptTombstones[sessionKey(afterSession, id)] = nextStamp(`sessionReceipt:${id}`);
    }
  }

  meta.lastOperation = {
    operation,
    at: Date.now(),
    sequence: meta.clock,
    entityIds: changedIds,
  };
  return { ...current, syncMeta: meta };
}

function maxMetadata(states: DurableState[], localReplicaId: string): DurableSyncMetadata {
  const initialized = states.map((state, index) => initializeReplicaState(state, state.syncMeta?.replicaId ?? `legacy-${index}`).syncMeta!);
  const combined = cloneMetadata(initialized[0], localReplicaId);
  for (const collection of COLLECTIONS) {
    combined.entities[collection] = {};
    combined.tombstones[collection] = {};
  }
  combined.singletons = {};
  combined.sessionEntries = {};
  combined.sessionEntryTombstones = {};
  combined.sessionReceipts = {};
  combined.sessionReceiptTombstones = {};
  combined.sessionTombstones = {};
  combined.clock = 0;

  const mergeMap = (target: Record<string, SyncStamp>, source: Record<string, SyncStamp>) => {
    for (const [id, stamp] of Object.entries(source)) {
      if (compareStamp(stamp, target[id]) > 0) target[id] = stamp;
      combined.clock = Math.max(combined.clock, stamp.clock);
    }
  };
  for (const meta of initialized) {
    combined.clock = Math.max(combined.clock, meta.clock);
    for (const collection of COLLECTIONS) {
      mergeMap(combined.entities[collection], meta.entities[collection]);
      mergeMap(combined.tombstones[collection], meta.tombstones[collection]);
    }
    mergeMap(combined.singletons as Record<string, SyncStamp>, meta.singletons as Record<string, SyncStamp>);
    mergeMap(combined.sessionEntries, meta.sessionEntries);
    mergeMap(combined.sessionEntryTombstones, meta.sessionEntryTombstones);
    mergeMap(combined.sessionReceipts, meta.sessionReceipts);
    mergeMap(combined.sessionReceiptTombstones, meta.sessionReceiptTombstones);
    mergeMap(combined.sessionTombstones!, meta.sessionTombstones ?? {});
  }
  combined.replicaId = localReplicaId;
  delete combined.lastOperation;
  return combined;
}

function highestSingletonState(
  states: DurableState[],
  key: 'prefs' | 'activeSession',
): DurableState {
  return states.reduce((best, candidate) =>
    compareStamp(candidate.syncMeta?.singletons[key], best.syncMeta?.singletons[key]) > 0 ? candidate : best,
  );
}

function sortedCollection(collection: SyncEntityCollection, values: Entity[]): Entity[] {
  const timestamp = (value: Entity & Record<string, unknown>): number => {
    if (collection === 'priceHistory') return Number(value.paidAt ?? 0);
    if (collection === 'trips') return Number(value.completedAt ?? 0);
    return Number(value.createdAt ?? 0);
  };
  return [...values].sort((a, b) => timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
}

function matchingValue(
  states: DurableState[],
  collection: SyncEntityCollection,
  id: string,
  stamp: SyncStamp,
): Entity | null {
  for (const state of states) {
    if (!equalStamp(state.syncMeta?.entities[collection][id], stamp)) continue;
    const value = collectionValues(state, collection).find((entry) => entry.id === id);
    if (value) return value;
  }
  return null;
}

function mergeSession(states: DurableState[], meta: DurableSyncMetadata): SharedShoppingSession | null {
  let baseState = highestSingletonState(states, 'activeSession');
  let base = baseState.activeSession;
  if (!base) {
    const quarantinedTripId = quarantinedSessionTripId(baseState);
    if (!quarantinedTripId) return null;
    const preservedStates = states.filter((state) => {
      const tripId = state.activeSession?.tripId;
      return Boolean(tripId && tripId !== quarantinedTripId && !meta.sessionTombstones?.[tripId]);
    });
    if (preservedStates.length === 0) return null;
    baseState = highestSingletonState(preservedStates, 'activeSession');
    base = baseState.activeSession;
  }
  if (!base) return null;
  if (base.tripId && meta.sessionTombstones?.[base.tripId]) return null;
  const tripPrefix = `${base.tripId ?? 'idle'}:`;
  const entryIds = new Set<string>();
  const receiptIds = new Set<string>();
  for (const state of states) {
    for (const key of Object.keys(state.syncMeta?.sessionEntries ?? {})) if (key.startsWith(tripPrefix)) entryIds.add(key.slice(tripPrefix.length));
    for (const key of Object.keys(state.syncMeta?.sessionEntryTombstones ?? {})) if (key.startsWith(tripPrefix)) entryIds.add(key.slice(tripPrefix.length));
    for (const key of Object.keys(state.syncMeta?.sessionReceipts ?? {})) if (key.startsWith(tripPrefix)) receiptIds.add(key.slice(tripPrefix.length));
    for (const key of Object.keys(state.syncMeta?.sessionReceiptTombstones ?? {})) if (key.startsWith(tripPrefix)) receiptIds.add(key.slice(tripPrefix.length));
  }

  const entries = Array.from(entryIds).flatMap((id) => {
    const key = `${tripPrefix}${id}`;
    const valueStamp = meta.sessionEntries[key];
    const deleteStamp = meta.sessionEntryTombstones[key];
    if (!valueStamp || compareStamp(deleteStamp, valueStamp) >= 0) return [];
    for (const state of states) {
      if (!equalStamp(state.syncMeta?.sessionEntries[key], valueStamp) || state.activeSession?.tripId !== base.tripId) continue;
      const entry = state.activeSession.entries.find((candidate) => candidate.itemId === id);
      if (entry) return [entry];
    }
    return [];
  });
  const receipts = Array.from(receiptIds).flatMap((id) => {
    const key = `${tripPrefix}${id}`;
    const valueStamp = meta.sessionReceipts[key];
    const deleteStamp = meta.sessionReceiptTombstones[key];
    if (!valueStamp || compareStamp(deleteStamp, valueStamp) >= 0) return [];
    for (const state of states) {
      if (!equalStamp(state.syncMeta?.sessionReceipts[key], valueStamp) || state.activeSession?.tripId !== base.tripId) continue;
      const receipt = state.activeSession.receipts.find((candidate) => candidate.id === id);
      if (receipt) return [normalizeReceiptForSync(receipt)];
    }
    return [];
  });
  const baseOrder = new Map(base.entries.map((entry, index) => [entry.itemId, index]));
  entries.sort((a, b) => (baseOrder.get(a.itemId) ?? Number.MAX_SAFE_INTEGER) - (baseOrder.get(b.itemId) ?? Number.MAX_SAFE_INTEGER) || a.itemId.localeCompare(b.itemId));
  receipts.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const removedItemIds = Array.from(entryIds).filter((id) => {
    const key = `${tripPrefix}${id}`;
    return compareStamp(meta.sessionEntryTombstones[key], meta.sessionEntries[key]) >= 0;
  }).sort();
  const queue = new Set(base.storeQueue);
  for (const state of states) {
    if (state.activeSession?.tripId === base.tripId) for (const storeId of state.activeSession.storeQueue) queue.add(storeId);
  }
  return { ...base, storeQueue: Array.from(queue), entries, removedItemIds, receipts };
}

export function mergeReplicaStates(
  rawStates: DurableState[],
  localReplicaId: string,
  onDecision?: (decision: SyncMergeDecision) => void,
): DurableState {
  if (rawStates.length === 0) throw new Error('At least one replica state is required.');
  const states = rawStates.map((state, index) => initializeReplicaState(state, state.syncMeta?.replicaId ?? `legacy-${index}`));
  const meta = maxMetadata(states, localReplicaId);
  for (const quarantined of states) {
    const quarantinedTripId = quarantinedSessionTripId(quarantined);
    if (!quarantinedTripId) continue;
    const quarantineStamp = quarantined.syncMeta?.singletons.activeSession;
    if (!quarantineStamp) continue;
    for (const candidate of states) {
      const tripId = candidate.activeSession?.tripId;
      if (tripId !== quarantinedTripId || compareStamp(quarantineStamp, candidate.syncMeta?.singletons.activeSession) < 0) continue;
      if (compareStamp(quarantineStamp, meta.sessionTombstones?.[tripId]) > 0) {
        meta.sessionTombstones![tripId] = quarantineStamp;
      }
    }
  }
  const mergedCollections = {} as Record<SyncEntityCollection, Entity[]>;

  for (const collection of COLLECTIONS) {
    const ids = new Set<string>();
    for (const state of states) {
      Object.keys(state.syncMeta!.entities[collection]).forEach((id) => ids.add(id));
      Object.keys(state.syncMeta!.tombstones[collection]).forEach((id) => ids.add(id));
    }
    const values: Entity[] = [];
    for (const id of ids) {
      const valueStamp = meta.entities[collection][id];
      const deleteStamp = meta.tombstones[collection][id];
      const deleted = Boolean(deleteStamp && compareStamp(deleteStamp, valueStamp) >= 0);
      const winning = deleted ? deleteStamp : valueStamp;
      if (!winning) continue;
      const value = deleted ? null : matchingValue(states, collection, id, winning);
      if (value) values.push(value);
      onDecision?.({
        entityId: `${collection}:${id}`,
        operation: deleted || !value ? 'delete' : 'accept',
        sequence: winning.clock,
        originatingDevice: winning.replicaId,
        reason: deleted ? 'tombstone_wins' : states.some((state) => state.syncMeta?.entities[collection][id]?.clock === winning.clock && state.syncMeta?.entities[collection][id]?.replicaId !== winning.replicaId)
          ? 'replica_tiebreak'
          : 'higher_lamport_clock',
      });
    }
    mergedCollections[collection] = sortedCollection(collection, values);
  }

  const prefsState = highestSingletonState(states, 'prefs');
  const activeSession = mergeSession(states, meta);
  return {
    ...states[0],
    items: mergedCollections.items as DurableState['items'],
    stores: mergedCollections.stores as DurableState['stores'],
    priceHistory: mergedCollections.priceHistory as DurableState['priceHistory'],
    receipts: mergedCollections.receipts as DurableState['receipts'],
    trips: mergedCollections.trips as DurableState['trips'],
    activity: mergedCollections.activity as DurableState['activity'],
    prefs: prefsState.prefs,
    activeSession,
    updatedAt: Math.max(...states.map((state) => state.updatedAt)),
    syncMeta: meta,
  };
}

export function syncStateDigest(state: DurableState): string {
  const { syncMeta: _syncMeta, ...data } = state;
  return stableStringify({
    ...data,
    receipts: data.receipts.map(normalizeReceiptForSync),
    activeSession: data.activeSession
      ? { ...data.activeSession, receipts: data.activeSession.receipts.map(normalizeReceiptForSync) }
      : null,
  });
}

export function replicaEnvelopeDigest(state: DurableState): string {
  const initialized = state.syncMeta ? state : initializeReplicaState(state, 'legacy-digest');
  const meta = initialized.syncMeta!;
  const { lastOperation: _lastOperation, replicaId: _replicaId, ...stableMeta } = meta;
  return stableStringify({ data: JSON.parse(syncStateDigest(initialized)), syncMeta: stableMeta });
}
