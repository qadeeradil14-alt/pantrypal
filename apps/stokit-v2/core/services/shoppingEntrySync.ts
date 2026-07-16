import type { ShoppingEvent } from '../shopping-machine';
import type { PantryItem, SharedShoppingSession, ShoppingEntry } from '../../types';

function isShoppingItem(item: PantryItem): boolean {
  return (item.status === 'low' || item.status === 'expiring') && Boolean(item.storeId);
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
    byId.set(
      entry.itemId,
      existing
        ? {
            ...existing,
            ...entry,
            picked: existing.picked || entry.picked,
            outOfStock: Boolean(existing.outOfStock || entry.outOfStock),
          }
        : entry,
    );
  }
  return Array.from(byId.values()).filter((entry) => !removedItemIds.includes(entry.itemId));
}

export function reconcileShoppingSession<T extends SharedShoppingSession>(
  session: T,
  items: PantryItem[],
): T {
  if (session.status !== 'shopping_store') return session;
  const removedItemIds = new Set(session.removedItemIds ?? []);
  const entries = session.entries.filter((entry) => !removedItemIds.has(entry.itemId));
  let changed = entries.length !== session.entries.length;
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
  if (item) return null;
  return session.entries.some((entry) => entry.itemId === itemId)
    ? { type: 'REMOVE_ENTRY', itemId }
    : null;
}
