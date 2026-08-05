import type {
  PantryItem,
  ShoppingEntry,
  ShoppingEntryDraft,
  ShoppingStoreAssignment,
  TripPurchasedItem,
} from '../../types';
import { nextTimestamp } from './id';

export interface ShoppingAssignmentCausalContext {
  shoppingEpoch: number;
  activeTripId: string | null;
}

function shoppingItemStorePair(itemId: string, storeId: string): string {
  return `${itemId}\u0000${storeId}`;
}

export function unpurchasedTripEntries<
  T extends Pick<ShoppingEntry, 'pantryItemId' | 'storeId'>,
>(
  entries: readonly T[],
  purchasedItems: readonly Pick<TripPurchasedItem, 'itemId' | 'storeId'>[],
): T[] {
  const purchasedPairs = new Set(
    purchasedItems.map((item) => shoppingItemStorePair(item.itemId, item.storeId)),
  );
  return entries.filter(
    (entry) =>
      entry.pantryItemId !== '__quick_scan__' &&
      !purchasedPairs.has(shoppingItemStorePair(entry.pantryItemId, entry.storeId)),
  );
}

export function shoppingStoreAssignmentId(
  pantryItemId: string,
  storeId: string,
): string {
  return `shopping-store:${pantryItemId}:${storeId}`;
}

export function assignShoppingItemToStore(
  assignments: ShoppingStoreAssignment[] | undefined,
  pantryItemId: string,
  storeId: string,
  at = Date.now(),
  causalContext?: ShoppingAssignmentCausalContext,
): ShoppingStoreAssignment[] {
  const id = shoppingStoreAssignmentId(pantryItemId, storeId);
  const existing = (assignments ?? []).find((assignment) => assignment.id === id);
  if (
    existing?.active &&
    (!causalContext || (
      existing.assignmentBasedOnShoppingEpoch === causalContext.shoppingEpoch &&
      existing.assignmentBasedOnActiveTripId === (causalContext.activeTripId ?? undefined)
    ))
  ) return assignments ?? [];
  const updated: ShoppingStoreAssignment = {
    id,
    pantryItemId,
    storeId,
    active: true,
    updatedAt: nextTimestamp(existing?.updatedAt, at),
    revision: (existing?.revision ?? 0) + 1,
    basedOnClosedTripId: existing?.closedTripId ?? existing?.basedOnClosedTripId,
    ...(causalContext ? {
      assignmentBasedOnShoppingEpoch: causalContext.shoppingEpoch,
      assignmentBasedOnActiveTripId: causalContext.activeTripId ?? undefined,
    } : {}),
  };
  return [
    ...(assignments ?? []).filter((assignment) => assignment.id !== id),
    updated,
  ];
}

export function activeShoppingStoreIds(
  item: PantryItem,
  assignments: ShoppingStoreAssignment[] | undefined,
): string[] {
  const itemAssignments = (assignments ?? [])
    .filter((assignment) => assignment.pantryItemId === item.id);
  const assigned = itemAssignments
    .filter((assignment) => assignment.active)
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
    .map((assignment) => assignment.storeId);
  if (itemAssignments.length > 0) return [...new Set(assigned)];
  return item.storeId ? [item.storeId] : [];
}

export function deactivateShoppingItemStore(
  assignments: ShoppingStoreAssignment[] | undefined,
  pantryItemId: string,
  storeId: string,
  at = Date.now(),
): ShoppingStoreAssignment[] {
  const id = shoppingStoreAssignmentId(pantryItemId, storeId);
  let changed = false;
  const next = (assignments ?? []).map((assignment) => {
    if (assignment.id !== id || !assignment.active) return assignment;
    changed = true;
    return {
      ...assignment,
      active: false,
      updatedAt: nextTimestamp(assignment.updatedAt, at),
      revision: (assignment.revision ?? 0) + 1,
      closedTripId: undefined,
    };
  });
  return changed ? next : assignments ?? [];
}

export function deactivateShoppingItemStores(
  assignments: ShoppingStoreAssignment[] | undefined,
  pantryItemId: string,
  at = Date.now(),
): ShoppingStoreAssignment[] {
  let changed = false;
  const next = (assignments ?? []).map((assignment) => {
    if (assignment.pantryItemId !== pantryItemId || !assignment.active) {
      return assignment;
    }
    changed = true;
    return {
      ...assignment,
      active: false,
      updatedAt: nextTimestamp(assignment.updatedAt, at),
      revision: (assignment.revision ?? 0) + 1,
      closedTripId: undefined,
    };
  });
  return changed ? next : assignments ?? [];
}

export function finalizeShoppingItemStore(
  assignments: ShoppingStoreAssignment[] | undefined,
  pantryItemId: string,
  storeId: string,
  tripId: string,
  at = Date.now(),
  causalContext?: ShoppingAssignmentCausalContext,
): ShoppingStoreAssignment[] {
  const id = shoppingStoreAssignmentId(pantryItemId, storeId);
  const existing = (assignments ?? []).find((assignment) => assignment.id === id);
  if (existing && !existing.active && existing.closedTripId === tripId) return assignments ?? [];
  const finalized: ShoppingStoreAssignment = {
    id,
    pantryItemId,
    storeId,
    active: false,
    updatedAt: nextTimestamp(existing?.updatedAt, at),
    revision: (existing?.revision ?? 0) + 1,
    closedTripId: tripId,
    basedOnClosedTripId: existing?.closedTripId ?? existing?.basedOnClosedTripId,
    assignmentBasedOnShoppingEpoch:
      causalContext?.shoppingEpoch ?? existing?.assignmentBasedOnShoppingEpoch,
    assignmentBasedOnActiveTripId:
      causalContext?.activeTripId ?? existing?.assignmentBasedOnActiveTripId,
  };
  return [
    ...(assignments ?? []).filter((assignment) => assignment.id !== id),
    finalized,
  ];
}

export function shoppingEntryDraftsFromAssignments(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[] | undefined,
): ShoppingEntryDraft[] {
  return items
    .filter((item) => item.status === 'low' || item.status === 'expiring')
    .flatMap((item) =>
      activeShoppingStoreIds(item, assignments).map((storeId) => ({
        pantryItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        storeId,
        picked: false,
      })),
    );
}

export function mergeShoppingStoreAssignments(
  remote: ShoppingStoreAssignment[] | undefined,
  local: ShoppingStoreAssignment[] | undefined,
): ShoppingStoreAssignment[] {
  const byId = new Map<string, ShoppingStoreAssignment>();
  for (const assignment of [...(remote ?? []), ...(local ?? [])]) {
    const existing = byId.get(assignment.id);
    if (existing && Boolean(existing.closedTripId) !== Boolean(assignment.closedTripId)) {
      const terminal = assignment.closedTripId ? assignment : existing;
      const nonTerminal = assignment.closedTripId ? existing : assignment;
      const acceptsCausalSuccessor =
        nonTerminal.basedOnClosedTripId === terminal.closedTripId;
      if (acceptsCausalSuccessor) {
        const terminalRevision = terminal.revision ?? 0;
        const successorRevision = nonTerminal.revision ?? 0;
        byId.set(assignment.id,
          nonTerminal.revision !== undefined &&
          terminal.revision !== undefined &&
          successorRevision <= terminalRevision
          ? {
              ...nonTerminal,
              revision: Math.max(successorRevision, terminalRevision) + 1,
            }
          : nonTerminal);
      } else {
        byId.set(assignment.id, terminal);
      }
      continue;
    }
    const existingRevision = existing?.revision;
    const incomingRevision = assignment.revision;
    const hasRevision = existingRevision !== undefined || incomingRevision !== undefined;
    if (
      !existing ||
      (hasRevision && (incomingRevision ?? 0) > (existingRevision ?? 0)) ||
      (hasRevision && (incomingRevision ?? 0) === (existingRevision ?? 0) && !assignment.active && existing.active) ||
      (!hasRevision && assignment.updatedAt > existing.updatedAt) ||
      (!hasRevision && assignment.updatedAt === existing.updatedAt && assignment.active && !existing.active)
    ) {
      byId.set(assignment.id, assignment);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Final consistency pass after both the item merge and the assignment merge
 * have run. mergePantryItems (resolveStatusFields) and
 * mergeShoppingStoreAssignments each resolve their own "is this terminal"
 * conflict independently — the item merge keys off
 * item.statusClosedTripId/statusBasedOnClosedTripId, the assignment merge
 * keys off assignment.closedTripId/basedOnClosedTripId — and can disagree
 * about the very same real-world event (e.g. an offline device re-marking a
 * just-closed item "low" and bulk-assigning it to a store: the item merge
 * can reject the re-add while the assignment merge accepts it, since a
 * fresh assignment automatically inherits a matching-looking
 * basedOnClosedTripId stamp with no re-add ceremony required). The result
 * is an impossible split state: item stocked with an active assignment, or
 * item low with its matching assignment stuck inactive.
 *
 * The already-merged item is the single source of truth here — its
 * terminal-conflict resolution is the one this app has extensively tested
 * (OTA 459/460's completed-shopping-plan and stale-replay protections).
 * This reconciles every assignment against it, in both directions, without
 * touching the per-field revision/timestamp resolution above.
 */
export function reconcileAssignmentsWithItemTerminalState(
  assignments: ShoppingStoreAssignment[],
  items: PantryItem[],
  at = Date.now(),
): ShoppingStoreAssignment[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return assignments.map((assignment) => {
    const item = itemsById.get(assignment.pantryItemId);
    if (!item) return assignment;

    if (item.statusClosedTripId && assignment.active) {
      // The item merge decided this item is closed. An active assignment
      // for it is exactly the impossible state this pass exists to
      // prevent — deactivate it and stamp it consistently with the item.
      return {
        ...assignment,
        active: false,
        updatedAt: nextTimestamp(assignment.updatedAt, at),
        revision: (assignment.revision ?? 0) + 1,
        closedTripId: item.statusClosedTripId,
      };
    }

    if (
      !item.statusClosedTripId &&
      !assignment.active &&
      assignment.closedTripId &&
      (item.status === 'low' || item.status === 'expiring') &&
      item.storeId === assignment.storeId
    ) {
      // The mirror image: the item merge decided this item legitimately
      // needs shopping again at exactly this store, but the assignment
      // merge kept the closed record for that same (item, store) pair.
      // Reactivate only this specific pair — never assignments the item's
      // own resolved storeId doesn't point to.
      return {
        ...assignment,
        active: true,
        updatedAt: nextTimestamp(assignment.updatedAt, at),
        revision: (assignment.revision ?? 0) + 1,
        closedTripId: undefined,
      };
    }

    return assignment;
  });
}
