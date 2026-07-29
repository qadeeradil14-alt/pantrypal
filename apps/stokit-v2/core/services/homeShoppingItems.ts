import type { PantryItem, ShoppingEntry } from '../../types';

export function homeShoppingItems(
  items: readonly PantryItem[],
  activeTripEntries: readonly Pick<ShoppingEntry, 'pantryItemId'>[],
): PantryItem[] {
  const activeTripItemIds = new Set(activeTripEntries.map((entry) => entry.pantryItemId));
  return items
    .filter((item) => (
      (item.status === 'low' || item.status === 'expiring')
      && !activeTripItemIds.has(item.id)
    ))
    .sort((a, b) => a.name.localeCompare(b.name));
}
