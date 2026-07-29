import type {
  PantryItem,
  ShoppingEntry,
  ShoppingStoreAssignment,
} from '../../types';

export interface HomeShoppingOccurrence {
  occurrenceId: string;
  pantryItem: PantryItem;
  storeId: string | null;
}

export interface HomeShoppingItemGroup {
  pantryItem: PantryItem;
  occurrences: HomeShoppingOccurrence[];
}

export function groupHomeShoppingOccurrences(
  occurrences: readonly HomeShoppingOccurrence[],
): HomeShoppingItemGroup[] {
  const groups = new Map<string, HomeShoppingItemGroup>();
  for (const occurrence of occurrences) {
    const existing = groups.get(occurrence.pantryItem.id);
    if (existing) {
      existing.occurrences.push(occurrence);
    } else {
      groups.set(occurrence.pantryItem.id, {
        pantryItem: occurrence.pantryItem,
        occurrences: [occurrence],
      });
    }
  }
  return [...groups.values()];
}

export function homeShoppingItems(
  items: readonly PantryItem[],
  assignments: readonly ShoppingStoreAssignment[],
  activeTripEntries: readonly Pick<ShoppingEntry, 'pantryItemId' | 'storeId'>[],
): HomeShoppingOccurrence[] {
  const activeTripOccurrences = new Set(
    activeTripEntries.map((entry) => `${entry.pantryItemId}:${entry.storeId}`),
  );

  return items
    .filter((item) => item.status === 'low' || item.status === 'expiring')
    .flatMap((item): HomeShoppingOccurrence[] => {
      const itemAssignments = assignments.filter(
        (assignment) => assignment.pantryItemId === item.id,
      );
      const activeAssignments = itemAssignments.filter((assignment) => assignment.active);

      if (activeAssignments.length > 0) {
        return activeAssignments
          .filter((assignment) => (
            !activeTripOccurrences.has(`${item.id}:${assignment.storeId}`)
          ))
          .map((assignment) => ({
            occurrenceId: assignment.id,
            pantryItem: { ...item, storeId: assignment.storeId },
            storeId: assignment.storeId,
          }));
      }

      const storeId = itemAssignments.length === 0 ? item.storeId : null;
      if (storeId && activeTripOccurrences.has(`${item.id}:${storeId}`)) return [];
      return [{
        occurrenceId: `legacy-shopping:${item.id}:${storeId ?? 'unassigned'}`,
        pantryItem: { ...item, storeId },
        storeId,
      }];
    })
    .sort((a, b) => (
      a.pantryItem.name.localeCompare(b.pantryItem.name)
      || (a.storeId ?? '').localeCompare(b.storeId ?? '')
      || a.occurrenceId.localeCompare(b.occurrenceId)
    ));
}
