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
import type { SharedShoppingSession, ShoppingEntry } from '../types';
import {
  isCompletedShoppingSession,
  remoteShoppingSessionAction,
} from '../core/services/shoppingSessionSyncPolicy';
import { mergeShoppingEntries } from '../core/services/shoppingEntrySync';

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
          const durable = useDurableStore.getState();
          const durableSession = isCompletedShoppingSession(durable.activeSession, durable.trips)
            ? null
            : durable.activeSession;
          if (durable.activeSession && !durableSession) {
            durable.setActiveSession(null, 'REJECT_COMPLETED_SESSION');
          }
          if (isCompletedShoppingSession(saved, durable.trips)) {
            await AsyncStorage.removeItem(SESSION_KEY);
            set({ session: durableSession ? durableSession as ShoppingSession : initialSession, hydrated: true });
            return;
          }
          // Same ongoing trip on both sides (identical startedAt) — merge
          // per-entry instead of blindly trusting this device's own possibly
          // stale AsyncStorage copy, so quantities/picks changed on another
          // device while this device was closed are not silently dropped as
          // soon as hydration restores the old blob. The later network pull
          // reconciles further once it lands, but the very first paint should
          // already reflect the best locally-available data.
          if (
            durableSession &&
            durableSession.status === 'shopping_store' &&
            saved.status === 'shopping_store' &&
            durableSession.tripId === saved.tripId
          ) {
            const removedItemIds = Array.from(
              new Set([...(saved.removedItemIds ?? []), ...(durableSession.removedItemIds ?? [])]),
            );
            const merged: ShoppingSession = {
              ...saved,
              storeQueue: [
                ...saved.storeQueue,
                ...durableSession.storeQueue.filter((storeId) => !saved.storeQueue.includes(storeId)),
              ],
              entries: mergeShoppingEntries(saved.entries, durableSession.entries, removedItemIds),
              removedItemIds,
            };
            console.log('[Shopping Sync] active_session_storage_rehydrate_merged reason=same_trip');
            set({ session: merged, hydrated: true });
            return;
          }
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
    const durable = useDurableStore.getState();

    if (
      !remoteSession ||
      remoteShoppingSessionAction(remoteSession) === 'clear' ||
      isCompletedShoppingSession(remoteSession, durable.trips)
    ) {
      set({ session: initialSession });
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      return;
    }

    // Guard 2: both devices are actively shopping the same trip — merge
    // per-entry instead of blind whole-object replacement, so a check
    // registered on either device sticks and neither side's progress is lost.
    if (
      previous.status === 'shopping_store' &&
      remoteSession.status === 'shopping_store' &&
      previous.tripId === remoteSession.tripId
    ) {
      const removedItemIds = Array.from(
        new Set([...(previous.removedItemIds ?? []), ...(remoteSession.removedItemIds ?? [])]),
      );
      const merged: ShoppingSession = {
        ...previous,
        storeQueue: [
          ...previous.storeQueue,
          ...remoteSession.storeQueue.filter((storeId) => !previous.storeQueue.includes(storeId)),
        ],
        entries: mergeShoppingEntries(previous.entries, remoteSession.entries, removedItemIds),
        removedItemIds,
      };
      set({ session: merged });
      persistSession(merged);
      return;
    }

    set({ session: remoteSession as ShoppingSession });
    persistSession(remoteSession as ShoppingSession);
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
        }, false);
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
      durable.clearShoppingEntries(next.entries.filter((e) => e.picked));
      const skippedSet = new Set(next.skippedStoreIds);
      next.entries
        .filter((e) => !e.picked && skippedSet.has(e.storeId))
        .forEach((e) => durable.updateItem(e.itemId, { storeId: null }));
    }

    set({ session: next });
    persistSession(next);
    durable.setActiveSession(next.status === 'idle' || next.status === 'trip_summary' ? null : next, event.type);
  },
}));
