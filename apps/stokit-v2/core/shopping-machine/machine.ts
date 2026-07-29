/**
 * Stokit V2 — shopping session state machine.
 *
 * Pure, deterministic reducer. No React Native / Expo imports.
 *
 * Full multi-stop flow:
 *   idle
 *     -> shopping_store      START_TRIP
 *     -> receipt_prompt      FINISH_STORE
 *     -> store_summary       SAVE_RECEIPT | SKIP_RECEIPT         ← per-store card
 *     -> next_store_ready    CONTINUE_TRIP (more pending)        ← pick next store
 *     -> continue_prompt     ACKNOWLEDGE_SUMMARY                 ← legacy persisted flow
 *        -> shopping_store   START_MANUAL_STORE                  ← unplanned store visit
 *        -> shopping_store   CHOOSE_NEXT_STORE | ADVANCE_STORE
 *        -> next_store_ready SKIP_STORE (more still pending)
 *        -> trip_summary     FINISH_TRIP_EARLY | SKIP_STORE (none left)
 *        -> trip_summary     FINISH_TRIP                         ← full summary
 *     -> idle                END_TRIP
 *
 * Hard rules:
 *  - One pantry item may have one independent occurrence per store stop.
 *  - A store with zero items never enters the queue.
 *  - Receipts live in session; committed to durable state at trip_summary.
 *  - Skipping a receipt advances exactly like saving one.
 *  - store_summary always appears before next_store_ready or trip_summary.
 *  - ADVANCE_STORE picks the first non-skipped pending store (backward-compat).
 */

import type {
  Receipt,
  ReceiptLineItem,
  ReceiptStatus,
  ShoppingEntry,
  ShoppingEntryDraft,
  Trip,
  TripPurchasedItem,
  TripStoreBreakdown,
} from '../../types';
import { nextTimestamp } from '../services/id';
import {
  occurrenceId,
  stopIdForStoreOccurrence,
} from '../services/shoppingOccurrence';

export type SessionStatus =
  | 'idle'
  | 'shopping_store'
  | 'receipt_prompt'
  | 'store_summary'
  | 'continue_prompt'
  | 'next_store_ready'
  | 'trip_summary';

export interface ShoppingSession {
  /** Household member operating this trip. Null preserves legacy sessions. */
  shopperId: string | null;
  status: SessionStatus;
  tripId: string | null;
  startedAt: number | null;
  /** Ordered list of store ids to visit. Only stores with ≥1 item are included. */
  storeQueue: string[];
  /** Index into storeQueue of the store currently being shopped / prompted / summarised. */
  currentIndex: number;
  /** Store IDs the user explicitly skipped without shopping. */
  skippedStoreIds: string[];
  skippedAt?: Record<string, number>;
  unskippedAt?: Record<string, number>;
  /**
   * Stop ids already visited and closed out. Set when a receipt is saved or
   * skipped. This is the durable record that a stop is finished — previously
   * the only signal was `currentIndex`, which the item→entry sync paths could
   * not distinguish from "store not planned yet", so they re-queued a finished
   * store as a fresh occurrence. Monotonic within a trip; unioned across peers.
   */
  completedStopIds: string[];
  entries: ShoppingEntry[];
  /** Shopping occurrence ids removed mid-trip. */
  removedEntryIds: string[];
  /**
   * Wall-clock ms each removedEntryIds entry was removed. Compared against an
   * entry's `addedAt` so re-adding a previously-removed item wins over the old
   * tombstone. Absent on legacy sessions (merge then keeps tombstone-wins).
   */
  removedAt?: Record<string, number>;
  /** Receipts accumulated during this trip. Committed at trip_summary. */
  receipts: Receipt[];
  /** Populated only when status === 'trip_summary'. */
  completedTrip: Trip | null;
}

export const initialSession: ShoppingSession = {
  shopperId: null,
  status: 'idle',
  tripId: null,
  startedAt: null,
  storeQueue: [],
  currentIndex: 0,
  skippedStoreIds: [],
  completedStopIds: [],
  entries: [],
  removedEntryIds: [],
  receipts: [],
  completedTrip: null,
};

export type ShoppingEvent =
  | { type: 'START_TRIP'; entries: ShoppingEntryDraft[]; now: number; shopperId?: string | null }
  | { type: 'TOGGLE_PICK'; entryId: string; now?: number }
  | { type: 'SET_PICK'; entryId: string; picked: boolean; now?: number }
  | { type: 'FINISH_STORE'; now: number }
  | {
      type: 'SAVE_RECEIPT';
      amount: number;
      status: Extract<ReceiptStatus, 'logged' | 'photo_pending'>;
      imageUri?: string | null;
      items?: ReceiptLineItem[];
      now: number;
    }
  | { type: 'SKIP_RECEIPT'; now: number }
  /** Legacy transition kept for persisted sessions and older clients. */
  | { type: 'ACKNOWLEDGE_SUMMARY' }
  | { type: 'CONTINUE_TRIP' }
  | { type: 'START_MANUAL_STORE'; storeId: string }
  | { type: 'FINISH_TRIP'; now: number }
  /** User picks a specific next store from the pending list. */
  | { type: 'CHOOSE_NEXT_STORE'; storeId: string }
  /** User skips a pending store (must still be visited once; mark it skipped). */
  | { type: 'SKIP_STORE'; storeId: string; now: number }
  /** User finishes the trip now; all pending stores become skipped. */
  | { type: 'FINISH_TRIP_EARLY'; now: number }
  /** Legacy — picks first pending store. Kept for test backward-compat. */
  | { type: 'ADVANCE_STORE' }
  | { type: 'END_TRIP' }
  | { type: 'ADD_ENTRY'; entry: ShoppingEntryDraft; now?: number }
  /** Removes an entry added by mistake mid-trip (e.g. accidental item). */
  | { type: 'REMOVE_ENTRY'; entryId: string; now?: number }
  | { type: 'RESUME_TRIP' }
  | { type: 'MARK_OUT_OF_STOCK'; entryId: string; now?: number }
  | { type: 'UNSKIP_STORE'; storeId: string; now?: number }
  | { type: 'UPDATE_QUANTITY'; entryId: string; quantity: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildQueue(raw: ShoppingEntryDraft[], tripId: string, addedAt?: number): {
  queue: string[];
  entries: ShoppingEntry[];
} {
  const seen = new Set<string>();
  const entries: ShoppingEntry[] = [];
  const queue: string[] = [];
  for (const e of raw) {
    const occurrenceKey = `${e.pantryItemId}\u0000${e.storeId}`;
    if (seen.has(occurrenceKey)) continue;
    seen.add(occurrenceKey);
    if (!queue.includes(e.storeId)) queue.push(e.storeId);
    const stopIndex = queue.indexOf(e.storeId);
    entries.push({
      ...e,
      entryId: occurrenceId(
        tripId,
        stopIdForStoreOccurrence(tripId, queue, stopIndex),
        e.pantryItemId,
      ),
      stopId: stopIdForStoreOccurrence(tripId, queue, stopIndex),
      picked: false,
      ...(addedAt !== undefined ? { addedAt } : {}),
    });
  }
  return { queue, entries };
}

export function entriesForStore(
  session: ShoppingSession,
  storeId: string,
): ShoppingEntry[] {
  return session.entries
    .filter((e) => e.storeId === storeId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function currentStoreId(session: ShoppingSession): string | null {
  return session.storeQueue[session.currentIndex] ?? null;
}

export function currentStoreEntries(session: ShoppingSession): ShoppingEntry[] {
  const stopId = stopIdForQueueIndex(session, session.currentIndex);
  return stopId ? session.entries.filter((entry) => entry.stopId === stopId) : [];
}

export function stopIdForQueueIndex(
  session: Pick<ShoppingSession, 'tripId' | 'storeQueue'>,
  index: number,
): string {
  return stopIdForStoreOccurrence(session.tripId, session.storeQueue, index);
}

/** True when this trip already closed out a stop at `storeId`. */
export function hasCompletedStopForStore(
  session: Pick<ShoppingSession, 'tripId' | 'storeQueue'> & { completedStopIds?: string[] },
  storeId: string,
): boolean {
  const completed = session.completedStopIds ?? [];
  if (completed.length === 0) return false;
  return session.storeQueue.some(
    (candidate, index) =>
      candidate === storeId &&
      completed.includes(stopIdForQueueIndex(session, index)),
  );
}

/**
 * Where `pantryItemId` should land for the active trip, given its store.
 *
 * Returns the (possibly extended) queue and the stop the entry joins, or null
 * when the item must NOT be auto-added at all.
 *
 * The null case is deliberately per-item, not per-store. An item that already
 * had an occurrence at a *completed* stop for this store was shopped there and
 * left unpicked (or out of stock); re-adding it appends a phantom second
 * occurrence, so the finished store reappears forever. But an item newly
 * assigned to that store mid-trip has no such occurrence, and *should* reopen
 * the store as a genuine revisit — see the 'reopens that store later in the
 * same trip' case in shopping-machine.test.ts.
 *
 * Single source of truth for the reducer, the screen's sync effect, and the
 * remote reconciler, which previously each reimplemented this math.
 */
export function entryStopPlacement(
  session: Pick<ShoppingSession, 'tripId' | 'storeQueue' | 'currentIndex' | 'entries'> & { completedStopIds?: string[] },
  storeId: string,
  pantryItemId: string,
): { storeQueue: string[]; stopId: string } | null {
  const pendingIndex = session.storeQueue.findIndex(
    (candidate, index) => index >= session.currentIndex && candidate === storeId,
  );
  if (pendingIndex >= 0) {
    return {
      storeQueue: session.storeQueue,
      stopId: stopIdForQueueIndex(session, pendingIndex),
    };
  }
  const completed = session.completedStopIds ?? [];
  const alreadyShoppedHere = session.entries.some(
    (entry) =>
      entry.pantryItemId === pantryItemId &&
      entry.storeId === storeId &&
      completed.includes(entry.stopId),
  );
  if (alreadyShoppedHere) return null;
  const storeQueue = [...session.storeQueue, storeId];
  return {
    storeQueue,
    stopId: stopIdForStoreOccurrence(session.tripId, storeQueue, storeQueue.length - 1),
  };
}

/** Store IDs that are still pending (not yet visited, not explicitly skipped). */
export function pendingStoreIds(session: ShoppingSession): string[] {
  return session.storeQueue
    .slice(session.currentIndex + 1)
    .filter((id) => !session.skippedStoreIds.includes(id));
}

function makeReceipt(
  session: ShoppingSession,
  storeId: string,
  amount: number,
  status: ReceiptStatus,
  imageUri: string | null,
  items: ReceiptLineItem[] | undefined,
  now: number,
): Receipt {
  return {
    id: `r_${session.tripId}_${session.currentIndex}`,
    tripId: session.tripId ?? `t_${now}`,
    storeId,
    amount,
    status,
    imageUri,
    ...(items?.length ? { items } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrip(session: ShoppingSession, now: number): Trip {
  const storeIds = Array.from(new Set(session.storeQueue));
  const breakdown: TripStoreBreakdown[] = storeIds.map((storeId) => {
    const isSkipped = session.skippedStoreIds.includes(storeId);
    const bought = isSkipped
      ? 0
      : session.entries.filter((e) => e.storeId === storeId && e.picked).length;
    const receipts = session.receipts.filter((r) => r.storeId === storeId);
    const loggedReceipts = receipts.filter((receipt) => receipt.status !== 'skipped');
    const receipt = loggedReceipts.at(-1) ?? receipts.at(-1) ?? null;
    return {
      storeId,
      itemsBought: bought,
      amount: isSkipped
        ? 0
        : loggedReceipts.reduce((sum, value) => sum + value.amount, 0),
      receiptId: receipt ? receipt.id : null,
      skipped: isSkipped,
    };
  });

  const pickedEntries = session.entries.filter((e) => e.picked);
  const itemsBought = pickedEntries.length;
  const itemsOutOfStock = session.entries.filter((e) => e.outOfStock && !e.picked).length;
  const itemsRemaining = session.entries.filter((e) => !e.picked && !e.outOfStock).length;
  const totalSpent = breakdown.reduce((sum, b) => sum + b.amount, 0);
  const startedAt = session.startedAt ?? now;
  // Price is filled in at display time from priceHistory (this reducer has no
  // access to it); 0 here just means "no price was logged for this item".
  const purchasedItems: TripPurchasedItem[] = pickedEntries.map((e) => ({
    itemId: e.pantryItemId,
    name: e.name,
    storeId: e.storeId,
    price: 0,
  }));

  return {
    id: session.tripId ?? `t_${now}`,
    storeIdsVisited: storeIds.filter(
      (id) => !session.skippedStoreIds.includes(id),
    ),
    skippedStoreIds: [...session.skippedStoreIds],
    itemsBought,
    itemsRemaining,
    itemsOutOfStock,
    receiptIds: session.receipts
      .filter((r) => r.status !== 'skipped')
      .map((r) => r.id),
    totalSpent,
    breakdown,
    purchasedItems,
    startedAt,
    completedAt: now,
    duration: now - startedAt,
  };
}

/** After any receipt decision → always land on store_summary first. */
function afterReceipt(session: ShoppingSession, receipt: Receipt): ShoppingSession {
  const stopId = stopIdForQueueIndex(session, session.currentIndex);
  const completedStopIds = (session.completedStopIds ?? []).includes(stopId)
    ? session.completedStopIds
    : [...(session.completedStopIds ?? []), stopId];
  return {
    ...session,
    receipts: [...session.receipts, receipt],
    completedStopIds,
    status: 'store_summary',
  };
}

/** Move `storeId` to position currentIndex+1 in the queue (non-mutating). */
function promoteStore(session: ShoppingSession, storeId: string): ShoppingSession {
  const newQueue = [...session.storeQueue];
  const chosenIdx = newQueue.indexOf(storeId, session.currentIndex + 1);
  if (chosenIdx === -1) return session;
  const nextPos = session.currentIndex + 1;
  [newQueue[nextPos], newQueue[chosenIdx]] = [newQueue[chosenIdx], newQueue[nextPos]];
  return { ...session, storeQueue: newQueue, currentIndex: nextPos, status: 'shopping_store' };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export function reduce(
  session: ShoppingSession,
  event: ShoppingEvent,
): ShoppingSession {
  switch (event.type) {
    case 'START_TRIP': {
      if (session.status !== 'idle') return session;
      const tripId = `t_${event.now}`;
      const { queue, entries } = buildQueue(event.entries, tripId, event.now);
      if (queue.length === 0) return session;
      return {
        shopperId: event.shopperId ?? null,
        status: 'shopping_store',
        tripId,
        startedAt: event.now,
        storeQueue: queue,
        currentIndex: 0,
        skippedStoreIds: [],
        skippedAt: {},
        unskippedAt: {},
        completedStopIds: [],
        entries,
        removedEntryIds: [],
        receipts: [],
        completedTrip: null,
      };
    }

    case 'TOGGLE_PICK':
    case 'SET_PICK': {
      if (session.status !== 'shopping_store') return session;
      const entries = session.entries.map((e) => {
        if (e.entryId !== event.entryId) return e;
        const picked = event.type === 'SET_PICK' ? event.picked : !e.picked;
        // Stamp the tap time so a newer check/uncheck wins across devices
        // (last-tap-wins). Only when a timestamp is supplied — legacy/timeless
        // callers keep the historical shape and the merge's sticky-OR fallback.
        return { ...e, picked, ...(event.now !== undefined ? { pickedAt: nextTimestamp(e.pickedAt, event.now) } : {}) };
      });
      return { ...session, entries };
    }

    case 'ADD_ENTRY': {
      if (session.status !== 'shopping_store') return session;
      // An item already shopped at this store's completed stop is not re-queued
      // here — that is what used to reopen a finished store forever.
      const placement = entryStopPlacement(session, event.entry.storeId, event.entry.pantryItemId);
      if (!placement) return session;
      const { storeQueue, stopId } = placement;
      const existingIdx = session.entries.findIndex(
        (entry) =>
          entry.pantryItemId === event.entry.pantryItemId &&
          entry.stopId === stopId,
      );
      const entryId = existingIdx >= 0
        ? session.entries[existingIdx].entryId
        : session.removedEntryIds.includes(event.entry.pantryItemId)
          ? event.entry.pantryItemId
          : occurrenceId(session.tripId, stopId, event.entry.pantryItemId);
      const removedEntryIds = session.removedEntryIds.includes(entryId)
        ? session.removedEntryIds.filter((id) => id !== entryId)
        : session.removedEntryIds;
      const existing = existingIdx >= 0 ? session.entries[existingIdx] : undefined;
      const priorActionAt = Math.max(
        existing?.addedAt ?? 0,
        session.removedAt?.[entryId] ?? 0,
      );
      const addedAt = event.now !== undefined
        ? nextTimestamp(priorActionAt, event.now)
        : existing?.addedAt;
      const removedAt = { ...(session.removedAt ?? {}) };
      delete removedAt[entryId];
      const removedAtPatch = Object.keys(removedAt).length > 0 ? removedAt : undefined;
      if (existingIdx === -1) {
        return {
          ...session,
          storeQueue,
          entries: [...session.entries, {
            ...event.entry,
            entryId,
            stopId,
            picked: false,
            ...(addedAt !== undefined ? { addedAt } : {}),
          }],
          removedEntryIds,
          removedAt: removedAtPatch,
        };
      }
      const existingEntry = session.entries[existingIdx];
      const metadataMatches =
        existingEntry.name === event.entry.name &&
        existingEntry.quantity === event.entry.quantity &&
        existingEntry.unit === event.entry.unit;
      if (
        metadataMatches &&
        removedEntryIds === session.removedEntryIds
      ) return session;
      const entries = session.entries.map((e, i) =>
        i === existingIdx
          ? {
              ...event.entry,
              entryId,
              stopId,
              picked: existingEntry.picked,
              ...(existingEntry.outOfStock || existingEntry.outOfStockAt !== undefined
                ? { outOfStock: Boolean(existingEntry.outOfStock) }
                : {}),
              ...(existingEntry.pickedAt !== undefined ? { pickedAt: existingEntry.pickedAt } : {}),
              ...(existingEntry.outOfStockAt !== undefined ? { outOfStockAt: existingEntry.outOfStockAt } : {}),
            }
          : e,
      ).map((e, i) =>
        i === existingIdx && addedAt !== undefined ? { ...e, addedAt } : e
      );
      return {
        ...session,
        storeQueue,
        entries,
        removedEntryIds,
        removedAt: removedAtPatch,
      };
    }

    case 'REMOVE_ENTRY': {
      if (session.status !== 'shopping_store') return session;
      if (!session.entries.some((e) => e.entryId === event.entryId)) return session;
      const entries = session.entries.filter((e) => e.entryId !== event.entryId);
      const removedEntryIds = session.removedEntryIds.includes(event.entryId)
        ? session.removedEntryIds
        : [...session.removedEntryIds, event.entryId];
      const previousRemovedAt = session.removedAt?.[event.entryId];
      const entryAddedAt = session.entries.find((entry) => entry.entryId === event.entryId)?.addedAt;
      const removedAt = event.now === undefined
        ? session.removedAt
        : {
            ...(session.removedAt ?? {}),
            [event.entryId]: nextTimestamp(
              Math.max(previousRemovedAt ?? 0, entryAddedAt ?? 0),
              event.now,
            ),
          };
      return { ...session, entries, removedEntryIds, ...(removedAt ? { removedAt } : {}) };
    }

    case 'FINISH_STORE': {
      if (session.status !== 'shopping_store') return session;
      return { ...session, status: 'receipt_prompt' };
    }

    case 'SAVE_RECEIPT': {
      if (session.status !== 'receipt_prompt') return session;
      const storeId = currentStoreId(session);
      if (!storeId) return session;
      const receipt = makeReceipt(
        session, storeId, event.amount, event.status, event.imageUri ?? null, event.items, event.now,
      );
      return afterReceipt(session, receipt);
    }

    case 'SKIP_RECEIPT': {
      if (session.status !== 'receipt_prompt') return session;
      const storeId = currentStoreId(session);
      if (!storeId) return session;
      const receipt = makeReceipt(session, storeId, 0, 'skipped', null, undefined, event.now);
      return afterReceipt(session, receipt);
    }

    case 'ACKNOWLEDGE_SUMMARY': {
      if (session.status !== 'store_summary') return session;
      return { ...session, status: 'continue_prompt' };
    }

    case 'CONTINUE_TRIP': {
      if (session.status !== 'store_summary' && session.status !== 'continue_prompt') return session;
      if (pendingStoreIds(session).length === 0) return session;
      return { ...session, status: 'next_store_ready' };
    }

    case 'START_MANUAL_STORE': {
      if (session.status !== 'store_summary' && session.status !== 'continue_prompt' && session.status !== 'next_store_ready') return session;
      if (session.storeQueue.slice(session.currentIndex + 1).includes(event.storeId)) return session;
      // Insert right after the current position (like promoteStore) so any
      // already-queued, not-yet-visited store stays ahead of currentIndex and
      // still counts as pending — instead of being stranded behind it.
      const insertAt = session.currentIndex + 1;
      const storeQueue = [
        ...session.storeQueue.slice(0, insertAt),
        event.storeId,
        ...session.storeQueue.slice(insertAt),
      ];
      return {
        ...session,
        storeQueue,
        currentIndex: insertAt,
        status: 'shopping_store',
      };
    }

    case 'FINISH_TRIP': {
      if (session.status !== 'store_summary' && session.status !== 'continue_prompt') return session;
      const skippedStoreIds = [
        ...session.skippedStoreIds,
        ...pendingStoreIds(session),
      ];
      const completedTrip = buildTrip({ ...session, skippedStoreIds }, event.now);
      return { ...session, skippedStoreIds, status: 'trip_summary', completedTrip };
    }

    case 'CHOOSE_NEXT_STORE': {
      if (session.status !== 'next_store_ready') return session;
      return promoteStore(session, event.storeId);
    }

    // Legacy: pick first pending store (existing tests use this).
    case 'ADVANCE_STORE': {
      if (session.status !== 'next_store_ready') return session;
      const first = pendingStoreIds(session)[0];
      if (!first) return session;
      return promoteStore(session, first);
    }

    case 'SKIP_STORE': {
      if (session.status !== 'next_store_ready') return session;
      const skippedStoreIds = [...session.skippedStoreIds, event.storeId];
      const skippedAt = {
        ...(session.skippedAt ?? {}),
        [event.storeId]: nextTimestamp(
          Math.max(session.skippedAt?.[event.storeId] ?? 0, session.unskippedAt?.[event.storeId] ?? 0),
          event.now,
        ),
      };
      const remaining = session.storeQueue
        .slice(session.currentIndex + 1)
        .filter((id) => !skippedStoreIds.includes(id));
      if (remaining.length === 0) {
        const completedTrip = buildTrip({ ...session, skippedStoreIds }, event.now);
        return { ...session, skippedStoreIds, skippedAt, status: 'trip_summary', completedTrip };
      }
      return { ...session, skippedStoreIds, skippedAt };
    }

    case 'FINISH_TRIP_EARLY': {
      if (session.status !== 'next_store_ready') return session;
      const skippedStoreIds = [
        ...session.skippedStoreIds,
        ...pendingStoreIds(session),
      ];
      const completedTrip = buildTrip({ ...session, skippedStoreIds }, event.now);
      return { ...session, skippedStoreIds, status: 'trip_summary', completedTrip };
    }

    case 'END_TRIP': {
      if (session.status === 'idle') return session;
      return { ...initialSession };
    }

    case 'RESUME_TRIP': {
      if (session.status !== 'trip_summary') return session;
      return { ...session, status: 'shopping_store', completedTrip: null };
    }

    case 'MARK_OUT_OF_STOCK': {
      if (session.status !== 'shopping_store') return session;
      const entries = session.entries.map((e) =>
        e.entryId === event.entryId
          // Marking out-of-stock also clears `picked`, so stamp both flags for
          // last-tap-wins. Timestamps only when supplied (see TOGGLE_PICK note).
          ? {
              ...e,
              outOfStock: !e.outOfStock,
              picked: false,
              ...(event.now !== undefined ? {
                outOfStockAt: nextTimestamp(e.outOfStockAt, event.now),
                pickedAt: nextTimestamp(e.pickedAt, event.now),
              } : {}),
            }
          : e,
      );
      return { ...session, entries };
    }

    case 'UPDATE_QUANTITY': {
      if (session.status !== 'shopping_store') return session;
      const current = session.entries.find((entry) => entry.entryId === event.entryId);
      const quantity = Math.max(1, event.quantity);
      if (!current || current.quantity === quantity) return session;
      const entries = session.entries.map((e) =>
        e.entryId === event.entryId ? { ...e, quantity } : e,
      );
      return { ...session, entries };
    }

    case 'UNSKIP_STORE': {
      if (session.status !== 'next_store_ready') return session;
      const skippedStoreIds = session.skippedStoreIds.filter((id) => id !== event.storeId);
      const unskippedAt = event.now === undefined
        ? session.unskippedAt
        : {
            ...(session.unskippedAt ?? {}),
            [event.storeId]: nextTimestamp(
              Math.max(session.skippedAt?.[event.storeId] ?? 0, session.unskippedAt?.[event.storeId] ?? 0),
              event.now,
            ),
          };
      return { ...session, skippedStoreIds, ...(unskippedAt ? { unskippedAt } : {}) };
    }

    default:
      return session;
  }
}
