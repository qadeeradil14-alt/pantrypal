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
 *  - Idle → durable item/store assignments, with PantryItem.storeId only as
 *    a legacy fallback for snapshots created before the occurrence ledger.
 *
 * Why this split exists: PantryItem.storeId is a single scalar, so durable state
 * can only ever say "Apple belongs to Safeway". Grouping the in-trip view by
 * that field collapsed Apple@Costco and Apple@Safeway into one row and made the
 * earlier store vanish. The occurrence model already represents both correctly;
 * this selector is what lets the UI read it. The pantry stays the canonical
 * inventory — nothing here writes to it.
 */

import type {
  PantryItem,
  ShoppingEntry,
  ShoppingStoreAssignment,
  Unit,
} from '../../types';
import { stopIdForQueueIndex, type ShoppingSession } from '../shopping-machine';
import { shoppingEntryDraftsFromAssignments } from './shoppingStoreAssignments';

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
  assignments?: ShoppingStoreAssignment[],
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
  for (const entry of shoppingEntryDraftsFromAssignments(items, assignments)) {
    if (!byStore.has(entry.storeId)) {
      byStore.set(entry.storeId, []);
      order.push(entry.storeId);
    }
    byStore.get(entry.storeId)!.push({
      pantryItemId: entry.pantryItemId,
      name: entry.name,
      quantity: entry.quantity,
      unit: entry.unit,
      picked: false,
    });
  }
  return order.map((storeId) => ({
    key: storeId,
    storeId,
    items: byStore.get(storeId)!.sort(byName),
  }));
}
