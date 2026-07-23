import type { ShoppingEvent } from '../shopping-machine';
import type { PantryItem, SharedShoppingSession, ShoppingEntry } from '../../types';

function isShoppingItem(item: PantryItem): boolean {
  return (item.status === 'low' || item.status === 'expiring') && Boolean(item.storeId);
}

/**
 * Resolve one completion flag (picked / outOfStock) across two devices by
 * last-tap-wins: the side whose change is more recent wins. A defined timestamp
 * always beats a missing one; equal timestamps fall back to OR so the outcome is
 * independent of argument order (both devices converge). When NEITHER side has a
 * timestamp — legacy snapshots from before this field existed — it degrades to
 * the historical sticky-OR merge, preserving backward compatibility.
 */
function resolveTimedFlag(
  aValue: boolean,
  aAt: number | undefined,
  bValue: boolean,
  bAt: number | undefined,
): { value: boolean; at: number | undefined } {
  if (aAt === undefined && bAt === undefined) {
    return { value: aValue || bValue, at: undefined };
  }
  const a = aAt ?? -Infinity;
  const b = bAt ?? -Infinity;
  if (a > b) return { value: aValue, at: aAt };
  if (b > a) return { value: bValue, at: bAt };
  return { value: aValue || bValue, at: aAt ?? bAt };
}

export function mergeShoppingEntries(
  localEntries: ShoppingEntry[],
  remoteEntries: ShoppingEntry[],
  removedItemIds: string[],
): ShoppingEntry[] {
  const byId = new Map<string, ShoppingEntry>();
  for (const entry of localEntries) byId.set(entry.itemId, entry);
  for (const entry of remoteEntries) {
    const existing = byId.get(entry.itemId);
    if (!existing) {
      byId.set(entry.itemId, entry);
      continue;
    }
    const picked = resolveTimedFlag(existing.picked, existing.pickedAt, entry.picked, entry.pickedAt);
    const outOfStock = resolveTimedFlag(
      Boolean(existing.outOfStock), existing.outOfStockAt,
      Boolean(entry.outOfStock), entry.outOfStockAt,
    );
    byId.set(entry.itemId, {
      ...existing,
      ...entry,
      picked: picked.value,
      outOfStock: outOfStock.value,
      // Only attach a timestamp when one exists, so legacy entries keep their
      // exact (timeless) shape.
      ...(picked.at !== undefined ? { pickedAt: picked.at } : {}),
      ...(outOfStock.at !== undefined ? { outOfStockAt: outOfStock.at } : {}),
    });
  }
  return Array.from(byId.values()).filter((entry) => !removedItemIds.includes(entry.itemId));
}

export function reconcileShoppingSession<T extends SharedShoppingSession>(
  session: T,
  items: PantryItem[],
): T {
  if (session.status !== 'shopping_store') return session;
  const byId = new Map(items.map((item) => [item.id, item]));
  const removedItemIds = new Set(session.removedItemIds ?? []);
  let changed = false;
  const entries = session.entries.flatMap((entry) => {
    if (entry.itemId === '__quick_scan__') return [entry];
    const item = byId.get(entry.itemId);
    if (!item || !isShoppingItem(item)) {
      changed = true;
      return [];
    }
    const next: ShoppingEntry = {
      ...entry,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      storeId: item.storeId!,
    };
    if (
      next.name !== entry.name ||
      next.quantity !== entry.quantity ||
      next.unit !== entry.unit ||
      next.storeId !== entry.storeId
    ) changed = true;
    return [next];
  });
  const entryIds = new Set(entries.map((entry) => entry.itemId));
  for (const item of items) {
    if (!isShoppingItem(item) || entryIds.has(item.id) || removedItemIds.has(item.id)) continue;
    entries.push({
      itemId: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      storeId: item.storeId!,
      picked: false,
    });
    entryIds.add(item.id);
    changed = true;
  }
  const storeQueue = [...session.storeQueue];
  for (const entry of entries) {
    if (!storeQueue.includes(entry.storeId)) {
      storeQueue.push(entry.storeId);
      changed = true;
    }
  }
  return changed ? { ...session, entries, storeQueue } : session;
}

export function shoppingEntryEventForItem(
  session: SharedShoppingSession | null,
  item: PantryItem | null,
  itemId: string,
): ShoppingEvent | null {
  if (!session || session.status !== 'shopping_store') return null;
  if (item && isShoppingItem(item)) {
    return {
      type: 'ADD_ENTRY',
      entry: {
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        storeId: item.storeId!,
        picked: false,
      },
    };
  }
  return session.entries.some((entry) => entry.itemId === itemId)
    ? { type: 'REMOVE_ENTRY', itemId }
    : null;
}
