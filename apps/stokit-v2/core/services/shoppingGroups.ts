/**
 * The Shopping tab's grouped store view.
 *
 * Two sources of truth, chosen by whether a trip is running:
 *
 *  - Trip active  → session.entries grouped by stopId. A shopping occurrence is
 *    identified by (pantryItemId, stopId), so the same pantry item may appear
 *    under as many stops as the shopper assigned it to. One group per stop, in
 *    queue order, so a revisited store yields two distinct groups.
 *
 *  - Idle → pantry items grouped by item.storeId, the planning view.
 *
 * Why this split exists: PantryItem.storeId is a single scalar, so durable state
 * can only ever say "Apple belongs to Safeway". Grouping the in-trip view by
 * that field collapsed Apple@Costco and Apple@Safeway into one row and made the
 * earlier store vanish. The occurrence model already represents both correctly;
 * this selector is what lets the UI read it. The pantry stays the canonical
 * inventory — nothing here writes to it.
 */

import type { PantryItem, ShoppingEntry, Unit } from '../../types';
import { stopIdForQueueIndex, type ShoppingSession } from '../shopping-machine';

export interface ShoppingGroupItem {
  pantryItemId: string;
  /** Present only for occurrence-derived groups (an active trip). */
  entryId?: string;
  name: string;
  quantity: number;
  unit: Unit;
  picked: boolean;
}

export interface ShoppingGroup {
  /** Stable React key: stopId during a trip, storeId when idle. */
  key: string;
  storeId: string;
  items: ShoppingGroupItem[];
}

function isShoppable(item: PantryItem): boolean {
  return item.status === 'low' || item.status === 'expiring';
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

function fromEntry(entry: ShoppingEntry): ShoppingGroupItem {
  return {
    pantryItemId: entry.pantryItemId,
    entryId: entry.entryId,
    name: entry.name,
    quantity: entry.quantity,
    unit: entry.unit,
    picked: Boolean(entry.picked),
  };
}

export function isTripActive(
  session: Pick<ShoppingSession, 'status'>,
): boolean {
  return session.status !== 'idle';
}

export function shoppingGroups(
  session: Pick<ShoppingSession, 'status' | 'tripId' | 'storeQueue' | 'entries'>,
  items: PantryItem[],
): ShoppingGroup[] {
  if (isTripActive(session)) {
    const groups: ShoppingGroup[] = [];
    // Queue order, so groups read in the order the shopper visits them. Each
    // index is its own stop, which keeps a revisited store as a separate group
    // instead of merging it back into the earlier visit.
    session.storeQueue.forEach((storeId, index) => {
      const stopId = stopIdForQueueIndex(session, index);
      const stopItems = session.entries
        .filter((entry) => entry.stopId === stopId)
        .map(fromEntry)
        .sort(byName);
      groups.push({ key: stopId, storeId, items: stopItems });
    });
    return groups;
  }

  const order: string[] = [];
  const byStore = new Map<string, ShoppingGroupItem[]>();
  for (const item of items) {
    if (!isShoppable(item) || !item.storeId) continue;
    if (!byStore.has(item.storeId)) {
      byStore.set(item.storeId, []);
      order.push(item.storeId);
    }
    byStore.get(item.storeId)!.push({
      pantryItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      picked: false,
    });
  }
  return order.map((storeId) => ({
    key: storeId,
    storeId,
    items: byStore.get(storeId)!.sort(byName),
  }));
}
