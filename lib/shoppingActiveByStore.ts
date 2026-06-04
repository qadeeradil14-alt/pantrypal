import type { ShoppingEntry } from '../store/shopping';
import type { Item } from './items';

export const UNASSIGNED_STORE_KEY = 'unassigned';

export type ActiveShoppingCounts = {
  byStoreId: Record<string, number>;
  unassigned: number;
  total: number;
};

export function getLinkedPreferredStoreId(
  entry: ShoppingEntry,
  sourceItemMap: Map<string, Item>,
): string | null {
  const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
  return linked?.preferred_store_id ?? null;
}

/** Count active shopping-list entries per preferred store (pantry-linked only). */
export function countActiveShoppingByStore(
  activeEntries: ShoppingEntry[],
  sourceItemMap: Map<string, Item>,
): ActiveShoppingCounts {
  const byStoreId: Record<string, number> = {};
  let unassigned = 0;

  for (const entry of activeEntries) {
    const storeId = getLinkedPreferredStoreId(entry, sourceItemMap);
    if (!storeId) {
      unassigned += 1;
      continue;
    }
    byStoreId[storeId] = (byStoreId[storeId] ?? 0) + 1;
  }

  return { byStoreId, unassigned, total: activeEntries.length };
}

export function activeCountForStore(counts: ActiveShoppingCounts, storeId: string | null): number {
  if (storeId === null) return counts.total;
  return counts.byStoreId[storeId] ?? 0;
}

export function storeIdsWithActiveItems(counts: ActiveShoppingCounts): string[] {
  return Object.keys(counts.byStoreId).filter((id) => (counts.byStoreId[id] ?? 0) > 0);
}

export function formatStoreChipLabel(name: string, count: number): string {
  return `${name} (${count})`;
}
