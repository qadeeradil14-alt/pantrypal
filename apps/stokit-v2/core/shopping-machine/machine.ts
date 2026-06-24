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
 *  - No duplicate shopping items (deduped by itemId on START_TRIP).
 *  - A store with zero items never enters the queue.
 *  - Receipts live in session; committed to durable state at trip_summary.
 *  - Skipping a receipt advances exactly like saving one.
 *  - store_summary always appears before next_store_ready or trip_summary.
 *  - ADVANCE_STORE picks the first non-skipped pending store (backward-compat).
 */

import type {
  Receipt,
  ReceiptStatus,
  ShoppingEntry,
  Trip,
  TripPurchasedItem,
  TripStoreBreakdown,
} from '../../types';

export type SessionStatus =
  | 'idle'
  | 'shopping_store'
  | 'receipt_prompt'
  | 'store_summary'
  | 'continue_prompt'
  | 'next_store_ready'
  | 'trip_summary';

export interface ShoppingSession {
  status: SessionStatus;
  tripId: string | null;
  startedAt: number | null;
  /** Ordered list of store ids to visit. Only stores with ≥1 item are included. */
  storeQueue: string[];
  /** Index into storeQueue of the store currently being shopped / prompted / summarised. */
  currentIndex: number;
  /** Store IDs the user explicitly skipped without shopping. */
  skippedStoreIds: string[];
  entries: ShoppingEntry[];
  /** Receipts accumulated during this trip. Committed at trip_summary. */
  receipts: Receipt[];
  /** Populated only when status === 'trip_summary'. */
  completedTrip: Trip | null;
}

export const initialSession: ShoppingSession = {
  status: 'idle',
  tripId: null,
  startedAt: null,
  storeQueue: [],
  currentIndex: 0,
  skippedStoreIds: [],
  entries: [],
  receipts: [],
  completedTrip: null,
};

export type ShoppingEvent =
  | { type: 'START_TRIP'; entries: ShoppingEntry[]; now: number }
  | { type: 'TOGGLE_PICK'; itemId: string }
  | { type: 'SET_PICK'; itemId: string; picked: boolean }
  | { type: 'FINISH_STORE'; now: number }
  | {
      type: 'SAVE_RECEIPT';
      amount: number;
      status: Extract<ReceiptStatus, 'logged' | 'photo_pending'>;
      imageUri?: string | null;
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
  | { type: 'ADD_ENTRY'; entry: ShoppingEntry }
  | { type: 'RESUME_TRIP' }
  | { type: 'MARK_OUT_OF_STOCK'; itemId: string }
  | { type: 'UNSKIP_STORE'; storeId: string }
  | { type: 'UPDATE_QUANTITY'; itemId: string; quantity: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildQueue(raw: ShoppingEntry[]): {
  queue: string[];
  entries: ShoppingEntry[];
} {
  const seen = new Set<string>();
  const entries: ShoppingEntry[] = [];
  const queue: string[] = [];
  for (const e of raw) {
    if (seen.has(e.itemId)) continue;
    seen.add(e.itemId);
    entries.push({ ...e, picked: false });
    if (!queue.includes(e.storeId)) queue.push(e.storeId);
  }
  return { queue, entries };
}

export function entriesForStore(
  session: ShoppingSession,
  storeId: string,
): ShoppingEntry[] {
  return session.entries.filter((e) => e.storeId === storeId);
}

export function currentStoreId(session: ShoppingSession): string | null {
  return session.storeQueue[session.currentIndex] ?? null;
}

export function currentStoreEntries(session: ShoppingSession): ShoppingEntry[] {
  const id = currentStoreId(session);
  return id ? entriesForStore(session, id) : [];
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
  now: number,
): Receipt {
  return {
    id: `r_${session.tripId}_${session.currentIndex}`,
    tripId: session.tripId ?? `t_${now}`,
    storeId,
    amount,
    status,
    imageUri,
    createdAt: now,
  };
}

function buildTrip(session: ShoppingSession, now: number): Trip {
  const breakdown: TripStoreBreakdown[] = session.storeQueue.map((storeId) => {
    const isSkipped = session.skippedStoreIds.includes(storeId);
    const bought = isSkipped
      ? 0
      : session.entries.filter((e) => e.storeId === storeId && e.picked).length;
    const receipt = session.receipts.find((r) => r.storeId === storeId) ?? null;
    return {
      storeId,
      itemsBought: bought,
      amount:
        receipt && receipt.status !== 'skipped' && !isSkipped
          ? receipt.amount
          : 0,
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
    itemId: e.itemId,
    name: e.name,
    storeId: e.storeId,
    price: 0,
  }));

  return {
    id: session.tripId ?? `t_${now}`,
    storeIdsVisited: session.storeQueue.filter(
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
  return { ...session, receipts: [...session.receipts, receipt], status: 'store_summary' };
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
      const { queue, entries } = buildQueue(event.entries);
      if (queue.length === 0) return session;
      return {
        status: 'shopping_store',
        tripId: `t_${event.now}`,
        startedAt: event.now,
        storeQueue: queue,
        currentIndex: 0,
        skippedStoreIds: [],
        entries,
        receipts: [],
        completedTrip: null,
      };
    }

    case 'TOGGLE_PICK':
    case 'SET_PICK': {
      if (session.status !== 'shopping_store') return session;
      const entries = session.entries.map((e) => {
        if (e.itemId !== event.itemId) return e;
        const picked = event.type === 'SET_PICK' ? event.picked : !e.picked;
        return { ...e, picked };
      });
      return { ...session, entries };
    }

    case 'ADD_ENTRY': {
      if (session.status !== 'shopping_store') return session;
      const existingIdx = session.entries.findIndex((e) => e.itemId === event.entry.itemId);
      if (existingIdx === -1) {
        return { ...session, entries: [...session.entries, { ...event.entry, picked: false }] };
      }
      const existing = session.entries[existingIdx];
      // True duplicate — already in this store's list. Keep the no-op.
      if (existing.storeId === event.entry.storeId) return session;
      // Already an entry for this item, but tied to a different store (e.g. planned
      // for another stop before the trip started) — re-home it to the current store
      // instead of silently dropping the add.
      const entries = session.entries.map((e, i) =>
        i === existingIdx ? { ...event.entry, picked: false } : e,
      );
      return { ...session, entries };
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
        session, storeId, event.amount, event.status, event.imageUri ?? null, event.now,
      );
      return afterReceipt(session, receipt);
    }

    case 'SKIP_RECEIPT': {
      if (session.status !== 'receipt_prompt') return session;
      const storeId = currentStoreId(session);
      if (!storeId) return session;
      const receipt = makeReceipt(session, storeId, 0, 'skipped', null, event.now);
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
      if (session.storeQueue.includes(event.storeId)) return session;
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
      const remaining = session.storeQueue
        .slice(session.currentIndex + 1)
        .filter((id) => !skippedStoreIds.includes(id));
      if (remaining.length === 0) {
        const completedTrip = buildTrip({ ...session, skippedStoreIds }, event.now);
        return { ...session, skippedStoreIds, status: 'trip_summary', completedTrip };
      }
      return { ...session, skippedStoreIds };
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
      return { ...initialSession };
    }

    case 'RESUME_TRIP': {
      if (session.status !== 'trip_summary') return session;
      return { ...session, status: 'shopping_store', completedTrip: null };
    }

    case 'MARK_OUT_OF_STOCK': {
      if (session.status !== 'shopping_store') return session;
      const entries = session.entries.map((e) =>
        e.itemId === event.itemId
          ? { ...e, outOfStock: !e.outOfStock, picked: false }
          : e,
      );
      return { ...session, entries };
    }

    case 'UPDATE_QUANTITY': {
      if (session.status !== 'shopping_store') return session;
      const entries = session.entries.map((e) =>
        e.itemId === event.itemId ? { ...e, quantity: Math.max(1, event.quantity) } : e,
      );
      return { ...session, entries };
    }

    case 'UNSKIP_STORE': {
      if (session.status !== 'next_store_ready') return session;
      const skippedStoreIds = session.skippedStoreIds.filter((id) => id !== event.storeId);
      return { ...session, skippedStoreIds };
    }

    default:
      return session;
  }
}
