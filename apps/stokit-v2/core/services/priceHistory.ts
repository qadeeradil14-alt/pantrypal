import type { PriceEntry } from '../../types';
import { normalizeItemName } from './pantryItems';

/** Returns true only for a finite positive number. Rejects 0, NaN, Infinity, negatives. */
export function isValidPrice(price: unknown): price is number {
  return typeof price === 'number' && isFinite(price) && price > 0;
}

/**
 * Returns true when an equivalent entry already exists — same normalized item
 * name, same store, and recorded within `windowMs` milliseconds. Used to guard
 * against receipt re-scan creating duplicate history rows.
 */
export function isDuplicatePriceEntry(
  entries: PriceEntry[],
  candidate: { itemName: string; storeId: string; price: number },
  windowMs = 30_000,
): boolean {
  const key = normalizeItemName(candidate.itemName);
  const cutoff = Date.now() - windowMs;
  return entries.some(
    (e) =>
      normalizeItemName(e.itemName) === key &&
      e.storeId === candidate.storeId &&
      Math.abs(e.price - candidate.price) < 0.01 &&
      e.paidAt >= cutoff,
  );
}

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
