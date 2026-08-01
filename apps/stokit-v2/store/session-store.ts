/**
 * Canonical render/reducer store for the active shopping session.
 *
 * Every local mutation mirrors synchronously into DurableState.activeSession,
 * which is the persisted/uploaded copy. Boot hydrates durable first, folds the
 * optional session-key backup into it, then mirrors the result before rendering.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  reduce,
  initialSession,
  stopIdForQueueIndex,
  type ShoppingEvent,
  type ShoppingSession,
} from '../core/shopping-machine';
import { useDurableStore } from './durable-store';
import type { SharedShoppingSession, ShoppingEntry } from '../types';
import { remoteShoppingSessionAction, shouldPreserveCompletedTripSummary } from '../core/services/shoppingSessionSyncPolicy';
import { syncDiag } from '../core/services/syncDiag'; // DIAG: temporary — remove after OTA 389 investigation
import {
  decodeShoppingSession,
  foldRemoteActiveSession,
} from '../core/services/shoppingEntrySync';
import { canDispatchShoppingEvent, shoppingCapabilities } from '../core/services/shoppingAccess';
import { useHouseholdStore } from './household-store';
import {
  resolveHydratedShoppingSession,
  sameActiveShoppingSession,
} from '../core/services/shoppingSessionHydration';
import { newestRemainingOccurrenceStoreId } from '../core/services/shoppingOccurrence';

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

function isClosedTripId(tripId: string): boolean {
  const durable = useDurableStore.getState();
  return durable.trips.some((trip) => trip.id === tripId) ||
    (durable.closedTripIds ?? []).some((t) => t.id === tripId);
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
    let savedSession: ShoppingSession | null = null;
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) savedSession = decodeShoppingSession(JSON.parse(raw) as ShoppingSession);
    } catch {
      // Non-fatal — start fresh
    }
    const durable = useDurableStore.getState();
    const canonical = resolveHydratedShoppingSession(
      savedSession,
      durable.activeSession,
      isClosedTripId,
    );
    const activeCanonical = canonical.status === 'idle' || canonical.status === 'trip_summary'
      ? null
      : canonical;
    set({ session: canonical, hydrated: true });
    persistSession(canonical);
    if (!sameActiveShoppingSession(durable.activeSession, activeCanonical)) {
      durable.setActiveSession(activeCanonical, 'HYDRATE_SESSION');
    }
  },

  clearSession: async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    set({ session: initialSession, hydrated: true });
  },

  applyRemoteSession: (remoteSession) => {
    const previous = get().session;

    if (shouldPreserveCompletedTripSummary(previous)) return;

    if (!remoteSession || remoteShoppingSessionAction(remoteSession) === 'clear') {
      set({ session: initialSession });
      AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      return;
    }

    // Guard 2: same trip, neither side terminal — fold instead of blind
    // whole-object replacement, so a not-yet-synced local entry (e.g. an item
    // a stay-home collaborator just added) is never lost just because the
    // shopper's device has moved to a different sub-status for this trip.
    // isClosedTripId additionally refuses to resurrect a trip this device
    // already knows was explicitly canceled or finished, regardless of what
    // stale copy some other device pushes up later.
    const merged = foldRemoteActiveSession(previous, remoteSession as ShoppingSession, isClosedTripId);
    set({ session: merged });
    persistSession(merged);
  },

  dispatch: (event) => {
    const prev = get().session;
    const durable = useDurableStore.getState();
    const household = useHouseholdStore.getState();
    const localMember = household.members.find((member) => member.isMe);
    const capabilities = shoppingCapabilities(
      prev.shopperId,
      localMember?.id,
      localMember?.role ?? household.household?.role,
    );
    if (!canDispatchShoppingEvent(event.type, capabilities)) {
      syncDiag('shopping_occurrence_reduce', {
        sessionId: prev.tripId,
        operation: event.type,
        decision: 'no_op',
        reason: 'unauthorized',
      });
      return;
    }
    const next = reduce(prev, event);
    if (next === prev) {
      syncDiag('shopping_occurrence_reduce', {
        sessionId: prev.tripId,
        operation: event.type,
        decision: 'no_op',
        reason: event.type === 'ADD_ENTRY' ? 'same_stop_occurrence_exists' : 'reducer_rejected_or_unchanged',
        entryId: 'entryId' in event ? event.entryId : null,
        pantryItemId: event.type === 'ADD_ENTRY' ? event.entry.pantryItemId : null,
      });
      return;
    }
    const affected = event.type === 'ADD_ENTRY'
      ? next.entries.find(
          (entry) =>
            entry.pantryItemId === event.entry.pantryItemId &&
            !prev.entries.some((previous) => previous.entryId === entry.entryId),
        ) ?? next.entries.find((entry) => entry.pantryItemId === event.entry.pantryItemId)
      : 'entryId' in event
        ? next.entries.find((entry) => entry.entryId === event.entryId)
          ?? prev.entries.find((entry) => entry.entryId === event.entryId)
        : undefined;
    syncDiag('shopping_occurrence_reduce', {
      sessionId: next.tripId,
      operation: event.type,
      decision: 'applied',
      reason: event.type === 'ADD_ENTRY' ? 'occurrence_created_or_updated' : 'scoped_by_entry_id',
      entryId: affected?.entryId ?? null,
      pantryItemId: affected?.pantryItemId ?? null,
      stopId: affected?.stopId ?? null,
      storeId: affected?.storeId ?? null,
      storeName: durable.stores.find((store) => store.id === affected?.storeId)?.name ?? null,
    });

    if (event.type === 'TOGGLE_PICK' || event.type === 'SET_PICK' || event.type === 'MARK_OUT_OF_STOCK') {
      // DIAG: temporary — remove after OTA 389 investigation
      const b = prev.entries.find((e) => e.entryId === event.entryId);
      const a = next.entries.find((e) => e.entryId === event.entryId);
      syncDiag('local_completion_edit', {
        entryId: event.entryId, pantryItemId: a?.pantryItemId ?? b?.pantryItemId, ev: event.type,
        beforePicked: b?.picked, afterPicked: a?.picked, pickedAt: a?.pickedAt,
        beforeOOS: Boolean(b?.outOfStock), afterOOS: Boolean(a?.outOfStock), outOfStockAt: a?.outOfStockAt,
      });
    }

    if (event.type === 'REMOVE_ENTRY') {
      const removedEntry = prev.entries.find((entry) => entry.entryId === event.entryId);
      const durableItem = durable.items.find((item) => item.id === removedEntry?.pantryItemId);
      if (removedEntry && !capabilities.canChangePickedState) {
        if (removedEntry.entryId === removedEntry.pantryItemId) {
          durable.deleteItem(removedEntry.pantryItemId);
        } else {
          durable.tombstoneShoppingOccurrence(removedEntry.entryId);
        }
      }
      if (
        removedEntry &&
        durableItem &&
        (durableItem.status === 'low' || durableItem.status === 'expiring') &&
        durableItem.storeId === removedEntry.storeId
      ) {
        durable.updateItem(removedEntry.pantryItemId, {
          storeId: newestRemainingOccurrenceStoreId(next.entries, removedEntry.pantryItemId),
        });
      }
    }

    // Log "picked up" when an item flips to picked.
    if (event.type === 'SET_PICK' || event.type === 'TOGGLE_PICK') {
      const before = prev.entries.find((e) => e.entryId === event.entryId);
      const after  = next.entries.find((e) => e.entryId === event.entryId);
      if (before && after && !before.picked && after.picked) {
        durable.logActivity('picked_up', `Picked up ${after.name}`, {
          itemId: after.pantryItemId,
          storeId: after.storeId,
        }, false);
      }
    }

    // Eagerly mark each store's picked items as stocked when the store visit
    // completes. This prevents items from lingering as "low" in the pantry
    // while the user is still in store_summary / deciding to continue.
    if (next.status === 'store_summary' && prev.status !== 'store_summary') {
      const completedStopId = stopIdForQueueIndex(next, next.currentIndex);
      durable.clearShoppingEntries(
        next.entries.filter((e) => e.stopId === completedStopId && e.picked),
      );
      // Unpurchased and out-of-stock items keep both their `low` status AND
      // their store assignment. Clearing storeId here used to be how a
      // completed store was stopped from immediately reactivating, but
      // `completedStopIds` now records that directly. Nulling it also erased
      // the store from the shopping list (which groups purely by item.storeId)
      // and made the items read as "needs a store" in the pantry — see
      // entryStopPlacement.
    }

    // Commit to durable state exactly once when trip_summary is reached.
    if (next.status === 'trip_summary' && prev.status !== 'trip_summary' && next.completedTrip) {
      durable.commitTrip(next.completedTrip, next.receipts);
      const pickedEntries = next.entries.filter((entry) => entry.picked);
      durable.clearShoppingEntries(pickedEntries);

      // Release every (item, store) pairing this trip never bought, keyed off
      // the trip's own entries rather than item.storeId. Nulling item.storeId
      // alone left the assignment ledger active, and activeShoppingStoreIds
      // prefers the ledger — so the store (a skipped one especially) rebuilt
      // its "ready to shop" plan the moment the trip closed. Items picked up
      // somewhere on this trip are already handled by clearShoppingEntries
      // above and are skipped here.
      const pickedItemIds = new Set(pickedEntries.map((entry) => entry.pantryItemId));
      next.entries
        .filter(
          (entry) =>
            !pickedItemIds.has(entry.pantryItemId) &&
            entry.pantryItemId !== '__quick_scan__',
        )
        .forEach((entry) => durable.releaseStoreAssignment(entry.pantryItemId, entry.storeId));
    }

    set({ session: next });
    persistSession(next);

    // A mid-trip quantity change lives on the session entry, but the pantry item
    // is the synced source of truth: durableSnapshot reconciles every entry's
    // quantity back to item.quantity on both push and apply. Without writing the
    // item, the new quantity is stripped from every outbound snapshot (the peer
    // never sees it) and is even reverted locally on the next reconcile.
    // Propagate it to the item so it syncs via the per-item merge and survives
    // reconciliation. The re-entrant ADD_ENTRY that updateItem triggers is a
    // no-op here — next already carries this quantity, so the reducer returns
    // the same session and dispatch bails on its next === prev guard.
    if (event.type === 'UPDATE_QUANTITY') {
      const entry = next.entries.find((e) => e.entryId === event.entryId);
      if (entry && entry.pantryItemId !== '__quick_scan__') {
        durable.updateItem(entry.pantryItemId, { quantity: entry.quantity });
      }
    }

    // Tombstone the trip the moment it closes (canceled via END_TRIP, or
    // finished into trip_summary) so a device that still holds a stale,
    // not-yet-closed copy of this session in memory can never resurrect it
    // by pushing that copy up later with a fresh timestamp. See
    // foldRemoteActiveSession.
    if (
      (next.status === 'idle' || next.status === 'trip_summary') &&
      prev.status !== 'idle' && prev.status !== 'trip_summary' &&
      prev.tripId
    ) {
      durable.closeTrip(prev.tripId);
    }

    durable.setActiveSession(next.status === 'idle' || next.status === 'trip_summary' ? null : next, event.type);
  },
}));
