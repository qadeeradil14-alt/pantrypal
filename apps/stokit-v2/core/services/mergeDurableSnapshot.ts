import type { DurableState, SharedShoppingSession, Trip } from '../../types';
import { mergePantryItems, mergeTombstones } from './mergePantryState';
import { mergeShoppingEntries, reconcileShoppingSession } from './shoppingEntrySync';
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
  if (
    preferred.status !== 'shopping_store' ||
    other.status !== 'shopping_store' ||
    preferred.tripId !== other.tripId
  ) return preferred;

  const removedItemIds = Array.from(new Set([...(preferred.removedItemIds ?? []), ...(other.removedItemIds ?? [])]));
  const receiptsById = new Map(other.receipts.map((receipt) => [receipt.id, receipt]));
  for (const receipt of preferred.receipts) receiptsById.set(receipt.id, receipt);

  return reconcileShoppingSession({
    ...preferred,
    storeQueue: [...preferred.storeQueue, ...other.storeQueue.filter((storeId) => !preferred.storeQueue.includes(storeId))],
    skippedStoreIds: Array.from(new Set([...preferred.skippedStoreIds, ...other.skippedStoreIds])),
    entries: mergeShoppingEntries(other.entries, preferred.entries, removedItemIds),
    removedItemIds,
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
