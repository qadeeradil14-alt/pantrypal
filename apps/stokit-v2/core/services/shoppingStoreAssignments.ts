import type {
  PantryItem,
  ShoppingEntryDraft,
  ShoppingStoreAssignment,
  Trip,
} from '../../types';
import { nextTimestamp } from './id';
import { releasedByMostRecentClosedTrip } from './shoppingDuplicateGuard';

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
): ShoppingStoreAssignment[] {
  const id = shoppingStoreAssignmentId(pantryItemId, storeId);
  const existing = (assignments ?? []).find((assignment) => assignment.id === id);
  if (existing?.active) return assignments ?? [];
  const updated: ShoppingStoreAssignment = {
    id,
    pantryItemId,
    storeId,
    active: true,
    updatedAt: nextTimestamp(existing?.updatedAt, at),
  };
  return [
    ...(assignments ?? []).filter((assignment) => assignment.id !== id),
    updated,
  ];
}

/**
 * Which stores this item is currently wanted at.
 *
 * `trips` is optional and purely suppressive: when supplied, an item the most
 * recently completed trip already settled is not treated as a live shopping
 * need. Omitting it preserves the original behaviour exactly, so call sites
 * that are not deriving the shopping plan (and tests asserting raw ledger
 * semantics) are unaffected.
 *
 * An ACTIVE assignment always wins and is never suppressed — it is the
 * explicit user intent signal. Only addItem / assignItemsToStore create one,
 * and both already run canAssignToStore, which requires the user's "Add again"
 * (allowRepurchase) confirmation to re-assign something the last trip settled.
 * So re-adding an item immediately restores it here, with no waiting for the
 * next trip to close.
 */
export function activeShoppingStoreIds(
  item: PantryItem,
  assignments: ShoppingStoreAssignment[] | undefined,
  trips?: Trip[],
): string[] {
  const itemAssignments = (assignments ?? [])
    .filter((assignment) => assignment.pantryItemId === item.id);
  const assigned = itemAssignments
    .filter((assignment) => assignment.active)
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
    .map((assignment) => assignment.storeId);
  // Explicit, current intent — always authoritative.
  if (assigned.length > 0) return [...new Set(assigned)];
  // Nothing active: this item would only be "wanted" by derivation from its
  // pantry status. If the last trip already settled it, that is an echo of the
  // closed trip, not a new need — suppress it from both the unassigned bucket
  // and the legacy item.storeId fallback below.
  if (releasedByMostRecentClosedTrip(trips, item.id, item.name)) return [];
  if (itemAssignments.length > 0) return [];
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
    };
  });
  return changed ? next : assignments ?? [];
}

export function shoppingEntryDraftsFromAssignments(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[] | undefined,
  trips?: Trip[],
): ShoppingEntryDraft[] {
  return items
    .filter((item) => item.status === 'low' || item.status === 'expiring')
    .flatMap((item) =>
      activeShoppingStoreIds(item, assignments, trips).map((storeId) => ({
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
    if (
      !existing ||
      assignment.updatedAt > existing.updatedAt ||
      // On an exact-timestamp tie, a deactivation always wins over an active
      // record, regardless of which side (remote/local) is being compared
      // against which — a stale device racing an equal-timestamp write can
      // never resurrect an assignment the other side just released.
      (assignment.updatedAt === existing.updatedAt && !assignment.active && existing.active)
    ) {
      byId.set(assignment.id, assignment);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
