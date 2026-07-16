/**
 * Session Zustand store — the UI projection of the durable shopping session.
 *
 * The durable store is authoritative during hydration and replica sync.
 * AsyncStorage remains a write-through cache for compatibility.
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
import { remoteShoppingSessionAction } from '../core/services/shoppingSessionSyncPolicy';
import { normalizeShoppingSession, resolveHydratedShoppingSession, shoppingTransitionTrace } from '../core/services/shoppingLifecycle';
import { mergeShoppingEntries } from '../core/services/shoppingEntrySync';

const SESSION_KEY = 'stokit:v2:active-session';

interface SessionStore {
  session: ShoppingSession;
  hydrated: boolean;
  dispatch: (event: ShoppingEvent) => void;
  applyRemoteSession: (session: SharedShoppingSession | null) => void;
  /** Load a persisted session on app start. */
  hydrateSession: () => Promise<void>;
  resetShopping: () => void;
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

function trace(
  source: 'hydrate' | 'local' | 'remote',
  event: string,
  previous: ShoppingSession,
  next: ShoppingSession,
  error?: unknown,
): string {
  const durable = useDurableStore.getState();
  return shoppingTransitionTrace(source, event, previous, next, {
    replicaId: durable.syncMeta?.replicaId,
    sequence: durable.syncMeta?.clock,
    version: durable.updatedAt,
    error,
  });
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: initialSession,
  hydrated: false,

  hydrateSession: async () => {
    const resolved = resolveHydratedShoppingSession(initialSession, useDurableStore.getState().activeSession);
    set({ session: resolved });
    persistSession(resolved);
    console.log(trace('hydrate', 'HYDRATE', initialSession, resolved));
    set({ hydrated: true });
  },

  resetShopping: () => {
    const previous = get().session;
    const durable = useDurableStore.getState();
    try {
      durable.resetShoppingList();
    } catch (error) {
      console.error(trace('local', 'RESET_SHOPPING_ERROR', previous, previous, error));
      throw error;
    }
    set({ session: initialSession, hydrated: true });
    persistSession(initialSession);
    console.log(trace('local', 'RESET_SHOPPING', previous, initialSession));
  },

  clearSession: async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    set({ session: initialSession, hydrated: true });
  },

  applyRemoteSession: (remoteSession) => {
    const previous = get().session;
    const normalized = normalizeShoppingSession(remoteSession);
    const durable = useDurableStore.getState();
    const remoteAction = remoteShoppingSessionAction(normalized, {
      activeTripId: previous.tripId,
      activeSessionStamp: durable.syncMeta?.singletons.activeSession,
      sessionTombstones: durable.syncMeta?.sessionTombstones,
    });
    if (remoteAction === 'ignore') {
      console.log(trace('remote', 'REMOTE_IGNORE_STALE_CLEAR', previous, previous));
      return;
    }
    if (remoteAction === 'clear') {
      set({ session: initialSession });
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      console.log(trace('remote', 'REMOTE_CLEAR', previous, initialSession));
      return;
    }
    const next = normalized as ShoppingSession;

    if (
      previous.status === 'shopping_store'
      && next.status === 'shopping_store'
      && previous.tripId === next.tripId
    ) {
      const removedItemIds = Array.from(
        new Set([...(previous.removedItemIds ?? []), ...(next.removedItemIds ?? [])]),
      );
      const merged: ShoppingSession = {
        ...previous,
        storeQueue: [
          ...previous.storeQueue,
          ...next.storeQueue.filter((storeId) => !previous.storeQueue.includes(storeId)),
        ],
        entries: mergeShoppingEntries(previous.entries, next.entries, removedItemIds),
        removedItemIds,
      };
      set({ session: merged });
      persistSession(merged);
      console.log(trace('remote', 'REMOTE_MERGE', previous, merged));
      return;
    }

    set({ session: next });
    persistSession(next);
    console.log(trace('remote', 'REMOTE_APPLY', previous, next));
  },

  dispatch: (event) => {
    const prev = get().session;
    let next: ShoppingSession;
    try {
      next = reduce(prev, event);
    } catch (error) {
      console.error(trace('local', `${event.type}_ERROR`, prev, prev, error));
      throw error;
    }
    if (next === prev) {
      console.log(trace('local', `${event.type}_NOOP`, prev, next));
      return;
    }

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
      durable.clearShoppingEntries(next.entries.filter((e) => e.picked));
      const skippedSet = new Set(next.skippedStoreIds);
      next.entries
        .filter((e) => !e.picked && skippedSet.has(e.storeId))
        .forEach((e) => durable.updateItem(e.itemId, { storeId: null }));
    }

    set({ session: next });
    persistSession(next);
    durable.setActiveSession(next.status === 'idle' || next.status === 'trip_summary' ? null : next, event.type);
    console.log(trace('local', event.type, prev, next));
  },
}));
