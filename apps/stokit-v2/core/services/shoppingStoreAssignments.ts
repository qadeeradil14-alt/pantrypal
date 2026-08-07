import type {
  PantryItem,
  ShoppingEntryDraft,
  ShoppingStoreAssignment,
} from '../../types';
import { nextTimestamp } from './id';

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
