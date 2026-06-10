/**
 * Shopping Flow Engine (v2)
 * ------------------------------------------------------------------
 * Single source of truth for the personal, store-locked shopping session.
 * See docs/SHOPPING_FLOW_CONTRACT.md for the authoritative spec.
 *
 * Design:
 *  - `shoppingReducer` is a PURE function — no React, no Supabase, no I/O.
 *    All decisions that depend on the live shopping list (which stores still
 *    have items, how many remain at a store) are passed IN via action payloads,
 *    so the reducer stays deterministic and fully unit-testable.
 *  - `useShoppingEngine` wraps the reducer in a Zustand store so non-React
 *    modules (geofencing.ts, _layout.tsx, settings.tsx) can read session state
 *    via `useShoppingEngine.getState()` and dispatch actions from anywhere.
 *  - The store is NOT persisted: session state is in-memory only and resets to
 *    `idle` on every app launch / JS reload (contract §7).
 */

import { create } from 'zustand';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Resting session statuses. `complete` is a *transient* resolution phase, not a
 * resting status: terminal transitions resolve it immediately to either
 * `trip_summary_open` (≥1 item grabbed this session) or `idle` (nothing grabbed).
 */
export type ShoppingStatus =
  | 'idle'
  | 'shopping_active'
  | 'receipt_pending'
  | 'next_store_ready'
  | 'trip_summary_open';

export type TripStoreSummaryRow = {
  storeId: string;
  itemCount: number;
  spend: number;
  receiptAdded: boolean;
};

export type TripSummary = {
  itemCount: number;
  tripSpend: number;
  receiptCount: number;
  stores: TripStoreSummaryRow[];
};

export type ShoppingSessionState = {
  status: ShoppingStatus;
  /** The store currently locked for shopping. null when idle / between stops. */
  activeStoreId: string | null;
  /** Ordered stores planned for this session (route order). */
  routeStoreIds: string[];
  /** Stores whose receipt step is done this session. */
  completedStoreIds: string[];
  /** Items grabbed per store this session. */
  grabbedByStore: Record<string, number>;
  /** Money entered per store this session. */
  spendByStore: Record<string, number>;
  /** Whether a receipt was added per store this session. */
  receiptByStore: Record<string, boolean>;
  /** Item count present when each store stop began. */
  startCountByStore: Record<string, number>;
  /** Store awaiting receipt resolution (locked until resolved). */
  pendingReceiptStoreId: string | null;
  /** Built when the session ends; drives the trip summary sheet. null otherwise. */
  tripSummary: TripSummary | null;
};

/** A map of storeId -> count of items still remaining at that store (live). */
export type RemainingCounts = Record<string, number>;

export type ShoppingAction =
  /** Begin a session. storeId null = "shop all" → locks first route store. */
  | { type: 'START_SESSION'; storeId: string | null; route: string[]; startCount: number }
  /** Grab an item at a store. `remainingAtStore` = items left AFTER this grab. */
  | { type: 'GRAB_ITEM'; storeId: string; remainingAtStore: number }
  /** Manual "I'm done at this store". No-op if 0 grabbed there. */
  | { type: 'REQUEST_FINISH_STOP'; storeId: string }
  /** Resolve the pending receipt (amount/upload/skip), then advance. */
  | { type: 'RESOLVE_RECEIPT'; amount: number; receiptAdded: boolean; remaining: RemainingCounts }
  /** Lock the next store and begin its stop. */
  | { type: 'START_NEXT_STORE'; storeId: string; startCount: number }
  /** "Done" button. Blocks on an unresolved receipt first, else ends. */
  | { type: 'END_SESSION'; remaining: RemainingCounts }
  /** Dismiss the trip summary → back to idle. */
  | { type: 'DISMISS_SUMMARY' }
  /** Hard reset (logout / household switch). No summary. */
  | { type: 'ABORT' };

// ----------------------------------------------------------------------------
// Initial state
// ----------------------------------------------------------------------------

export const initialShoppingState: ShoppingSessionState = {
  status: 'idle',
  activeStoreId: null,
  routeStoreIds: [],
  completedStoreIds: [],
  grabbedByStore: {},
  spendByStore: {},
  receiptByStore: {},
  startCountByStore: {},
  pendingReceiptStoreId: null,
  tripSummary: null,
};

// ----------------------------------------------------------------------------
// Selectors (pure)
// ----------------------------------------------------------------------------

/** Stores still worth visiting: in route, not completed, still have items. */
export function selectRemainingStores(
  state: ShoppingSessionState,
  remaining: RemainingCounts,
): string[] {
  return state.routeStoreIds.filter(
    (id) => !state.completedStoreIds.includes(id) && (remaining[id] ?? 0) > 0,
  );
}

/**
 * The next store to shop after the current one, in route order. Falls back to
 * the first remaining store if the active store is not in the route.
 */
export function selectNextStore(
  state: ShoppingSessionState,
  remaining: RemainingCounts,
): string | null {
  const candidates = selectRemainingStores(state, remaining).filter(
    (id) => id !== state.activeStoreId,
  );
  if (candidates.length === 0) return null;
  const activeIdx = state.activeStoreId
    ? state.routeStoreIds.indexOf(state.activeStoreId)
    : -1;
  if (activeIdx !== -1) {
    const after = candidates.find((id) => state.routeStoreIds.indexOf(id) > activeIdx);
    if (after) return after;
  }
  return candidates[0];
}

/** Total items grabbed across all stores this session. */
export function selectTotalGrabbed(state: ShoppingSessionState): number {
  return Object.values(state.grabbedByStore).reduce((a, b) => a + b, 0);
}

/** Does this store owe a receipt? (≥1 grabbed, not yet completed.) */
export function selectStoreOwesReceipt(
  state: ShoppingSessionState,
  storeId: string | null,
): boolean {
  if (!storeId) return false;
  if (state.completedStoreIds.includes(storeId)) return false;
  return (state.grabbedByStore[storeId] ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function inc(map: Record<string, number>, key: string, by = 1): Record<string, number> {
  return { ...map, [key]: (map[key] ?? 0) + by };
}

/** Build the trip summary from final session state. */
export function buildTripSummary(state: ShoppingSessionState): TripSummary {
  const ids = Array.from(
    new Set([
      ...state.routeStoreIds,
      ...state.completedStoreIds,
      ...Object.keys(state.grabbedByStore),
    ]),
  );
  const stores: TripStoreSummaryRow[] = ids
    .map((storeId) => ({
      storeId,
      itemCount: state.grabbedByStore[storeId] ?? 0,
      spend: state.spendByStore[storeId] ?? 0,
      receiptAdded: state.receiptByStore[storeId] ?? false,
    }))
    .filter((row) => row.itemCount > 0 || row.spend > 0 || row.receiptAdded);

  return {
    itemCount: stores.reduce((a, r) => a + r.itemCount, 0),
    tripSpend: stores.reduce((a, r) => a + r.spend, 0),
    receiptCount: stores.filter((r) => r.receiptAdded).length,
    stores,
  };
}

/**
 * Terminal resolution: end the session. If anything was grabbed, open the trip
 * summary; otherwise reset straight to idle. (`complete` phase, contract §2.)
 */
function endSession(state: ShoppingSessionState): ShoppingSessionState {
  const grabbed = selectTotalGrabbed(state);
  if (grabbed === 0) {
    return { ...initialShoppingState };
  }
  return {
    ...state,
    status: 'trip_summary_open',
    activeStoreId: null,
    pendingReceiptStoreId: null,
    tripSummary: buildTripSummary(state),
  };
}

// ----------------------------------------------------------------------------
// Reducer (pure)
// ----------------------------------------------------------------------------

export function shoppingReducer(
  state: ShoppingSessionState,
  action: ShoppingAction,
): ShoppingSessionState {
  switch (action.type) {
    case 'ABORT':
      return { ...initialShoppingState };

    case 'START_SESSION': {
      // Forbidden: starting while a session is already running. Caller must
      // ABORT / dismiss first. We reset defensively to guarantee a clean start.
      const active = action.storeId ?? action.route[0] ?? null;
      return {
        ...initialShoppingState,
        status: active ? 'shopping_active' : 'idle',
        activeStoreId: active,
        routeStoreIds: action.route,
        startCountByStore: active ? { [active]: action.startCount } : {},
      };
    }

    case 'GRAB_ITEM': {
      if (state.status !== 'shopping_active') return state;
      const grabbedByStore = inc(state.grabbedByStore, action.storeId);
      const next: ShoppingSessionState = { ...state, grabbedByStore };
      // Last item at this store grabbed → lock into receipt_pending.
      if (action.remainingAtStore <= 0 && (grabbedByStore[action.storeId] ?? 0) > 0) {
        return {
          ...next,
          status: 'receipt_pending',
          activeStoreId: action.storeId,
          pendingReceiptStoreId: action.storeId,
        };
      }
      return next;
    }

    case 'REQUEST_FINISH_STOP': {
      if (state.status !== 'shopping_active') return state;
      // No-op if nothing grabbed at this store (contract §3).
      if ((state.grabbedByStore[action.storeId] ?? 0) === 0) return state;
      return {
        ...state,
        status: 'receipt_pending',
        activeStoreId: action.storeId,
        pendingReceiptStoreId: action.storeId,
      };
    }

    case 'RESOLVE_RECEIPT': {
      if (state.status !== 'receipt_pending' || !state.pendingReceiptStoreId) return state;
      const storeId = state.pendingReceiptStoreId;
      const resolved: ShoppingSessionState = {
        ...state,
        completedStoreIds: state.completedStoreIds.includes(storeId)
          ? state.completedStoreIds
          : [...state.completedStoreIds, storeId],
        spendByStore:
          action.amount > 0 ? inc(state.spendByStore, storeId, action.amount) : state.spendByStore,
        receiptByStore: action.receiptAdded
          ? { ...state.receiptByStore, [storeId]: true }
          : state.receiptByStore,
        pendingReceiptStoreId: null,
      };
      const nextStore = selectNextStore(resolved, action.remaining);
      if (nextStore) {
        return { ...resolved, status: 'next_store_ready', activeStoreId: null };
      }
      // No stores remain → session complete.
      return endSession(resolved);
    }

    case 'START_NEXT_STORE': {
      if (state.status !== 'next_store_ready') return state;
      // Forbidden: re-entering a completed store (contract §4.6).
      if (state.completedStoreIds.includes(action.storeId)) return state;
      return {
        ...state,
        status: 'shopping_active',
        activeStoreId: action.storeId,
        routeStoreIds: state.routeStoreIds.includes(action.storeId)
          ? state.routeStoreIds
          : [...state.routeStoreIds, action.storeId],
        startCountByStore: { ...state.startCountByStore, [action.storeId]: action.startCount },
      };
    }

    case 'END_SESSION': {
      if (state.status !== 'shopping_active' && state.status !== 'next_store_ready') return state;
      // If the active store owes a receipt, block: route into receipt_pending
      // first. The user resolves it, then presses Done again to actually end.
      if (state.status === 'shopping_active' && selectStoreOwesReceipt(state, state.activeStoreId)) {
        return {
          ...state,
          status: 'receipt_pending',
          pendingReceiptStoreId: state.activeStoreId,
        };
      }
      return endSession(state);
    }

    case 'DISMISS_SUMMARY':
      return { ...initialShoppingState };

    default:
      return state;
  }
}

// ----------------------------------------------------------------------------
// Zustand store wrapper (cross-module singleton, NOT persisted)
// ----------------------------------------------------------------------------

type ShoppingEngineStore = ShoppingSessionState & {
  dispatch: (action: ShoppingAction) => void;
};

export const useShoppingEngine = create<ShoppingEngineStore>()((set) => ({
  ...initialShoppingState,
  dispatch: (action) => set((state) => shoppingReducer(stripActions(state), action)),
}));

/** Strip the store's non-state members so the reducer sees pure session state. */
function stripActions(store: ShoppingEngineStore): ShoppingSessionState {
  const { dispatch: _dispatch, ...state } = store;
  return state;
}
