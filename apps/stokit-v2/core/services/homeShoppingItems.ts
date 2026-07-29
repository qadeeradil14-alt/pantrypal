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

export interface HomeShoppingStoreGroup {
  key: string;
  storeId: string | null;
  occurrences: HomeShoppingOccurrence[];
  previewNames: string[];
  remainingCount: number;
}

export function groupHomeShoppingOccurrencesByStore(
  occurrences: readonly HomeShoppingOccurrence[],
  previewLimit = 3,
): HomeShoppingStoreGroup[] {
  const groups = new Map<string, HomeShoppingOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = occurrence.storeId ?? 'unassigned';
    const existing = groups.get(key) ?? [];
    existing.push(occurrence);
    groups.set(key, existing);
  }
  return [...groups.entries()]
    .map(([key, storeOccurrences]) => ({
      key,
      storeId: storeOccurrences[0]?.storeId ?? null,
      occurrences: storeOccurrences,
      previewNames: storeOccurrences
        .slice(0, Math.max(0, previewLimit))
        .map((occurrence) => occurrence.pantryItem.name),
      remainingCount: Math.max(0, storeOccurrences.length - Math.max(0, previewLimit)),
    }))
    .sort((a, b) => {
      if (a.storeId === null && b.storeId === null) return 0;
      if (a.storeId === null) return 1;
      if (b.storeId === null) return -1;
      return a.key.localeCompare(b.key);
    });
}

export function homeShoppingStorePreview(
  group: HomeShoppingStoreGroup,
  expanded = false,
): string {
  const names = expanded
    ? group.occurrences.map((occurrence) => occurrence.pantryItem.name)
    : group.previewNames;
  return [
    names.join(' • '),
    !expanded && group.remainingCount > 0 ? `+${group.remainingCount} more` : '',
  ].filter(Boolean).join(' • ');
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
