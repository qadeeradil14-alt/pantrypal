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

function mergeActiveSession(
  remote: SharedShoppingSession | null,
  local: SharedShoppingSession | null,
  mergedItems: DurableState['items'],
  knownTrips: Trip[],
  preferLocal: boolean,
  remoteTrips: Trip[],
  localTrips: Trip[],
  closedTripIds: { id: string }[],
): SharedShoppingSession | null {
  const localExplicitlyResumed = Boolean(
    preferLocal &&
    local?.tripId &&
    remoteTrips.some((trip) => trip.id === local.tripId) &&
    !localTrips.some((trip) => trip.id === local.tripId),
  );
  if (
    !localExplicitlyResumed &&
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
  const mergedItems = mergePantryItems(remote.items, local.items, mergedTombstones);
  const locallyResumedTripId = preferLocal
    && local.activeSession?.tripId
    && remote.trips.some((trip) => trip.id === local.activeSession?.tripId)
    && !local.trips.some((trip) => trip.id === local.activeSession?.tripId)
      ? local.activeSession.tripId
      : null;
  const mergedTrips = mergeTrips(remote.trips, local.trips, mergedTripTombstones)
    .filter((trip) => trip.id !== locallyResumedTripId);
  const mergedReceipts = mergeReceipts(remote.receipts, local.receipts, mergedReceiptTombstones)
    .filter((receipt) => receipt.tripId !== locallyResumedTripId);
  const knownTrips = mergedTrips;
  const mergedClosedTripIds = mergeTombstones(remote.closedTripIds, local.closedTripIds);
  const mergedPrefs = mergePrefs(remote, local, preferLocal);

  return {
    ...preferred,
    items: mergedItems,
    stores: mergeStores(remote.stores, local.stores, mergedStoreTombstones),
    priceHistory: mergePriceHistory(remote.priceHistory, local.priceHistory),
    receipts: mergedReceipts,
    trips: mergedTrips,
    activity: mergeActivity(remote.activity, local.activity),
    ...mergedPrefs,
    activeSession: mergeActiveSession(
      remote.activeSession, local.activeSession, mergedItems, knownTrips,
      preferLocal, remote.trips, local.trips, mergedClosedTripIds,
    ),
    updatedAt: Math.max(remote.updatedAt, local.updatedAt),
    deletedItems: mergedTombstones,
    deletedStores: mergedStoreTombstones,
    deletedTrips: mergedTripTombstones,
    deletedReceipts: mergedReceiptTombstones,
    closedTripIds: mergedClosedTripIds,
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
