import type {
  PantryItem,
  ShoppingEntryDraft,
  ShoppingStoreAssignment,
} from '../../types';
import { nextTimestamp } from './id';

export interface ShoppingAssignmentCausalContext {
  shoppingEpoch: number;
  activeTripId: string | null;
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
    const existingRevision = existing?.revision;
    const incomingRevision = assignment.revision;
    const hasRevision = existingRevision !== undefined || incomingRevision !== undefined;
    const terminalConflict = existing && Boolean(existing.closedTripId) !== Boolean(assignment.closedTripId);
    const incomingWinsTerminalConflict = terminalConflict && (
      assignment.closedTripId
        ? existing.basedOnClosedTripId !== assignment.closedTripId
        : assignment.basedOnClosedTripId === existing.closedTripId
    );
    if (
      !existing ||
      (terminalConflict && incomingWinsTerminalConflict) ||
      (!terminalConflict && hasRevision && (incomingRevision ?? 0) > (existingRevision ?? 0)) ||
      (!terminalConflict && hasRevision && (incomingRevision ?? 0) === (existingRevision ?? 0) && !assignment.active && existing.active) ||
      (!terminalConflict && !hasRevision && assignment.updatedAt > existing.updatedAt) ||
      (!terminalConflict && !hasRevision && assignment.updatedAt === existing.updatedAt && assignment.active && !existing.active)
    ) {
      byId.set(assignment.id, assignment);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
