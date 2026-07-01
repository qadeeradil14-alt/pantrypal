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
import type { SharedShoppingSession } from '../types';

const SESSION_KEY = 'stokit:v2:active-session';

interface SessionStore {
  session: ShoppingSession;
  hydrated: boolean;
  dispatch: (event: ShoppingEvent) => void;
  applyRemoteSession: (session: SharedShoppingSession | null) => void;
  /** Load a persisted session on app start. */
  hydrateSession: () => Promise<void>;
  clearSession: () => Promise<void>;
}

function persistSession(session: ShoppingSession): void {
  if (session.status === 'idle' || session.status === 'trip_summary') {
    // trip_summary is never restored on hydration, so don't keep stale data.
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  } else {
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {});
  }
}

function sessionStats(session: ShoppingSession | SharedShoppingSession | null): { itemCount: number; pickedCount: number; sessionId: string } {
  const entries = session?.entries ?? [];
  return {
    itemCount: entries.length,
    pickedCount: entries.filter((entry) => entry.picked).length,
    sessionId: session?.tripId ?? 'none',
  };
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
          const durableSession = useDurableStore.getState().activeSession;
          if (durableSession && (durableSession.startedAt ?? 0) > (saved.startedAt ?? 0)) {
            console.log('[Shopping Sync] active_session_storage_rehydrate_ignored reason=remote_newer');
            set({ session: durableSession as ShoppingSession });
            set({ hydrated: true });
            return;
          }
          const stats = sessionStats(saved);
          console.log(`[Shopping Sync] active_session_storage_rehydrated sessionId=${stats.sessionId} itemCount=${stats.itemCount}`);
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

  applyRemoteSession: (remoteSession) => {
    const previous = get().session;
    const oldStats = sessionStats(previous);
    const newStats = sessionStats(remoteSession);
    if (!remoteSession || remoteSession.status === 'idle' || remoteSession.status === 'trip_summary') {
      console.log('[Shopping Sync] remote_trip_end_received');
      console.log('[Shopping Sync] remote_active_session_cleared_local reason=remote_null_or_ended');
      set({ session: initialSession });
      AsyncStorage.removeItem(SESSION_KEY)
        .then(() => console.log('[Shopping Sync] active_session_storage_cleared_on_remote_end'))
        .catch(() => {});
      console.log(`[Shopping Sync] remote_active_session_replaced_local oldCount=${oldStats.itemCount} newCount=0 oldPicked=${oldStats.pickedCount} newPicked=0`);
      console.log('[Shopping Sync] local_state_reconciled');
      return;
    }
    set({ session: remoteSession as ShoppingSession });
    persistSession(remoteSession as ShoppingSession);
    console.log(`[Shopping Sync] remote_active_session_replaced_local oldCount=${oldStats.itemCount} newCount=${newStats.itemCount} oldPicked=${oldStats.pickedCount} newPicked=${newStats.pickedCount}`);
    console.log('[Shopping Sync] local_state_reconciled');
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

    // Resume: un-commit the trip so it can be re-committed on next completion.
    if (event.type === 'RESUME_TRIP' && prev.completedTrip) {
      const trip = prev.completedTrip;
      durable.removeTrip(trip.id, trip.receiptIds);
    }

    // Eagerly mark each store's picked items as stocked when the store visit
    // completes. This prevents items from lingering as "low" in the pantry
    // while the user is still in store_summary / deciding to continue.
    if (next.status === 'store_summary' && prev.status !== 'store_summary') {
      const completedStoreId = next.storeQueue[next.currentIndex];
      durable.clearShoppingEntries(
        next.entries.filter((e) => e.storeId === completedStoreId && e.picked),
      );
    }

    // Commit to durable state exactly once when trip_summary is reached.
    if (next.status === 'trip_summary' && prev.status !== 'trip_summary' && next.completedTrip) {
      durable.commitTrip(next.completedTrip, next.receipts);
      durable.clearShoppingEntries(next.entries);
    }

    set({ session: next });
    persistSession(next);
    durable.setActiveSession(next.status === 'idle' || next.status === 'trip_summary' ? null : next, event.type);
  },
}));
