import type { PantryItem, ShoppingEntry } from '../../types';

export function homeShoppingItems(
  items: readonly PantryItem[],
  activeTripEntries: readonly Pick<ShoppingEntry, 'itemId'>[],
): PantryItem[] {
  const activeTripItemIds = new Set(activeTripEntries.map((entry) => entry.itemId));
  return items
    .filter((item) => (
      (item.status === 'low' || item.status === 'expiring')
      && !activeTripItemIds.has(item.id)
    ))
    .sort((a, b) => a.name.localeCompare(b.name));
}
