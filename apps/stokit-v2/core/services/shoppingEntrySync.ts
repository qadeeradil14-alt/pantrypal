import { entryStopPlacement, initialSession, type ShoppingEvent } from '../shopping-machine';
import type {
  PantryItem,
  SharedShoppingSession,
  ShoppingEntry,
  ShoppingStoreAssignment,
} from '../../types';
import { syncDiag } from './syncDiag'; // DIAG: temporary — remove after OTA 389 investigation
import {
  entryDraft,
  occurrenceId,
  stopIdForStoreOccurrence,
  stopIndexForEntry,
} from './shoppingOccurrence';

type LegacyShoppingEntry = Omit<
  ShoppingEntry,
  'entryId' | 'pantryItemId' | 'stopId'
> & {
  itemId: string;
  entryId?: string;
  pantryItemId?: string;
  stopId?: string;
};

export function decodeShoppingSession<T extends SharedShoppingSession>(session: T): T {
  const rawEntries = session.entries as unknown as Array<ShoppingEntry | LegacyShoppingEntry>;
  let changed = Boolean(session.removedItemIds) || session.removedEntryIds === undefined;
  const entries = rawEntries.map((raw) => {
    if ('entryId' in raw && raw.entryId && 'pantryItemId' in raw && raw.pantryItemId && raw.stopId) {
      if (!('itemId' in raw)) return raw;
      changed = true;
      const { itemId: _wireItemId, ...entry } = raw as ShoppingEntry & { itemId?: string };
      return entry;
    }
    changed = true;
    const legacy = raw as LegacyShoppingEntry;
    const index = stopIndexForEntry(session, legacy.storeId);
    const stopId = legacy.stopId ?? stopIdForStoreOccurrence(
      session.tripId,
      session.storeQueue,
      Math.max(index, 0),
    );
    const pantryItemId = legacy.pantryItemId ?? legacy.itemId;
    const entryId = legacy.entryId ?? legacy.itemId;
    const { itemId: _legacyItemId, ...rest } = legacy;
    return { ...rest, entryId, pantryItemId, stopId } as ShoppingEntry;
  });
  const removedEntryIds = session.removedEntryIds ?? session.removedItemIds ?? [];
  // Pre-OTA-431 payloads have no completedStopIds. Absent means "nothing known
  // to be completed", which keeps legacy sessions on their existing behaviour.
  if (session.completedStopIds === undefined) changed = true;
  const completedStopIds = session.completedStopIds ?? [];
  if (!changed) return session;
  const { removedItemIds: _wireRemovedIds, ...rest } = session;
  return { ...rest, entries, removedEntryIds, completedStopIds } as T;
}

export function encodeShoppingSession<T extends SharedShoppingSession>(session: T): T {
  const decoded = decodeShoppingSession(session);
  const entries = decoded.entries.map((entry) => {
    if (entry.entryId === entry.pantryItemId) {
      const {
        entryId,
        pantryItemId: _pantryItemId,
        stopId: _stopId,
        ...legacyCompatible
      } = entry;
      return { ...legacyCompatible, itemId: entryId };
    }
    return { ...entry, itemId: entry.entryId };
  });
  const removedItemIds = decoded.removedEntryIds ?? [];
  const { removedEntryIds: _internalRemovedIds, ...rest } = decoded;
  return { ...rest, entries, removedItemIds } as unknown as T;
}

function activeAssignmentStoreIds(
  item: PantryItem,
  assignments: ShoppingStoreAssignment[] | undefined,
): string[] {
  const itemAssignments = (assignments ?? []).filter(
    (assignment) => assignment.pantryItemId === item.id,
  );
  if (itemAssignments.length > 0) {
    return itemAssignments
      .filter((assignment) => assignment.active)
      .map((assignment) => assignment.storeId);
  }
  return item.storeId ? [item.storeId] : [];
}

function isShoppingItemAtStore(
  item: PantryItem,
  storeId: string,
  assignments: ShoppingStoreAssignment[] | undefined,
): boolean {
  return (item.status === 'low' || item.status === 'expiring')
    && activeAssignmentStoreIds(item, assignments).includes(storeId);
}

function canonicalizeCompletionShape(entry: ShoppingEntry): ShoppingEntry {
  const next = { ...entry };
  if (!next.outOfStock && next.outOfStockAt === undefined) delete next.outOfStock;
  if (next.pickedAt === undefined) delete next.pickedAt;
  if (next.outOfStockAt === undefined) delete next.outOfStockAt;
  return next;
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
  removedEntryIds: string[],
): ShoppingEntry[] {
  const byId = new Map<string, ShoppingEntry>();
  for (const entry of localEntries) byId.set(entry.entryId, canonicalizeCompletionShape(entry));
  for (const entry of remoteEntries) {
    const existing = byId.get(entry.entryId);
    if (!existing) {
      byId.set(entry.entryId, canonicalizeCompletionShape(entry));
      syncDiag('shopping_occurrence_merge', {
        decision: 'preserve_sibling',
        reason: 'new_entry_id',
        entryId: entry.entryId,
        pantryItemId: entry.pantryItemId,
        stopId: entry.stopId,
        storeId: entry.storeId,
      });
      continue;
    }
    const existingAddedAt = existing.addedAt ?? -Infinity;
    const incomingAddedAt = entry.addedAt ?? -Infinity;
    const differingStopId = existing.stopId !== entry.stopId;
    const differingAddedAt = existingAddedAt !== incomingAddedAt;
    // entryId is the modern occurrence boundary (occurrenceId() keys it by
    // tripId+stopId+pantryItemId), so two copies sharing an entryId AND a
    // stopId are provably the same stop occurrence — addedAt only versions
    // their STRUCTURAL fields (name/quantity/unit/storeId/stopId/addedAt),
    // never completion flags. A later re-add (newer addedAt, picked=false) is
    // not a newer statement about whether the item was picked, so
    // picked/outOfStock always go through resolveTimedFlag below.
    //
    // Same entryId with a DIFFERING stopId and a STRICTLY newer addedAt is
    // only reachable for legacy bare-pantryItemId entries (pre-OTA-429
    // sessions) and the machine.ts ADD_ENTRY cross-store re-add path, where
    // entryId does not encode the stop. There, entryId alone cannot prove
    // "same occurrence", so OTA 429's original contract still applies: the
    // newer-addedAt copy is a genuinely new occurrence and owns its own
    // completion state wholesale. This comparison is order-independent — the
    // strictly-larger addedAt wins regardless of which side is "local" — so
    // both merge directions agree.
    if (differingStopId && differingAddedAt) {
      const winner = existingAddedAt > incomingAddedAt ? existing : entry;
      byId.set(entry.entryId, canonicalizeCompletionShape(winner));
      syncDiag('shopping_occurrence_merge', {
        decision: 'merge_same_occurrence',
        reason: 'newer_added_at_cross_stop',
        entryId: winner.entryId,
        pantryItemId: winner.pantryItemId,
        stopId: winner.stopId,
        storeId: winner.storeId,
      });
      continue;
    }
    // Two remaining cases share this tail:
    //  - same stopId (any addedAt): the modern occurrence-scoped case.
    //  - differing stopId with EQUAL or BOTH-MISSING addedAt: OTA 429's
    //    signal (a strictly newer addedAt marking a genuinely new occurrence)
    //    is absent, so there is no basis to let one side's completion state
    //    overwrite the other's. Falling through to resolveTimedFlag below
    //    keeps this order-independent instead of picking a winner by
    //    argument position (the prior `? existing : entry` on a `>` tie
    //    always favored `entry`, which flips identity between the two merge
    //    directions and could drop a stamped pick).
    //
    // Structural-field choice must also be order-independent. addedAt still
    // decides it when it differs. On a same-stop tie, keep the historical
    // spread order (entry, i.e. remote, wins) so identical-addedAt same-stop
    // merges stay byte-for-byte unchanged. On a cross-stop tie (equal or
    // both-missing addedAt, no OTA-429 signal to arbitrate), "entry wins" is
    // NOT order-independent — swapping which side is called local vs remote
    // flips the winner — so fall back to a stable, argument-order-blind
    // comparator (the entries' own stopId strings) instead.
    const structuralWinner = differingAddedAt
      ? (existingAddedAt > incomingAddedAt ? existing : entry)
      : differingStopId
        ? (existing.stopId <= entry.stopId ? existing : entry)
        : entry;
    const structuralLoser = structuralWinner === existing ? entry : existing;
    if (differingAddedAt) {
      syncDiag('shopping_occurrence_merge', {
        decision: 'merge_same_occurrence',
        reason: 'newer_added_at',
        entryId: structuralWinner.entryId,
        pantryItemId: structuralWinner.pantryItemId,
        stopId: structuralWinner.stopId,
        storeId: structuralWinner.storeId,
      });
    } else if (differingStopId) {
      syncDiag('shopping_occurrence_merge', {
        decision: 'merge_same_occurrence',
        reason: 'equal_added_at_cross_stop',
        entryId: structuralWinner.entryId,
        pantryItemId: structuralWinner.pantryItemId,
        stopId: structuralWinner.stopId,
        storeId: structuralWinner.storeId,
      });
    } else {
      syncDiag('shopping_occurrence_merge', {
        decision: 'merge_same_occurrence',
        reason: 'same_entry_id',
        entryId: structuralWinner.entryId,
        pantryItemId: structuralWinner.pantryItemId,
        stopId: structuralWinner.stopId,
        storeId: structuralWinner.storeId,
      });
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
        entryId: entry.entryId, pantryItemId: entry.pantryItemId, flag: 'picked',
        localValue: existing.picked, localAt: existing.pickedAt,
        incomingValue: entry.picked, incomingAt: entry.pickedAt,
        winner: picked.value,
      });
    }
    if (Boolean(existing.outOfStock) !== Boolean(entry.outOfStock)) {
      syncDiag('flag_merge', {
        entryId: entry.entryId, pantryItemId: entry.pantryItemId, flag: 'outOfStock',
        localValue: Boolean(existing.outOfStock), localAt: existing.outOfStockAt,
        incomingValue: Boolean(entry.outOfStock), incomingAt: entry.outOfStockAt,
        winner: outOfStock.value,
      });
    }
    // A false value without a timestamp was injected by the old merge and is
    // not meaningful state. Remove it so existing OTA 419 sessions self-heal.
    const hasOutOfStock = outOfStock.value || outOfStock.at !== undefined;
    // Structural fields come from structuralWinner only (addedAt decides
    // this); completion flags come from resolveTimedFlag above, independent
    // of which side won structurally.
    const mergedEntry: ShoppingEntry = {
      ...structuralLoser,
      ...structuralWinner,
      picked: picked.value,
      ...(hasOutOfStock ? { outOfStock: outOfStock.value } : {}),
      // Only attach a timestamp when one exists, so legacy entries keep their
      // exact (timeless) shape.
      ...(picked.at !== undefined ? { pickedAt: picked.at } : {}),
      ...(outOfStock.at !== undefined ? { outOfStockAt: outOfStock.at } : {}),
    };
    if (!hasOutOfStock) delete mergedEntry.outOfStock;
    byId.set(entry.entryId, mergedEntry);
  }
  return Array.from(byId.values())
    .filter((entry) => !removedEntryIds.includes(entry.entryId))
    .sort((a, b) => a.entryId.localeCompare(b.entryId));
}
/**
 * Union two sides' removal tombstones, but drop any id that has since been
 * re-added on either side.
 *
 * Why this exists: occurrence tombstones are strings with no timestamp, so
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
export function resolveRemovedEntryIds(
  a: Pick<SharedShoppingSession, 'entries' | 'removedItemIds' | 'removedEntryIds' | 'removedAt'>,
  b: Pick<SharedShoppingSession, 'entries' | 'removedItemIds' | 'removedEntryIds' | 'removedAt'>,
): { removedEntryIds: string[]; removedAt?: Record<string, number> } {
  const unionIds = Array.from(new Set([
    ...(a.removedEntryIds ?? a.removedItemIds ?? []),
    ...(b.removedEntryIds ?? b.removedItemIds ?? []),
  ]));

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
      const entryId = entry.entryId ?? (entry as unknown as { itemId: string }).itemId;
      const prev = newestAddedAt.get(entryId);
      if (prev === undefined || entry.addedAt > prev) newestAddedAt.set(entryId, entry.addedAt);
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
    removedEntryIds: stillRemoved,
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

const SESSION_STATUS_PROGRESS: Record<SharedShoppingSession['status'], number> = {
  idle: -1,
  shopping_store: 0,
  receipt_prompt: 1,
  store_summary: 2,
  continue_prompt: 3,
  next_store_ready: 4,
  trip_summary: 5,
};

function compareSessionProgress(
  a: SharedShoppingSession,
  b: SharedShoppingSession,
): number {
  if (a.currentIndex !== b.currentIndex) return a.currentIndex - b.currentIndex;
  return SESSION_STATUS_PROGRESS[a.status] - SESSION_STATUS_PROGRESS[b.status];
}

function mergeStopTimestamps(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): Record<string, number> {
  const merged = { ...(left ?? {}) };
  for (const [stopId, timestamp] of Object.entries(right ?? {})) {
    merged[stopId] = Math.max(merged[stopId] ?? 0, timestamp);
  }
  return merged;
}

function stopIdAtCurrentIndex(session: SharedShoppingSession): string | null {
  const storeId = session.storeQueue[session.currentIndex];
  return storeId
    ? stopIdForStoreOccurrence(session.tripId, session.storeQueue, session.currentIndex)
    : null;
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
    return decodeShoppingSession(remoteSession);
  }
  const local = decodeShoppingSession(previous);
  const incoming = decodeShoppingSession(remoteSession);
  let preferred = compareSessionProgress(local, incoming) > 0
    ? local
    : incoming;
  const completedStopAt = mergeStopTimestamps(local.completedStopAt, incoming.completedStopAt);
  const reopenedStopAt = mergeStopTimestamps(local.reopenedStopAt, incoming.reopenedStopAt);
  const localStopId = stopIdAtCurrentIndex(local);
  const incomingStopId = stopIdAtCurrentIndex(incoming);
  if (localStopId && localStopId === incomingStopId) {
    const localTransitionAt = Math.max(
      local.completedStopAt?.[localStopId] ?? 0,
      local.reopenedStopAt?.[localStopId] ?? 0,
    );
    const incomingTransitionAt = Math.max(
      incoming.completedStopAt?.[incomingStopId] ?? 0,
      incoming.reopenedStopAt?.[incomingStopId] ?? 0,
    );
    if (localTransitionAt !== incomingTransitionAt) {
      preferred = localTransitionAt > incomingTransitionAt ? local : incoming;
    }
  }
  const other = preferred === local ? incoming : local;
  const { removedEntryIds, removedAt } = resolveRemovedEntryIds(local, incoming);
  const skipped = resolveSkippedStoreIds(local, incoming);
  const knownCompletedStopIds = Array.from(new Set([
    ...(local.completedStopIds ?? []),
    ...(incoming.completedStopIds ?? []),
  ]));
  const stopIds = new Set([
    ...knownCompletedStopIds,
    ...Object.keys(completedStopAt),
    ...Object.keys(reopenedStopAt),
  ]);
  const completedStopIds = [...stopIds].filter((stopId) => {
    const completedAt = completedStopAt[stopId] ?? 0;
    const reopenedAt = reopenedStopAt[stopId] ?? 0;
    if (completedAt > 0 || reopenedAt > 0) return completedAt > reopenedAt;
    return knownCompletedStopIds.includes(stopId);
  });
  return {
    ...preferred,
    storeQueue: mergeStoreQueues(preferred.storeQueue, other.storeQueue),
    entries: mergeShoppingEntries(local.entries, incoming.entries, removedEntryIds),
    removedEntryIds,
    completedStopIds,
    completedStopAt,
    reopenedStopAt,
    ...(removedAt !== undefined ? { removedAt } : {}),
    ...skipped,
  };
}

function mergeStoreQueues(preferred: string[], other: string[]): string[] {
  const merged = [...preferred];
  const available = new Map<string, number>();
  for (const storeId of preferred) {
    available.set(storeId, (available.get(storeId) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const storeId of other) {
    const occurrence = (seen.get(storeId) ?? 0) + 1;
    seen.set(storeId, occurrence);
    if (occurrence > (available.get(storeId) ?? 0)) {
      merged.push(storeId);
      available.set(storeId, occurrence);
    }
  }
  return merged;
}

export function reconcileShoppingSession<T extends SharedShoppingSession>(
  session: T,
  items: PantryItem[],
  assignments?: ShoppingStoreAssignment[],
): T {
  if (session.status !== 'shopping_store') return session;
  const decoded = decodeShoppingSession(session);
  const byId = new Map(items.map((item) => [item.id, item]));
  const removedEntryIds = new Set(decoded.removedEntryIds ?? []);
  let changed = false;
  const entries = decoded.entries.flatMap((entry) => {
    if (entry.pantryItemId === '__quick_scan__') return [entry];
    const item = byId.get(entry.pantryItemId);
    const stopIndex = decoded.storeQueue.findIndex(
      (_, index) =>
        stopIdForStoreOccurrence(decoded.tripId, decoded.storeQueue, index) === entry.stopId,
    );
    const occurrenceIsActiveOrPending = stopIndex < 0 || stopIndex >= decoded.currentIndex;
    const shoppingAtEntryStore = item
      ? isShoppingItemAtStore(item, entry.storeId, assignments)
      : false;
    if (
      !entry.picked
      && (!item || (!shoppingAtEntryStore && occurrenceIsActiveOrPending))
    ) {
      changed = true;
      return [];
    }
    if (!item) return [canonicalizeCompletionShape(entry)];
    if (!occurrenceIsActiveOrPending) {
      const completed = canonicalizeCompletionShape(entry);
      if (Object.keys(completed).length !== Object.keys(entry).length) changed = true;
      return [completed];
    }
    const next: ShoppingEntry = {
      ...canonicalizeCompletionShape(entry),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    };
    if (
      next.name !== entry.name ||
      next.quantity !== entry.quantity ||
      next.unit !== entry.unit ||
      next.picked !== entry.picked ||
      next.pickedAt !== entry.pickedAt ||
      next.outOfStock !== entry.outOfStock ||
      next.outOfStockAt !== entry.outOfStockAt ||
      Object.keys(next).length !== Object.keys(entry).length
    ) changed = true;
    return [next];
  });
  const storeQueue = [...decoded.storeQueue];
  for (const item of items) {
    if (item.status !== 'low' && item.status !== 'expiring') continue;
    for (const storeId of activeAssignmentStoreIds(item, assignments)) {
      // Shares entryStopPlacement with the reducer and the shopping screen so all
      // three agree on when a store may be queued. null means the stop is already
      // completed — previously this was approximated by "an entry for this
      // item+store exists", which missed the case where that entry had been
      // cleared, letting a finished store reappear as a phantom occurrence.
      const placement = entryStopPlacement(
        { ...decoded, storeQueue, entries },
        storeId,
        item.id,
      );
      if (!placement) continue;
      const { stopId } = placement;
      if (placement.storeQueue.length !== storeQueue.length) {
        storeQueue.push(storeId);
        changed = true;
      }
      if (entries.some(
        (entry) => entry.pantryItemId === item.id && entry.stopId === stopId,
      )) continue;
      const entryId = removedEntryIds.has(item.id)
        ? item.id
        : occurrenceId(decoded.tripId, stopId, item.id);
      if (removedEntryIds.has(entryId)) continue;
      entries.push({
        entryId,
        pantryItemId: item.id,
        stopId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        storeId,
        picked: false,
      });
      changed = true;
    }
  }
  return changed || decoded !== session
    ? { ...decoded, entries, storeQueue } as T
    : session;
}

export function shoppingEntryEventForItem(
  session: SharedShoppingSession | null,
  item: PantryItem | null,
  pantryItemId: string,
  assignments?: ShoppingStoreAssignment[],
): ShoppingEvent | null {
  if (!session || session.status !== 'shopping_store') return null;
  const decoded = decodeShoppingSession(session);
  const currentStoreId = decoded.storeQueue[decoded.currentIndex];
  const activeStoreIds = item ? activeAssignmentStoreIds(item, assignments) : [];
  const assignmentStoreId = activeStoreIds.includes(currentStoreId)
    ? currentStoreId
    : activeStoreIds.find((storeId) => decoded.entries.some(
        (entry) => entry.pantryItemId === pantryItemId && entry.storeId === storeId,
      ))
      ?? activeStoreIds[0];
  if (
    item
    && (item.status === 'low' || item.status === 'expiring')
    && assignmentStoreId
  ) {
    return {
      type: 'ADD_ENTRY',
      now: Date.now(),
      entry: entryDraft(item.id, item.name, item.quantity, item.unit, assignmentStoreId),
    };
  }
  const currentStopId = stopIdForStoreOccurrence(
    decoded.tripId,
    decoded.storeQueue,
    decoded.currentIndex,
  );
  const completedStopIds = new Set(decoded.completedStopIds ?? []);
  // The fallback exists for an occurrence queued at a stop other than the
  // current one (e.g. a not-yet-visited later stop). It must never resolve
  // to an already-picked entry from a completed stop — that entry has
  // already been finalized (receipt logged, item marked stocked) and
  // removing it here would silently drop it from FINISH_TRIP's
  // purchasedItems while its receipt stays behind.
  const occurrence = decoded.entries.find(
    (entry) =>
      entry.pantryItemId === pantryItemId
      && entry.stopId === currentStopId
      && !entry.picked,
  ) ?? decoded.entries.find(
    (entry) =>
      entry.pantryItemId === pantryItemId
      && !completedStopIds.has(entry.stopId)
      && !entry.picked,
  );
  return occurrence
    ? { type: 'REMOVE_ENTRY', entryId: occurrence.entryId, now: Date.now() }
    : null;
}
