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

export function assignShoppingItemToStorePreservingLegacy(
  assignments: ShoppingStoreAssignment[] | undefined,
  item: Pick<PantryItem, 'id' | 'storeId'>,
  storeId: string,
  at = Date.now(),
): ShoppingStoreAssignment[] {
  const withLegacy = item.storeId
    ? assignShoppingItemToStore(assignments, item.id, item.storeId, at)
    : assignments ?? [];
  return assignShoppingItemToStore(withLegacy, item.id, storeId, at);
}

export function activeShoppingStoreIds(
  item: PantryItem,
  assignments: ShoppingStoreAssignment[] | undefined,
): string[] {
  const assigned = (assignments ?? [])
    .filter((assignment) => assignment.pantryItemId === item.id && assignment.active)
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
    .map((assignment) => assignment.storeId);
  if (assigned.length > 0) return [...new Set(assigned)];
  return item.storeId ? [item.storeId] : [];
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
      (assignment.updatedAt === existing.updatedAt && assignment.active && !existing.active)
    ) {
      byId.set(assignment.id, assignment);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
