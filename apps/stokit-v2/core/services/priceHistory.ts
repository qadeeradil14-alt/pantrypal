import type { PriceEntry } from '../../types';
import { normalizeItemName } from './pantryItems';

export function itemPriceHistory(entries: PriceEntry[], itemName: string): PriceEntry[] {
  const key = normalizeItemName(itemName);
  return entries
    .filter((entry) => normalizeItemName(entry.itemName) === key)
    .sort((a, b) => b.paidAt - a.paidAt);
}

export function lastPriceAtStore(
  entries: PriceEntry[],
  itemName: string,
  storeId: string,
): PriceEntry | undefined {
  return itemPriceHistory(entries, itemName).find((entry) => entry.storeId === storeId);
}

export function cheapestRecentPrice(entries: PriceEntry[], itemName: string): PriceEntry | undefined {
  const latestByStore = new Map<string, PriceEntry>();
  for (const entry of itemPriceHistory(entries, itemName)) {
    if (!latestByStore.has(entry.storeId)) latestByStore.set(entry.storeId, entry);
  }
  return [...latestByStore.values()].sort((a, b) => a.price - b.price)[0];
}
