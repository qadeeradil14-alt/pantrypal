import type {
  DurableState,
  PantryItem,
  SharedShoppingSession,
  ShoppingStoreAssignment,
  Trip,
} from '../../types';
import { nextTimestamp } from './id';
import {
  assignShoppingItemToStore,
  type ShoppingAssignmentCausalContext,
} from './shoppingStoreAssignments';

export function normalizeShoppingEpoch(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function shoppingCausalContext(
  state: Pick<DurableState, 'shoppingEpoch' | 'activeTripId'>,
): ShoppingAssignmentCausalContext {
  return {
    shoppingEpoch: normalizeShoppingEpoch(state.shoppingEpoch),
    activeTripId: typeof state.activeTripId === 'string' ? state.activeTripId : null,
  };
}

export function nextShoppingStatusRevision(
  item: PantryItem,
  state: Pick<DurableState, 'trips' | 'shoppingStoreAssignments'>,
  statusClosedTripId?: string,
): Pick<PantryItem, 'statusRevision' | 'statusClosedTripId' | 'statusBasedOnClosedTripId'> {
  const latestPurchasedTrip = [...(state.trips ?? [])]
    .filter((trip) => trip.purchasedItems.some((entry) => entry.itemId === item.id))
    .sort((a, b) => b.completedAt - a.completedAt)[0];
  const latestClosedAssignment = [...(state.shoppingStoreAssignments ?? [])]
    .filter((assignment) => assignment.pantryItemId === item.id && assignment.closedTripId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return {
    statusRevision: (item.statusRevision ?? 0) + 1,
    statusClosedTripId,
    statusBasedOnClosedTripId:
      item.statusClosedTripId
      ?? latestPurchasedTrip?.id
      ?? item.statusBasedOnClosedTripId
      ?? latestClosedAssignment?.closedTripId,
  };
}

export function observeActiveTripAssignments(
  assignments: ShoppingStoreAssignment[] | undefined,
  session: SharedShoppingSession,
  shoppingEpoch: number,
  at = Date.now(),
): ShoppingStoreAssignment[] {
  const context = { shoppingEpoch, activeTripId: session.tripId };
  const pairs = new Map(
    session.entries
      .filter((entry) => entry.pantryItemId !== '__quick_scan__')
      .map((entry) => [`${entry.pantryItemId}:${entry.storeId}`, entry]),
  );
  return [...pairs.values()].reduce(
    (current, entry) => {
      const existing = current.find(
        (assignment) =>
          assignment.pantryItemId === entry.pantryItemId &&
          assignment.storeId === entry.storeId,
      );
      if (
        existing?.active &&
        existing.assignmentBasedOnShoppingEpoch === shoppingEpoch &&
        existing.assignmentBasedOnActiveTripId === session.tripId
      ) return current;
      return assignShoppingItemToStore(
        current,
        entry.pantryItemId,
        entry.storeId,
        at,
        context,
      );
    },
    assignments ?? [],
  );
}

function deactivateRejectedAssignment(
  assignment: ShoppingStoreAssignment,
): ShoppingStoreAssignment {
  return assignment.active ? { ...assignment, active: false } : assignment;
}

export function sanitizeShoppingAssignments(
  assignments: ShoppingStoreAssignment[] | undefined,
  items: PantryItem[],
  shoppingEpoch: number,
  activeTripId: string | null,
  activeSession: SharedShoppingSession | null,
): ShoppingStoreAssignment[] {
  const activeTripItemIds = new Set(
    activeSession?.entries
      .filter((entry) => entry.pantryItemId !== '__quick_scan__')
      .map((entry) => entry.pantryItemId) ?? [],
  );
  const completionProtectedItemIds = new Set(
    items
      .filter((item) => Boolean(item.statusClosedTripId))
      .map((item) => item.id),
  );
  return (assignments ?? []).map((assignment) => {
    if (!assignment.active) return assignment;
    const basedEpoch = typeof assignment.assignmentBasedOnShoppingEpoch === 'number' &&
      Number.isFinite(assignment.assignmentBasedOnShoppingEpoch)
      ? normalizeShoppingEpoch(assignment.assignmentBasedOnShoppingEpoch)
      : -1;
    if (activeTripId && activeTripItemIds.has(assignment.pantryItemId)) {
      return basedEpoch === shoppingEpoch &&
        assignment.assignmentBasedOnActiveTripId === activeTripId
        ? assignment
        : deactivateRejectedAssignment(assignment);
    }
    if (completionProtectedItemIds.has(assignment.pantryItemId) && basedEpoch < shoppingEpoch) {
      return deactivateRejectedAssignment(assignment);
    }
    return assignment;
  });
}

export function invalidateUnobservedPurchasedAssignments(
  assignments: ShoppingStoreAssignment[] | undefined,
  trip: Trip,
  shoppingEpoch: number,
): ShoppingStoreAssignment[] {
  const purchasedItemIds = new Set(trip.purchasedItems.map((entry) => entry.itemId));
  return (assignments ?? []).map((assignment) => {
    if (!assignment.active || !purchasedItemIds.has(assignment.pantryItemId)) return assignment;
    if (
      assignment.assignmentBasedOnShoppingEpoch === shoppingEpoch &&
      assignment.assignmentBasedOnActiveTripId === trip.id
    ) return assignment;
    return {
      ...assignment,
      active: false,
      updatedAt: nextTimestamp(assignment.updatedAt, trip.completedAt),
      revision: (assignment.revision ?? 0) + 1,
    };
  });
}
