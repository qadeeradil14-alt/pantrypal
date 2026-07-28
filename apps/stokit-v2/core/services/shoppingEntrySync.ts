import { initialSession, type ShoppingEvent } from '../shopping-machine';
import type { PantryItem, SharedShoppingSession, ShoppingEntry } from '../../types';
import { syncDiag } from './syncDiag'; // DIAG: temporary — remove after OTA 389 investigation

function isShoppingItem(item: PantryItem): boolean {
  return (item.status === 'low' || item.status === 'expiring') && Boolean(item.storeId);
}

function canonicalizeCompletionShape(entry: ShoppingEntry): ShoppingEntry {
  const next = { ...entry };
  if (!next.outOfStock && next.outOfStockAt === undefined) delete next.outOfStock;
  if (next.pickedAt === undefined) delete next.pickedAt;
  if (next.outOfStockAt === undefined) delete next.outOfStockAt;
  return next;
}

function resetCompletionState(entry: ShoppingEntry): ShoppingEntry {
  const {
    pickedAt: _pickedAt,
    outOfStock: _outOfStock,
    outOfStockAt: _outOfStockAt,
    ...rest
  } = entry;
  return { ...rest, picked: false };
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
  for (const entry of localEntries) byId.set(entry.itemId, canonicalizeCompletionShape(entry));
  for (const entry of remoteEntries) {
    const existing = byId.get(entry.itemId);
    if (!existing) {
      byId.set(entry.itemId, canonicalizeCompletionShape(entry));
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
    // A false value without a timestamp was injected by the old merge and is
    // not meaningful state. Remove it so existing OTA 419 sessions self-heal.
    const hasOutOfStock = outOfStock.value || outOfStock.at !== undefined;
    const mergedEntry: ShoppingEntry = {
      ...existing,
      ...entry,
      picked: picked.value,
      ...(hasOutOfStock ? { outOfStock: outOfStock.value } : {}),
      // Only attach a timestamp when one exists, so legacy entries keep their
      // exact (timeless) shape.
      ...(picked.at !== undefined ? { pickedAt: picked.at } : {}),
      ...(outOfStock.at !== undefined ? { outOfStockAt: outOfStock.at } : {}),
    };
    if (!hasOutOfStock) delete mergedEntry.outOfStock;
    byId.set(entry.itemId, mergedEntry);
  }
  return Array.from(byId.values()).filter((entry) => !removedItemIds.includes(entry.itemId));
}
/**
 * Union two sides' removal tombstones, but drop any id that has since been
 * re-added on either side.
 *
 * Why this exists: `removedItemIds` is a plain string[] with no timestamp, so
 * once an id landed there on ANY device, every subsequent merge re-unioned it
 * and mergeShoppingEntries filtered that item out again — permanently. The
 * local reducer un-tombstones on ADD_ENTRY, but the peer still carried the old
 * tombstone, so the very next sync deleted the re-added item on both devices.
 * This is why re-adding a previously removed (or previously purchased, since
 * going `stocked` emits REMOVE_ENTRY) item silently failed to stick.
 *
 * Resolution: an id stays removed unless some side holds it as a live entry
 * whose `addedAt` is strictly newer than the newest `removedAt` for that id.
 * Legacy data (no addedAt / no removedAt) keeps the original tombstone-wins
 * behavior, so genuine deletions still propagate exactly as before.
 */
export function resolveRemovedItemIds(
  a: Pick<SharedShoppingSession, 'entries' | 'removedItemIds' | 'removedAt'>,
  b: Pick<SharedShoppingSession, 'entries' | 'removedItemIds' | 'removedAt'>,
): { removedItemIds: string[]; removedAt?: Record<string, number> } {
  const unionIds = Array.from(new Set([...(a.removedItemIds ?? []), ...(b.removedItemIds ?? [])]));

  const removedAt: Record<string, number> = {};
  for (const side of [a, b]) {
    for (const [id, at] of Object.entries(side.removedAt ?? {})) {
      if (removedAt[id] === undefined || at > removedAt[id]) removedAt[id] = at;
    }
  }

  const newestAddedAt = new Map<string, number>();
  for (const side of [a, b]) {
    for (const entry of side.entries ?? []) {
      if (entry.addedAt === undefined) continue;
      const prev = newestAddedAt.get(entry.itemId);
      if (prev === undefined || entry.addedAt > prev) newestAddedAt.set(entry.itemId, entry.addedAt);
    }
  }

  const stillRemoved = unionIds.filter((id) => {
    const addedAt = newestAddedAt.get(id);
    const removedStamp = removedAt[id];
    // A stamped add is an explicit post-upgrade re-add and wins over a legacy
    // tombstone that had no timestamp. An unstamped legacy entry stays deleted.
    if (addedAt === undefined) return true;
    if (removedStamp === undefined) return false;
    return addedAt <= removedStamp;
  });

  const prunedRemovedAt = Object.fromEntries(
    Object.entries(removedAt).filter(([id]) => stillRemoved.includes(id)),
  );

  return {
    removedItemIds: stillRemoved,
    ...(Object.keys(prunedRemovedAt).length > 0 ? { removedAt: prunedRemovedAt } : {}),
  };
}

export function resolveSkippedStoreIds(
  a: Pick<SharedShoppingSession, 'skippedStoreIds' | 'skippedAt' | 'unskippedAt'>,
  b: Pick<SharedShoppingSession, 'skippedStoreIds' | 'skippedAt' | 'unskippedAt'>,
): {
  skippedStoreIds: string[];
  skippedAt?: Record<string, number>;
  unskippedAt?: Record<string, number>;
} {
  const ids = new Set([
    ...(a.skippedStoreIds ?? []),
    ...(b.skippedStoreIds ?? []),
    ...Object.keys(a.skippedAt ?? {}),
    ...Object.keys(b.skippedAt ?? {}),
    ...Object.keys(a.unskippedAt ?? {}),
    ...Object.keys(b.unskippedAt ?? {}),
  ]);
  const skippedAt: Record<string, number> = {};
  const unskippedAt: Record<string, number> = {};
  for (const id of ids) {
    const skip = Math.max(a.skippedAt?.[id] ?? -Infinity, b.skippedAt?.[id] ?? -Infinity);
    const unskip = Math.max(a.unskippedAt?.[id] ?? -Infinity, b.unskippedAt?.[id] ?? -Infinity);
    if (Number.isFinite(skip)) skippedAt[id] = skip;
    if (Number.isFinite(unskip)) unskippedAt[id] = unskip;
  }
  const skippedStoreIds = Array.from(ids).filter((id) => {
    const skip = skippedAt[id];
    const unskip = unskippedAt[id];
    if (skip === undefined && unskip === undefined) {
      return (a.skippedStoreIds ?? []).includes(id) || (b.skippedStoreIds ?? []).includes(id);
    }
    if (unskip === undefined) return true;
    if (skip === undefined) return false;
    return skip >= unskip;
  });
  return {
    skippedStoreIds,
    ...(Object.keys(skippedAt).length ? { skippedAt } : {}),
    ...(Object.keys(unskippedAt).length ? { unskippedAt } : {}),
  };
}

/**
 * THE single merge policy shared by the pull path (foldRemoteActiveSession,
 * used by session-store/durable-store) and the push path (mergeActiveSession
 * in mergeDurableSnapshot.ts).
 *
 * Two sessions may be folded together when they describe the same trip and the
 * side being folded *into* is not already terminal. Deliberately does NOT
 * require both sides to report the same `status`: the active shopper's device
 * legitimately walks shopping_store → receipt_prompt → store_summary →
 * next_store_ready while a collaborator's device is still `shopping_store` for
 * the same trip. Requiring status equality made the push path silently discard
 * everything the collaborator added during that window (Store B entries), which
 * the pull path then restored locally — producing permanent divergence and
 * ping-pong sync between the two devices.
 *
 * Both call sites MUST go through this predicate so the two paths can never
 * drift apart again.
 */
export function canFoldActiveSessions(
  previous: SharedShoppingSession | null | undefined,
  incoming: SharedShoppingSession | null | undefined,
): boolean {
  if (!previous || !incoming) return false;
  if (previous.status === 'idle' || previous.status === 'trip_summary') return false;
  return previous.tripId === incoming.tripId;
}

export function foldRemoteActiveSession<T extends SharedShoppingSession>(
  previous: T | null,
  remoteSession: T,
  isClosedTripId?: (tripId: string) => boolean,
): T {
  // `!previous` is redundant with canFoldActiveSessions but narrows the type.
  if (!previous || !canFoldActiveSessions(previous, remoteSession)) {
    // A remote session for a tripId this device already knows is closed
    // (canceled or finished) is a stale echo from a device that hasn't
    // caught up yet — never let it resurrect the closed trip, regardless of
    // what local's current status happens to be.
    if (remoteSession.tripId && isClosedTripId?.(remoteSession.tripId)) {
      return previous ?? (initialSession as unknown as T);
    }
    return remoteSession;
  }
  const { removedItemIds, removedAt } = resolveRemovedItemIds(previous, remoteSession);
  const skipped = resolveSkippedStoreIds(previous, remoteSession);
  return {
    ...remoteSession,
    storeQueue: [
      ...remoteSession.storeQueue,
      ...previous.storeQueue.filter((storeId) => !remoteSession.storeQueue.includes(storeId)),
    ],
    entries: mergeShoppingEntries(previous.entries, remoteSession.entries, removedItemIds),
    removedItemIds,
    ...(removedAt !== undefined ? { removedAt } : {}),
    ...skipped,
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
    const entryStoreIndex = session.storeQueue.indexOf(entry.storeId);
    const completionIsFromFinishedAssignment =
      entry.storeId !== item.storeId ||
      (entryStoreIndex >= 0 && entryStoreIndex < session.currentIndex);
    const next: ShoppingEntry = {
      ...(completionIsFromFinishedAssignment
        ? resetCompletionState(entry)
        : canonicalizeCompletionShape(entry)),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      storeId: item.storeId!,
    };
    if (
      next.name !== entry.name ||
      next.quantity !== entry.quantity ||
      next.unit !== entry.unit ||
      next.storeId !== entry.storeId ||
      next.picked !== entry.picked ||
      next.pickedAt !== entry.pickedAt ||
      next.outOfStock !== entry.outOfStock ||
      next.outOfStockAt !== entry.outOfStockAt ||
      Object.keys(next).length !== Object.keys(entry).length
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
      now: Date.now(),
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
    ? { type: 'REMOVE_ENTRY', itemId, now: Date.now() }
    : null;
}
