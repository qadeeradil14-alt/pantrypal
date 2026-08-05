import type { DurableState, SharedShoppingSession, Trip } from '../../types';
import { mergePantryItems, mergeTombstones } from './mergePantryState';
import {
  mergeActivity,
  mergePrefs,
  mergePriceHistory,
  mergeReceipts,
  mergeStores,
  mergeTrips,
} from './mergeDurableCollections';
import { canFoldActiveSessions, foldRemoteActiveSession, reconcileShoppingSession } from './shoppingEntrySync';
import { isCompletedShoppingSession } from './shoppingSessionSyncPolicy';
import { mergeShoppingStoreAssignments, reconcileAssignmentsWithItemTerminalState } from './shoppingStoreAssignments';
import { normalizeShoppingEpoch, sanitizeShoppingAssignments } from './shoppingEpoch';

function restoreObservedActiveTripItemState(
  mergedItems: DurableState['items'],
  observedState: DurableState | null,
  activeSession: SharedShoppingSession | null,
): DurableState['items'] {
  if (!observedState || !activeSession) return mergedItems;
  const activeItemIds = new Set(
    activeSession.entries
      .filter((entry) => entry.pantryItemId !== '__quick_scan__')
      .map((entry) => entry.pantryItemId),
  );
  const observedById = new Map(observedState.items.map((item) => [item.id, item]));
  return mergedItems.map((item) => {
    const observed = observedById.get(item.id);
    if (!activeItemIds.has(item.id) || !observed) return item;
    return {
      ...item,
      status: observed.status,
      storeId: observed.storeId,
      statusUpdatedAt: observed.statusUpdatedAt,
      statusRevision: observed.statusRevision,
      statusClosedTripId: observed.statusClosedTripId,
      statusBasedOnClosedTripId: observed.statusBasedOnClosedTripId,
    };
  });
}

function mergeActiveSession(
  remote: SharedShoppingSession | null,
  local: SharedShoppingSession | null,
  mergedItems: DurableState['items'],
  knownTrips: Trip[],
  preferLocal: boolean,
  closedTripIds: { id: string }[],
): SharedShoppingSession | null {
  if (
    (isCompletedShoppingSession(remote, knownTrips, closedTripIds) ||
      isCompletedShoppingSession(local, knownTrips, closedTripIds))
  ) return null;

  const preferred = preferLocal ? local : remote;
  const other = preferLocal ? remote : local;
  if (!preferred || !other) return preferred ?? other;
  // Same policy as the pull path — see canFoldActiveSessions. Notably this does
  // NOT require both sides to be `shopping_store`: the shopper walks through
  // receipt_prompt / store_summary / next_store_ready while moving from one
  // store to the next, and requiring status equality here made the push discard
  // everything a collaborator had added to the upcoming store during that
  // window.
  if (!canFoldActiveSessions(other, preferred)) return preferred;

  // foldRemoteActiveSession produces the entry / storeQueue / occurrence tombstone
  // union with `preferred` as the authoritative base (it keeps the second
  // argument's scalars). Receipts, skipped stores and completedTrip are the
  // push-path-only extras layered on top.
  const folded = foldRemoteActiveSession(other, preferred);
  return reconcileShoppingSession({
    ...folded,
    receipts: mergeReceipts(other.receipts, preferred.receipts, []),
    completedTrip: preferred.completedTrip ?? other.completedTrip,
  }, mergedItems);
}

export function mergeDurableSnapshotForPush(remote: DurableState, local: DurableState): DurableState {
  const preferLocal = local.updatedAt > remote.updatedAt;
  const preferred = preferLocal ? local : remote;
  const mergedTombstones = mergeTombstones(remote.deletedItems, local.deletedItems);
  const mergedStoreTombstones = mergeTombstones(remote.deletedStores, local.deletedStores);
  const mergedTripTombstones = mergeTombstones(remote.deletedTrips, local.deletedTrips);
  const mergedReceiptTombstones = mergeTombstones(remote.deletedReceipts, local.deletedReceipts);
  const initiallyMergedItems = mergePantryItems(remote.items, local.items, mergedTombstones);
  const mergedTrips = mergeTrips(remote.trips, local.trips, mergedTripTombstones);
  const mergedReceipts = mergeReceipts(remote.receipts, local.receipts, mergedReceiptTombstones);
  const knownTrips = mergedTrips;
  const mergedClosedTripIds = mergeTombstones(remote.closedTripIds, local.closedTripIds);
  const mergedPrefs = mergePrefs(remote, local, preferLocal);
  const mergedActiveSession = mergeActiveSession(
    remote.activeSession, local.activeSession, initiallyMergedItems, knownTrips,
    preferLocal, mergedClosedTripIds,
  );
  const shoppingEpoch = Math.max(
    normalizeShoppingEpoch(remote.shoppingEpoch),
    normalizeShoppingEpoch(local.shoppingEpoch),
  );
  const activeTripId = mergedActiveSession?.tripId ?? null;
  const remoteObservedActiveTrip = Boolean(activeTripId) &&
    normalizeShoppingEpoch(remote.shoppingEpoch) === shoppingEpoch &&
    remote.activeTripId === activeTripId;
  const localObservedActiveTrip = Boolean(activeTripId) &&
    normalizeShoppingEpoch(local.shoppingEpoch) === shoppingEpoch &&
    local.activeTripId === activeTripId;
  const singlyObservedState = remoteObservedActiveTrip === localObservedActiveTrip
    ? null
    : remoteObservedActiveTrip ? remote : local;
  const mergedItems = restoreObservedActiveTripItemState(
    initiallyMergedItems,
    singlyObservedState,
    mergedActiveSession,
  );
  const mergedAssignments = sanitizeShoppingAssignments(
    reconcileAssignmentsWithItemTerminalState(
      mergeShoppingStoreAssignments(
        remote.shoppingStoreAssignments,
        local.shoppingStoreAssignments,
      ),
      mergedItems,
    ),
    mergedItems,
    shoppingEpoch,
    activeTripId,
    mergedActiveSession,
  );

  return {
    ...preferred,
    items: mergedItems,
    stores: mergeStores(remote.stores, local.stores, mergedStoreTombstones),
    priceHistory: mergePriceHistory(remote.priceHistory, local.priceHistory),
    receipts: mergedReceipts,
    trips: mergedTrips,
    activity: mergeActivity(remote.activity, local.activity),
    ...mergedPrefs,
    activeSession: mergedActiveSession,
    shoppingEpoch,
    activeTripId,
    shoppingStoreAssignments: mergedAssignments,
    updatedAt: Math.max(remote.updatedAt, local.updatedAt),
    deletedItems: mergedTombstones,
    deletedStores: mergedStoreTombstones,
    deletedTrips: mergedTripTombstones,
    deletedReceipts: mergedReceiptTombstones,
    closedTripIds: mergedClosedTripIds,
  };
}

type IdentifiedRecord = { id: string };

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function replayChangedObjectFields<T extends object>(
  server: T,
  submitted: T,
  latest: T,
): { value: T; changed: boolean } {
  if (sameValue(submitted, latest)) return { value: server, changed: false };
  const value = { ...server } as T;
  const keys = new Set([
    ...Object.keys(submitted),
    ...Object.keys(latest),
  ]) as Set<keyof T>;
  for (const key of keys) {
    if (sameValue(submitted[key], latest[key])) continue;
    if (Object.prototype.hasOwnProperty.call(latest, key)) value[key] = latest[key];
    else delete value[key];
  }
  return { value, changed: true };
}

function replayChangedRecords<T extends IdentifiedRecord>(
  server: T[] | undefined,
  submitted: T[] | undefined,
  latest: T[] | undefined,
): { value: T[]; changed: boolean } {
  const serverRecords = server ?? [];
  const submittedRecords = submitted ?? [];
  const latestRecords = latest ?? [];
  const submittedById = new Map(submittedRecords.map((record) => [record.id, record]));
  const latestById = new Map(latestRecords.map((record) => [record.id, record]));
  const changedIds = new Set<string>();
  for (const id of new Set([...submittedById.keys(), ...latestById.keys()])) {
    if (!sameValue(submittedById.get(id), latestById.get(id))) changedIds.add(id);
  }
  if (!changedIds.size) return { value: serverRecords, changed: false };

  const serverIds = new Set(serverRecords.map((record) => record.id));
  const value = serverRecords.flatMap((serverRecord) => {
    if (!changedIds.has(serverRecord.id)) return [serverRecord];
    const latestRecord = latestById.get(serverRecord.id);
    if (!latestRecord) return [];
    const submittedRecord = submittedById.get(serverRecord.id);
    return [submittedRecord
      ? replayChangedObjectFields(serverRecord, submittedRecord, latestRecord).value
      : latestRecord];
  });
  for (const latestRecord of latestRecords) {
    if (changedIds.has(latestRecord.id) && !serverIds.has(latestRecord.id)) {
      value.push(latestRecord);
    }
  }
  return { value, changed: true };
}

export function reconcileServerSnapshotAfterPush(
  serverStored: DurableState,
  submittedLocal: DurableState,
  latestLocal: DurableState,
): { state: DurableState; hasPostSubmissionChanges: boolean } {
  const items = replayChangedRecords(serverStored.items, submittedLocal.items, latestLocal.items);
  const stores = replayChangedRecords(serverStored.stores, submittedLocal.stores, latestLocal.stores);
  const priceHistory = replayChangedRecords(
    serverStored.priceHistory,
    submittedLocal.priceHistory,
    latestLocal.priceHistory,
  );
  const receipts = replayChangedRecords(
    serverStored.receipts,
    submittedLocal.receipts,
    latestLocal.receipts,
  );
  const trips = replayChangedRecords(serverStored.trips, submittedLocal.trips, latestLocal.trips);
  const activity = replayChangedRecords(
    serverStored.activity,
    submittedLocal.activity,
    latestLocal.activity,
  );
  const assignments = replayChangedRecords(
    serverStored.shoppingStoreAssignments,
    submittedLocal.shoppingStoreAssignments,
    latestLocal.shoppingStoreAssignments,
  );
  const deletedItems = replayChangedRecords(
    serverStored.deletedItems,
    submittedLocal.deletedItems,
    latestLocal.deletedItems,
  );
  const deletedStores = replayChangedRecords(
    serverStored.deletedStores,
    submittedLocal.deletedStores,
    latestLocal.deletedStores,
  );
  const deletedTrips = replayChangedRecords(
    serverStored.deletedTrips,
    submittedLocal.deletedTrips,
    latestLocal.deletedTrips,
  );
  const deletedReceipts = replayChangedRecords(
    serverStored.deletedReceipts,
    submittedLocal.deletedReceipts,
    latestLocal.deletedReceipts,
  );
  const closedTripIds = replayChangedRecords(
    serverStored.closedTripIds,
    submittedLocal.closedTripIds,
    latestLocal.closedTripIds,
  );
  const prefs = replayChangedObjectFields(
    serverStored.prefs,
    submittedLocal.prefs,
    latestLocal.prefs,
  );
  const prefsUpdatedAt = replayChangedObjectFields(
    serverStored.prefsUpdatedAt ?? {},
    submittedLocal.prefsUpdatedAt ?? {},
    latestLocal.prefsUpdatedAt ?? {},
  );
  const activeSessionChanged = !sameValue(submittedLocal.activeSession, latestLocal.activeSession);
  const shoppingEpochChanged = submittedLocal.shoppingEpoch !== latestLocal.shoppingEpoch;
  const activeTripIdChanged = submittedLocal.activeTripId !== latestLocal.activeTripId;
  const hasPostSubmissionChanges = [
    items,
    stores,
    priceHistory,
    receipts,
    trips,
    activity,
    assignments,
    deletedItems,
    deletedStores,
    deletedTrips,
    deletedReceipts,
    closedTripIds,
    prefs,
    prefsUpdatedAt,
  ].some((entry) => entry.changed) ||
    activeSessionChanged ||
    shoppingEpochChanged ||
    activeTripIdChanged;

  return {
    state: {
      ...serverStored,
      items: items.value,
      stores: stores.value,
      priceHistory: priceHistory.value,
      receipts: receipts.value,
      trips: trips.value,
      activity: activity.value,
      prefs: prefs.value,
      activeSession: activeSessionChanged ? latestLocal.activeSession : serverStored.activeSession,
      shoppingEpoch: shoppingEpochChanged ? latestLocal.shoppingEpoch : serverStored.shoppingEpoch,
      activeTripId: activeTripIdChanged ? latestLocal.activeTripId : serverStored.activeTripId,
      shoppingStoreAssignments: assignments.value,
      deletedItems: deletedItems.value,
      deletedStores: deletedStores.value,
      deletedTrips: deletedTrips.value,
      deletedReceipts: deletedReceipts.value,
      closedTripIds: closedTripIds.value,
      prefsUpdatedAt: prefsUpdatedAt.value,
      updatedAt: hasPostSubmissionChanges
        ? Math.max(serverStored.updatedAt, latestLocal.updatedAt)
        : serverStored.updatedAt,
    },
    hasPostSubmissionChanges,
  };
}

function byId<T extends { id: string }>(records: T[] | undefined): T[] {
  return [...(records ?? [])].sort((a, b) => a.id.localeCompare(b.id));
}

function tombstones(entries: DurableState['deletedItems']): DurableState['deletedItems'] {
  return byId(entries);
}

function syncSignature(state: DurableState): string {
  const items = byId(state.items);
  const activeSession = state.activeSession ? {
    ...state.activeSession,
    entries: [...state.activeSession.entries].sort((a, b) => a.entryId.localeCompare(b.entryId)),
    removedEntryIds: [...(state.activeSession.removedEntryIds ?? [])].sort(),
    skippedStoreIds: [...state.activeSession.skippedStoreIds].sort(),
    receipts: byId(state.activeSession.receipts),
  } : null;
  return JSON.stringify({
    items,
    stores: byId(state.stores),
    priceHistory: byId(state.priceHistory),
    receipts: byId(state.receipts),
    trips: byId(state.trips),
    activity: byId(state.activity),
    prefs: state.prefs,
    prefsUpdatedAt: state.prefsUpdatedAt ?? {},
    activeSession,
    shoppingEpoch: normalizeShoppingEpoch(state.shoppingEpoch),
    activeTripId: state.activeTripId ?? null,
    shoppingStoreAssignments: byId(state.shoppingStoreAssignments),
    deletedItems: tombstones(state.deletedItems),
    deletedStores: tombstones(state.deletedStores),
    deletedTrips: tombstones(state.deletedTrips),
    deletedReceipts: tombstones(state.deletedReceipts),
    closedTripIds: tombstones(state.closedTripIds),
  });
}

export function hasLocalSyncContribution(remote: DurableState, local: DurableState): boolean {
  return syncSignature(mergeDurableSnapshotForPush(remote, local)) !== syncSignature(remote);
}
