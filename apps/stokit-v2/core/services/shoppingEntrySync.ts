import { initialSession, type ShoppingEvent } from '../shopping-machine';
import type { PantryItem, SharedShoppingSession, ShoppingEntry } from '../../types';
import { syncDiag } from './syncDiag'; // DIAG: temporary — remove after OTA 389 investigation

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
    // DIAG: temporary — remove after OTA 389 investigation. Logs only; the
    // resolved values above/below are unchanged.
    if (existing.picked !== entry.picked) {
      syncDiag('flag_merge', {
        itemId: entry.itemId, flag: 'picked',
        localValue: existing.picked, localAt: existing.pickedAt,
        incomingValue: entry.picked, incomingAt: entry.pickedAt,
        winner: picked.value,
      });
    }
    if (Boolean(existing.outOfStock) !== Boolean(entry.outOfStock)) {
      syncDiag('flag_merge', {
        itemId: entry.itemId, flag: 'outOfStock',
        localValue: Boolean(existing.outOfStock), localAt: existing.outOfStockAt,
        incomingValue: Boolean(entry.outOfStock), incomingAt: entry.outOfStockAt,
        winner: outOfStock.value,
      });
    }
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

/**
 * Fold an incoming remote session into the local one when applying a pull or
 * realtime patch — used identically by session-store.ts's applyRemoteSession
 * and durable-store.ts's gateRemoteActiveSession so the two can't diverge.
 *
 * Previously this only merged entries when BOTH sides reported the exact same
 * `status` (e.g. both 'shopping_store'); any other pairing fell through to a
 * blind replace with the remote session. But the active shopper's device
 * legitimately advances through receipt_prompt / store_summary /
 * next_store_ready / shopping_store (next store) while a stay-home
 * collaborator's device is still sitting on 'shopping_store' for the very
 * same trip — a same-trip status mismatch that is completely normal, not a
 * sign the local session is stale. The blind replace in that case discarded
 * any entry the collaborator had just added locally before it round-tripped
 * through Supabase (root cause of items a collaborator adds mid-trip
 * disappearing on their own device and never reaching the shopper).
 *
 * Fix: any same-trip pair where neither side has already reached a terminal
 * state (idle/trip_summary) now folds instead of replaces. Remote's
 * status/currentIndex/storeQueue ordering remain authoritative for trip
 * progression (unchanged from today) — only entries and storeQueue contents
 * get a non-destructive union, so a not-yet-synced local entry always
 * survives regardless of which sub-status either side is currently in.
 */
export function foldRemoteActiveSession<T extends SharedShoppingSession>(
  previous: T | null,
  remoteSession: T,
  isClosedTripId?: (tripId: string) => boolean,
): T {
  if (
    !previous ||
    previous.status === 'idle' ||
    previous.status === 'trip_summary' ||
    previous.tripId !== remoteSession.tripId
  ) {
    // A remote session for a tripId this device already knows is closed
    // (canceled or finished) is a stale echo from a device that hasn't
    // caught up yet — never let it resurrect the closed trip, regardless of
    // what local's current status happens to be.
    if (remoteSession.tripId && isClosedTripId?.(remoteSession.tripId)) {
      return previous ?? (initialSession as unknown as T);
    }
    return remoteSession;
  }
  const removedItemIds = Array.from(
    new Set([...(previous.removedItemIds ?? []), ...(remoteSession.removedItemIds ?? [])]),
  );
  return {
    ...remoteSession,
    storeQueue: [
      ...remoteSession.storeQueue,
      ...previous.storeQueue.filter((storeId) => !remoteSession.storeQueue.includes(storeId)),
    ],
    entries: mergeShoppingEntries(previous.entries, remoteSession.entries, removedItemIds),
    removedItemIds,
  };
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
