/**
 * Session Zustand store — the ONE place the active shopping session lives.
 *
 * Persisted to AsyncStorage so the session survives an app restart
 * (Test 5: refresh before choosing next store → receipt is still there).
 * A fresh idle session is NOT persisted — only active sessions are saved.
 *
 * Driven exclusively by the shopping state machine reducer.
 * Owns side-effects that bridge transient session → durable state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  reduce,
  initialSession,
  type ShoppingEvent,
  type ShoppingSession,
} from '../core/shopping-machine';
import { useDurableStore } from './durable-store';

const SESSION_KEY = 'stokit:v2:active-session';

interface SessionStore {
  session: ShoppingSession;
  hydrated: boolean;
  dispatch: (event: ShoppingEvent) => void;
  /** Load a persisted session on app start. */
  hydrateSession: () => Promise<void>;
  clearSession: () => Promise<void>;
}

function persistSession(session: ShoppingSession): void {
  if (session.status === 'idle') {
    // No point storing idle — clear any stale data
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  } else {
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {});
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: initialSession,
  hydrated: false,

  hydrateSession: async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ShoppingSession;
        // Only restore active sessions — never restore trip_summary (it was committed)
        if (saved.status !== 'idle' && saved.status !== 'trip_summary') {
          set({ session: saved });
        }
      }
    } catch {
      // Non-fatal — start fresh
    }
    set({ hydrated: true });
  },

  clearSession: async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    set({ session: initialSession, hydrated: true });
  },

  dispatch: (event) => {
    const prev = get().session;
    const next = reduce(prev, event);
    if (next === prev) return; // pure no-op

    const durable = useDurableStore.getState();

    // Log "picked up" when an item flips to picked.
    if (event.type === 'SET_PICK' || event.type === 'TOGGLE_PICK') {
      const before = prev.entries.find((e) => e.itemId === event.itemId);
      const after  = next.entries.find((e) => e.itemId === event.itemId);
      if (before && after && !before.picked && after.picked) {
        durable.logActivity('picked_up', `Picked up ${after.name}`, {
          itemId: after.itemId,
          storeId: after.storeId,
        });
      }
    }

    // Commit to durable state exactly once when trip_summary is reached.
    if (next.status === 'trip_summary' && prev.status !== 'trip_summary' && next.completedTrip) {
      durable.commitTrip(next.completedTrip, next.receipts);
      // Return picked items to "stocked" (they've been bought).
      next.entries
        .filter((e) => e.picked)
        .forEach((e) => durable.setItemStatus(e.itemId, 'stocked'));
      // Unassign items from skipped stores so they don't immediately re-appear
      // in the shopping plan as a full store row after the trip ends.
      // The user can re-assign them before the next trip.
      const skippedSet = new Set(next.skippedStoreIds);
      next.entries
        .filter((e) => !e.picked && skippedSet.has(e.storeId))
        .forEach((e) => durable.updateItem(e.itemId, { storeId: null }));
    }

    set({ session: next });
    persistSession(next);
  },
}));
