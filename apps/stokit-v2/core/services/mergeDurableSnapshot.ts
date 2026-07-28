import type { DurableState, SharedShoppingSession, Trip } from '../../types';
import { mergePantryItems, mergeTombstones } from './mergePantryState';
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

  // foldRemoteActiveSession produces the entry / storeQueue / removedItemIds
  // union with `preferred` as the authoritative base (it keeps the second
  // argument's scalars). Receipts, skipped stores and completedTrip are the
  // push-path-only extras layered on top.
  const folded = foldRemoteActiveSession(other, preferred);
  const receiptsById = new Map(other.receipts.map((receipt) => [receipt.id, receipt]));
  for (const receipt of preferred.receipts) receiptsById.set(receipt.id, receipt);

  return reconcileShoppingSession({
    ...folded,
    skippedStoreIds: Array.from(new Set([...preferred.skippedStoreIds, ...other.skippedStoreIds])),
    receipts: Array.from(receiptsById.values()),
    completedTrip: preferred.completedTrip ?? other.completedTrip,
  }, mergedItems);
}

export function mergeDurableSnapshotForPush(remote: DurableState, local: DurableState): DurableState {
  const preferLocal = local.updatedAt > remote.updatedAt;
  const preferred = preferLocal ? local : remote;
  const mergedTombstones = mergeTombstones(remote.deletedItems, local.deletedItems);
  const mergedItems = mergePantryItems(remote.items, local.items, mergedTombstones);
  const knownTrips = [...remote.trips, ...local.trips];
  const mergedClosedTripIds = mergeTombstones(remote.closedTripIds, local.closedTripIds);

  return {
    ...preferred,
    items: mergedItems,
    activeSession: mergeActiveSession(
      remote.activeSession, local.activeSession, mergedItems, knownTrips,
      preferLocal, remote.trips, local.trips, mergedClosedTripIds,
    ),
    updatedAt: Math.max(remote.updatedAt, local.updatedAt),
    deletedItems: mergedTombstones,
    closedTripIds: mergedClosedTripIds,
  };
}

function syncSignature(state: DurableState): string {
  const items = state.items.map((item) => [item.id, item.name, item.quantity, item.unit, item.status, item.storageLocation, item.storeId, item.expiryDate, item.updatedAt]).sort(([a], [b]) => String(a).localeCompare(String(b)));
  const deletedItems = (state.deletedItems ?? []).map((entry) => [entry.id, entry.deletedAt]).sort(([a], [b]) => String(a).localeCompare(String(b)));
  const activeSession = state.activeSession ? {
    ...state.activeSession,
    entries: state.activeSession.entries.map((entry) => [entry.itemId, entry.name, entry.quantity, entry.unit, entry.storeId, entry.picked, Boolean(entry.outOfStock)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    removedItemIds: [...(state.activeSession.removedItemIds ?? [])].sort(),
  } : null;
  return JSON.stringify({ items, deletedItems, activeSession });
}

export function hasLocalSyncContribution(remote: DurableState, local: DurableState): boolean {
  return syncSignature(mergeDurableSnapshotForPush(remote, local)) !== syncSignature(remote);
}
