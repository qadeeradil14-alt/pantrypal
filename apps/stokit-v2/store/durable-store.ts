/**
 * Durable Zustand store — pantry items, stores, receipts, trips, activity,
 * household preferences. Hydrated from and persisted through the repository
 * layer. This is the single source of truth for everything that survives an
 * app restart.
 */

import { create } from 'zustand';
import type {
  ActivityEvent,
  ActivityType,
  DurableState,
  HouseholdPrefs,
  ItemTombstone,
  PantryItem,
  PantryStatus,
  PriceEntry,
  Receipt,
  ShoppingEntry,
  SharedShoppingSession,
  Store,
  StorageLocation,
  Trip,
  Unit,
} from '../types';
import { shoppingEntryEventForItem, foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { remoteShoppingSessionAction } from '../core/services/shoppingSessionSyncPolicy';
import { hasValidStoreCoordinates } from '../core/services/storeCoordinates';
export type { StorageLocation as StorageLocationImport };
import { uid, now, nextTimestamp } from '../core/services/id';
import {
  defaultPrefs,
  emptyDurableState,
  loadDurable,
  saveDurable,
  clearDurable,
} from '../core/repositories/durableRepository';
import {
  clearCloudState,
  pushLocalState,
  refreshGeofencedStoreData,
  startSyncEngine,
} from '../core/services/syncEngine';
import { syncDiag } from '../core/services/syncDiag'; // DIAG: temporary — remove after OTA 389 investigation
import { consolidatePantryItems, normalizeItemName } from '../core/services/pantryItems';
import { mergePantryItems, mergeTombstones } from '../core/services/mergePantryState';
import {
  mergeActivity,
  mergePrefs,
  mergePriceHistory,
  mergeReceipts,
  mergeStores,
  mergeTrips,
} from '../core/services/mergeDurableCollections';
import { isDuplicatePriceEntry, isValidPrice } from '../core/services/priceHistory';
import { refreshWidgets } from '../core/services/widgets';
import { findDuplicateStore } from '../core/services/storeDuplicates';
import { createLatestSnapshotQueue } from '../core/services/latestSnapshotQueue';
import { shoppingCapabilities } from '../core/services/shoppingAccess';
import { changedFields, hasChangedFields } from '../core/services/changedFields';
import { useHouseholdStore } from './household-store';

let persistedDurableState = false;

export function hasPersistedDurableState(): boolean {
  return persistedDurableState;
}

interface DurableStore extends DurableState {
  hydrated: boolean;

  hydrate: () => Promise<void>;

  // Pantry
  addItem: (input: {
    name: string;
    quantity: number;
    unit: Unit;
    storeId: string | null;
    status?: PantryStatus;
    storageLocation?: StorageLocation;
    expiryDate?: string | null;
  }) => PantryItem;
  updateItem: (id: string, patch: Partial<PantryItem>) => void;
  setItemStatus: (id: string, status: PantryStatus) => void;
  clearShoppingEntries: (entries: ShoppingEntry[]) => void;
  assignItemsToStore: (ids: string[], storeId: string) => void;
  resetShoppingList: () => void;
  deleteItem: (id: string) => void;

  // Stores
  addStore: (input: {
    name: string;
    logoColor?: string;
    logoEmoji?: string;
    logoUrl?: string;
    placeId?: string;
    address?: string;
    lat?: number;
    lng?: number;
    openingHours?: string;
    isOpen?: boolean;
  }) => Store;
  updateStore: (id: string, patch: { name?: string; logoColor?: string; logoEmoji?: string; logoUrl?: string; placeId?: string; address?: string; lat?: number; lng?: number; openingHours?: string; isOpen?: boolean }) => void;
  deleteStore: (id: string) => void;

  // Trips / receipts (committed from the shopping session)
  commitTrip: (trip: Trip, receipts: Receipt[]) => void;
  removeTrip: (tripId: string, receiptIds: string[]) => void;
  updateReceipt: (receiptId: string, patch: Partial<Receipt>) => void;
  recordPrice: (input: Omit<PriceEntry, 'id' | 'paidAt'>) => void;
  setActiveSession: (session: SharedShoppingSession | null, eventType?: string) => void;
  /** Tombstone a canceled trip's id so a stale device can never resurrect it. */
  closeTrip: (tripId: string) => void;

  // Preferences
  updatePrefs: (patch: Partial<HouseholdPrefs>) => void;

  // Activity
  logActivity: (
    type: ActivityType,
    message: string,
    refs?: { itemId?: string; storeId?: string; tripId?: string },
    persistActivity?: boolean,
  ) => void;

  resetAll: () => Promise<void>;
  resetLocalOnly: () => Promise<void>;
  
  // Sync Engine support: updates local state from remote WITHOUT pushing back
  applyRemotePatch: (patch: Partial<DurableState>) => void;
}

// Applies the same gating policy as session-store.ts's applyRemoteSession, so
// durableStore.activeSession can never hold an unvalidated remote session that
// an unrelated persist() would silently push back to the server.
function gateRemoteActiveSession(
  previous: SharedShoppingSession | null,
  remoteSession: SharedShoppingSession | null,
  closedTripIds: ItemTombstone[] = [],
): SharedShoppingSession | null {
  if (!remoteSession || remoteShoppingSessionAction(remoteSession) === 'clear') {
    return null;
  }
  const closedSet = new Set(closedTripIds.map((t) => t.id));
  return foldRemoteActiveSession(previous, remoteSession, (tripId) => closedSet.has(tripId));
}

function snapshot(s: DurableState): DurableState {
  return {
    items: s.items,
    stores: s.stores,
    priceHistory: s.priceHistory,
    receipts: s.receipts,
    trips: s.trips,
    activity: s.activity,
    prefs: s.prefs,
    activeSession: s.activeSession ?? null,
    updatedAt: s.updatedAt,
    deletedItems: s.deletedItems ?? [],
    deletedStores: s.deletedStores ?? [],
    deletedTrips: s.deletedTrips ?? [],
    deletedReceipts: s.deletedReceipts ?? [],
    closedTripIds: s.closedTripIds ?? [],
    prefsUpdatedAt: s.prefsUpdatedAt ?? {},
  };
}

export const useDurableStore = create<DurableStore>((set, get) => {
  // is swallowed by the repository so the in-memory state stays authoritative.
  let persistQueue = Promise.resolve();
  const snapshotPushQueue = createLatestSnapshotQueue(async ({ snap, epoch }: { snap: DurableState; epoch: number }) => {
    if (epoch !== persistEpoch) return;
    await pushLocalState(snap);
  }, 400);
  let persistEpoch = 0;
  let lastSnapshotAt = 0;
  const persist = () => {
    // Monotonic snapshot version. It must never regress below the version this
    // device last published OR last applied from a peer — both of which live in
    // get().updatedAt (applyRemotePatch sets it to the applied remote version).
    // Without the get().updatedAt + 1 term, a local edit made right after
    // applying a peer's snapshot stamps a SMALLER updatedAt than the peer
    // already holds; the peer's shouldApplyRemoteSnapshot gate (which requires
    // a strictly-greater version) then rejects it, so the edit stops
    // propagating on the fast path and sync silently degrades.
    const updatedAt = Math.max(now(), lastSnapshotAt + 1, get().updatedAt + 1);
    lastSnapshotAt = updatedAt;
    const epoch = persistEpoch;
    set({ updatedAt });
    const snap = snapshot(get());
    void refreshWidgets(snap.items);
    persistQueue = persistQueue
      .then(async () => {
        if (epoch !== persistEpoch) return;
        await saveDurable(snap);
        if (epoch !== persistEpoch) return;
        void snapshotPushQueue.enqueue({ snap, epoch }).catch((err) => {
          if (__DEV__) console.warn('[durable-store] snapshot push failed', err);
        });
      })
      .catch((err) => { if (__DEV__) console.warn('[durable-store] persist failed', err); });
  };

  const syncShoppingItem = (item: PantryItem | null, itemId: string) => {
    const event = shoppingEntryEventForItem(get().activeSession, item, itemId);
    if (!event) return;
    void import('./session-store').then(({ useSessionStore }) => {
      useSessionStore.getState().dispatch(event);
    });
  };

  const currentShoppingAccess = () => {
    const household = useHouseholdStore.getState();
    const localMember = household.members.find((member) => member.isMe);
    return shoppingCapabilities(
      get().activeSession?.shopperId,
      localMember?.id,
      localMember?.role ?? household.household?.role,
    );
  };

  const pushActivity = (
    type: ActivityType,
    message: string,
    refs?: { itemId?: string; storeId?: string; tripId?: string }
  ) => {
    const event: ActivityEvent = {
      id: uid('act'),
      type,
      message,
      createdAt: now(),
      ...refs,
    };
    set((s) => ({ activity: [event, ...s.activity].slice(0, 200) }));
  };

  return {
    ...emptyDurableState,
    hydrated: false,

    hydrate: async () => {
      const loaded = await loadDurable();
      persistedDurableState = loaded != null;
      if (loaded) {
        const normalized = { ...loaded, items: consolidatePantryItems(loaded.items) };
        set({ ...normalized, hydrated: false });
        void saveDurable(normalized);
      } else {
        set({ hydrated: false });
      }
      void refreshWidgets(get().items);
      await startSyncEngine();
      set({ hydrated: true });
    },

    addItem: (input) => {
      const { getStorageLocation } = require('../core/services/itemClassifier');
      const existing = get().items.find((item) => normalizeItemName(item.name) === normalizeItemName(input.name));
      if (existing) {
        const candidate: Partial<PantryItem> = {
          name: input.name.trim(),
          quantity: input.quantity,
          unit: input.unit,
          status: input.status ?? existing.status,
          storageLocation: input.storageLocation ?? existing.storageLocation,
          storeId: input.storeId ?? existing.storeId,
          expiryDate: input.expiryDate ?? existing.expiryDate,
        };
        const meaningfulPatch = changedFields(existing, candidate);
        if (!Object.keys(meaningfulPatch).length) return existing;
        const touchesStatus = 'status' in meaningfulPatch || 'storeId' in meaningfulPatch;
        const updated: PantryItem = {
          ...existing,
          ...meaningfulPatch,
          updatedAt: nextTimestamp(existing.updatedAt),
          ...(touchesStatus ? { statusUpdatedAt: nextTimestamp(existing.statusUpdatedAt) } : {}),
        };
        set((s) => ({
          items: consolidatePantryItems(s.items.map((item) => item.id === existing.id ? updated : item)),
        }));
        if (updated.status === 'low' && existing.status !== 'low') {
          pushActivity('marked_low', `${updated.name} marked low`, { itemId: updated.id });
        }
        persist();
        syncShoppingItem(updated, updated.id);
        // Merge can change storeId/status (e.g. re-adding an item with a new
        // store assignment) — geofence eligibility is item-driven, so refresh.
        void refreshGeofencedStoreData();
        return updated;
      }
      const createdAt = now();
      const item: PantryItem = {
        id: uid('item'),
        name: input.name.trim(),
        quantity: input.quantity,
        unit: input.unit,
        status: input.status ?? 'stocked',
        storageLocation: input.storageLocation ?? getStorageLocation(input.name),
        storeId: input.storeId,
        expiryDate: input.expiryDate ?? null,
        createdAt,
        updatedAt: createdAt,
        statusUpdatedAt: createdAt,
      };
      set((s) => ({ items: [item, ...s.items] }));
      pushActivity('item_added', `Added ${item.name}`, { itemId: item.id });
      if (item.status === 'low') {
        pushActivity('marked_low', `${item.name} marked low`, { itemId: item.id });
      }
      persist();
      syncShoppingItem(item, item.id);
      // A newly added item may be assigned to a store at creation, making
      // that store newly eligible for arrival reminders.
      void refreshGeofencedStoreData();
      return item;
    },

    updateItem: (id, patch) => {
      const current = get().items.find((item) => item.id === id);
      if (!current) return;
      const meaningfulPatch = changedFields(current, patch);
      if (!Object.keys(meaningfulPatch).length) return;
      const diagBefore = 'quantity' in meaningfulPatch ? current : undefined;
      const touchesStatus = 'status' in meaningfulPatch || 'storeId' in meaningfulPatch;
      set((s) => ({
        items: s.items.map((it) =>
          it.id === id
            ? {
                ...it,
                ...meaningfulPatch,
                updatedAt: nextTimestamp(it.updatedAt),
                ...(touchesStatus ? { statusUpdatedAt: nextTimestamp(it.statusUpdatedAt) } : {}),
              }
            : it
        ),
      }));
      if ('quantity' in meaningfulPatch) { // DIAG: temporary — remove after OTA 389 investigation
        const after = get().items.find((it) => it.id === id);
        syncDiag('local_item_edit', {
          itemId: id, field: 'quantity',
          before: diagBefore?.quantity, after: after?.quantity,
          prevUpdatedAt: diagBefore?.updatedAt, newUpdatedAt: after?.updatedAt,
        });
      }
      persist();
      syncShoppingItem(get().items.find((item) => item.id === id) ?? null, id);
      // patch may change storeId and/or status — both affect geofence
      // eligibility (assignment, status change, marking purchased, etc.).
      void refreshGeofencedStoreData();
    },

    setItemStatus: (id, status) => {
      const item = get().items.find((it) => it.id === id);
      if (!item || item.status === status) return;
      set((s) => ({
        items: s.items.map((it) =>
          it.id === id
            ? { ...it, status, updatedAt: nextTimestamp(it.updatedAt), statusUpdatedAt: nextTimestamp(it.statusUpdatedAt) }
            : it
        ),
      }));
      if (item && status === 'low' && item.status !== 'low') {
        pushActivity('marked_low', `${item.name} marked low`, { itemId: id });
      }
      persist();
      syncShoppingItem(get().items.find((candidate) => candidate.id === id) ?? null, id);
      // Status changes (including marking purchased, or restoring to stocked)
      // can add or remove a store from geofence eligibility.
      void refreshGeofencedStoreData();
    },

    clearShoppingEntries: (entries) => {
      if (!entries.length) return;
      const entryIds = new Set(
        entries
          .map((entry) => entry.itemId)
          .filter((id) => {
            const item = get().items.find((candidate) => candidate.id === id);
            return item && (item.status !== 'stocked' || item.storeId !== null);
          }),
      );
      if (!entryIds.size) return;
      set((s) => ({
        items: s.items.map((item) =>
          entryIds.has(item.id)
            ? {
                ...item,
                status: 'stocked',
                storeId: null,
                updatedAt: nextTimestamp(item.updatedAt),
                statusUpdatedAt: nextTimestamp(item.statusUpdatedAt),
              }
            : item
        ),
      }));
      persist();
      void refreshGeofencedStoreData();
    },

    assignItemsToStore: (ids, storeId) => {
      if (!ids.length) return;
      const requestedIds = new Set(ids);
      const idSet = new Set(
        get().items
          .filter((item) => requestedIds.has(item.id) && item.storeId !== storeId)
          .map((item) => item.id),
      );
      if (!idSet.size) return;
      set((s) => ({
        items: s.items.map((item) =>
          idSet.has(item.id)
            ? { ...item, storeId, updatedAt: nextTimestamp(item.updatedAt), statusUpdatedAt: nextTimestamp(item.statusUpdatedAt) }
            : item
        ),
      }));
      persist();
      get().items
        .filter((item) => idSet.has(item.id))
        .forEach((item) => syncShoppingItem(item, item.id));
      void refreshGeofencedStoreData();
    },

    resetShoppingList: () => {
      if (!currentShoppingAccess().canStartTrip) return;
      if (!get().items.some((item) => item.status === 'low' || item.status === 'expiring')) return;
      set((s) => ({
        items: s.items.map((item) =>
          item.status === 'low' || item.status === 'expiring'
            ? {
                ...item,
                status: 'stocked',
                storeId: null,
                updatedAt: nextTimestamp(item.updatedAt),
                statusUpdatedAt: nextTimestamp(item.statusUpdatedAt),
              }
            : item
        ),
      }));
      persist();
      void refreshGeofencedStoreData();
    },

    deleteItem: (id) => {
      const item = get().items.find((candidate) => candidate.id === id);
      if (!item) return;
      const itemUpdatedAt = item.updatedAt;
      const previousDeletedAt = get().deletedItems?.find((tombstone) => tombstone.id === id)?.deletedAt ?? 0;
      const at = nextTimestamp(Math.max(itemUpdatedAt, previousDeletedAt));
      set((s) => ({
        items: s.items.filter((it) => it.id !== id),
        // Record a tombstone so the deletion syncs across devices instead of the
        // item being resurrected by the other device's per-item merge.
        deletedItems: [...(s.deletedItems ?? []).filter((t) => t.id !== id), { id, deletedAt: at }],
      }));
      persist();
      syncShoppingItem(null, id);
      // Deleting the last active item assigned to a store removes that
      // store's eligibility — re-register so it stops being monitored.
      void refreshGeofencedStoreData();
    },

    addStore: (input) => {
      if (!hasValidStoreCoordinates(input.lat, input.lng)) {
        throw new Error('Stores require valid latitude and longitude before they can be saved.');
      }
      const duplicate = findDuplicateStore(get().stores, input);
      if (duplicate) return duplicate;

      const ts = now();
      const store: Store = {
        id: uid('store'),
        name: input.name.trim(),
        logoColor: input.logoColor,
        logoEmoji: input.logoEmoji,
        logoUrl: input.logoUrl,
        placeId: input.placeId,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        openingHours: input.openingHours,
        isOpen: input.isOpen,
        createdAt: ts,
        updatedAt: ts,
      };
      set((s) => ({ stores: [...s.stores, store] }));
      pushActivity('store_added', `Added store ${store.name}`, {
        storeId: store.id,
      });
      persist();
      void refreshGeofencedStoreData();
      return store;
    },

    updateStore: (id, patch) => {
      const current = get().stores.find((store) => store.id === id);
      if (!current) return;
      const meaningfulPatch = changedFields(current, patch);
      if (!Object.keys(meaningfulPatch).length) return;
      set((s) => ({
        stores: s.stores.map((st) =>
          st.id === id
            ? { ...st, ...meaningfulPatch, updatedAt: nextTimestamp(st.updatedAt) }
            : st
        ),
      }));
      persist();
      void refreshGeofencedStoreData();
    },

    deleteStore: (id) => {
      const currentStore = get().stores.find((store) => store.id === id);
      if (!currentStore) return;
      const previousDeletedAt = get().deletedStores?.find((entry) => entry.id === id)?.deletedAt;
      const deletedAt = nextTimestamp(
        Math.max(currentStore?.updatedAt ?? 0, previousDeletedAt ?? 0),
      );
      set((s) => ({
        stores: s.stores.filter((st) => st.id !== id),
        deletedStores: [
          ...(s.deletedStores ?? []).filter((entry) => entry.id !== id),
          { id, deletedAt },
        ],
        // Unassign items pointing at the removed store; never delete the items.
        items: s.items.map((it) =>
          it.storeId === id
            ? { ...it, storeId: null, updatedAt: nextTimestamp(it.updatedAt), statusUpdatedAt: nextTimestamp(it.statusUpdatedAt) }
            : it
        ),
      }));
      persist();
      void refreshGeofencedStoreData();
    },

    commitTrip: (trip, receipts) => {
      set((s) => ({
        trips: [trip, ...s.trips],
        receipts: [...receipts, ...s.receipts],
      }));
      // Log activity for receipts + trip.
      const stores = get().stores;
      receipts
        .filter((r) => r.status !== 'skipped')
        .forEach((r) => {
          const storeName =
            stores.find((st) => st.id === r.storeId)?.name ?? 'store';
          pushActivity(
            'receipt_logged',
            `Receipt logged at ${storeName} · $${r.amount.toFixed(2)}`,
            { storeId: r.storeId, tripId: trip.id }
          );
        });
      pushActivity(
        'trip_completed',
        `Trip complete · ${trip.itemsBought} items · $${trip.totalSpent.toFixed(2)}`,
        { tripId: trip.id }
      );
      persist();
    },

    removeTrip: (tripId, receiptIds) => {
      const receiptSet = new Set(receiptIds);
      const trip = get().trips.find((entry) => entry.id === tripId);
      const existingReceiptIds = get().receipts
        .filter((receipt) => receiptSet.has(receipt.id))
        .map((receipt) => receipt.id);
      if (!trip && !existingReceiptIds.length) return;
      const tripDeletedAt = nextTimestamp(Math.max(
        trip?.completedAt ?? 0,
        get().deletedTrips?.find((entry) => entry.id === tripId)?.deletedAt ?? 0,
      ));
      const receiptTombstones = receiptIds.map((receiptId) => {
        const receipt = get().receipts.find((entry) => entry.id === receiptId);
        return {
          id: receiptId,
          deletedAt: nextTimestamp(Math.max(
            receipt?.updatedAt ?? receipt?.createdAt ?? 0,
            get().deletedReceipts?.find((entry) => entry.id === receiptId)?.deletedAt ?? 0,
          )),
        };
      });
      set((s) => ({
        trips: s.trips.filter((t) => t.id !== tripId),
        receipts: s.receipts.filter((r) => !receiptSet.has(r.id)),
        deletedTrips: mergeTombstones(s.deletedTrips, [{ id: tripId, deletedAt: tripDeletedAt }]),
        deletedReceipts: mergeTombstones(s.deletedReceipts, receiptTombstones),
      }));
      persist();
    },

    closeTrip: (tripId) => {
      if (!tripId) return;
      if (get().closedTripIds?.some((entry) => entry.id === tripId)) return;
      set((s) => ({
        closedTripIds: mergeTombstones(s.closedTripIds, [{ id: tripId, deletedAt: now() }]),
      }));
      persist();
    },

    updateReceipt: (receiptId, patch) => {
      const current = get().receipts.find((receipt) => receipt.id === receiptId);
      if (!current) return;
      const meaningfulPatch = changedFields(current, patch);
      if (!Object.keys(meaningfulPatch).length) return;
      set((s) => ({
        receipts: s.receipts.map((r) =>
          r.id === receiptId
            ? { ...r, ...meaningfulPatch, updatedAt: nextTimestamp(r.updatedAt ?? r.createdAt) }
            : r
        ),
      }));
      persist();
    },

    recordPrice: (input) => {
      if (!get().activeSession || !currentShoppingAccess().canLogPrices) return;
      if (!isValidPrice(input.price)) return;
      const rounded = Math.round(input.price * 100) / 100;
      // Skip if an identical entry was recorded in the last 30 s (receipt re-scan guard).
      if (isDuplicatePriceEntry(get().priceHistory, { ...input, price: rounded })) return;
      const entry: PriceEntry = {
        ...input,
        id: uid('price'),
        price: rounded,
        paidAt: now(),
      };
      set((s) => ({ priceHistory: [entry, ...s.priceHistory].slice(0, 1000) }));
      persist();
    },

    setActiveSession: (session, eventType) => {
      set({ activeSession: session });
      const itemCount = session?.entries.length ?? 0;
      const pickedCount = session?.entries.filter((entry) => entry.picked).length ?? 0;
      const sessionId = session?.tripId ?? 'none';
      const action =
        eventType === 'TOGGLE_PICK' || eventType === 'SET_PICK' ? 'check' :
        eventType === 'ADD_ENTRY' ? 'add' :
        eventType === 'MARK_OUT_OF_STOCK' ? 'remove' :
        eventType === 'FINISH_STORE' || eventType === 'FINISH_TRIP' || eventType === 'FINISH_TRIP_EARLY' || eventType === 'END_TRIP' ? 'finish' :
        eventType ?? 'unknown';
      if (__DEV__) {
        console.log(`[Shopping Sync] active_session_mutation_local action=${action} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
        console.log(`[Shopping Sync] active_session_snapshot_write_requested action=${action} itemCount=${itemCount} pickedCount=${pickedCount} sessionId=${sessionId}`);
        if (eventType === 'START_TRIP') console.log('[Shopping Sync] trip_start synced', session?.tripId ?? 'none');
        if (eventType === 'TOGGLE_PICK' || eventType === 'SET_PICK') console.log('[Shopping Sync] item_checked synced', session?.tripId ?? 'none');
        if (eventType === 'END_TRIP' || eventType === 'FINISH_TRIP' || eventType === 'FINISH_TRIP_EARLY') console.log('[Shopping Sync] trip_end synced', session?.tripId ?? 'none');
      }
      persist();
    },

    updatePrefs: (patch) => {
      if (!hasChangedFields(get().prefs, patch)) return;
      set((s) => {
        const meaningfulPatch = changedFields(s.prefs, patch);
        const prefsUpdatedAt = { ...(s.prefsUpdatedAt ?? {}) };
        for (const key of Object.keys(meaningfulPatch) as (keyof HouseholdPrefs)[]) {
          prefsUpdatedAt[key] = nextTimestamp(prefsUpdatedAt[key]);
        }
        return { prefs: { ...s.prefs, ...meaningfulPatch }, prefsUpdatedAt };
      });
      persist();
    },

    logActivity: (type, message, refs, persistActivity = true) => {
      pushActivity(type, message, refs);
      if (persistActivity) persist();
    },

    resetAll: async () => {
      persistEpoch += 1;
      await persistQueue;
      await snapshotPushQueue.whenIdle();
      await clearCloudState();
      await clearDurable();
      set({ ...emptyDurableState, prefs: { ...defaultPrefs }, hydrated: true });
      void refreshWidgets([]);
    },

    resetLocalOnly: async () => {
      persistEpoch += 1;
      await persistQueue;
      await snapshotPushQueue.whenIdle();
      await clearDurable();
      set({ ...emptyDurableState, prefs: { ...defaultPrefs }, hydrated: true });
      void refreshWidgets([]);
    },

    applyRemotePatch: (patch) => {
      // Union closed-trip tombstones first (same rationale as deletedItems)
      // so the activeSession gate below always sees every trip either side
      // has already closed, regardless of which side's push landed first.
      const mergedClosedTripIds = mergeTombstones(get().closedTripIds, patch.closedTripIds);
      const gatedActiveSession = 'activeSession' in patch
        ? gateRemoteActiveSession(get().activeSession ?? null, patch.activeSession ?? null, mergedClosedTripIds)
        : undefined;
      set((s) => {
        // Union delete tombstones first, then merge items per-item (union by id,
        // last-writer-wins by updatedAt, honoring tombstones) so an item added
        // on one device is never dropped by the other device's snapshot — while
        // deletions still propagate. Replaces the old whole-array overwrite.
        const mergedTombstones = mergeTombstones(s.deletedItems, patch.deletedItems);
        const mergedStoreTombstones = mergeTombstones(s.deletedStores, patch.deletedStores);
        const mergedTripTombstones = mergeTombstones(s.deletedTrips, patch.deletedTrips);
        const mergedReceiptTombstones = mergeTombstones(s.deletedReceipts, patch.deletedReceipts);
        const mergedItems = patch.items
          ? consolidatePantryItems(mergePantryItems(s.items, patch.items, mergedTombstones))
          : s.items;
        const incoming = { ...s, ...patch } as DurableState;
        const mergedPrefs = patch.prefs || patch.prefsUpdatedAt
          ? mergePrefs(s, incoming, (patch.updatedAt ?? s.updatedAt) > s.updatedAt)
          : { prefs: s.prefs, prefsUpdatedAt: s.prefsUpdatedAt };
        return {
          ...s,
          ...patch,
          items: mergedItems,
          // Defensive: guard every array field against old cloud snapshots that
          // pre-date newly-added fields (e.g. priceHistory added in OTA 120).
          stores:       patch.stores || patch.deletedStores
            ? mergeStores(s.stores, patch.stores ?? [], mergedStoreTombstones)
            : s.stores,
          priceHistory: patch.priceHistory
            ? mergePriceHistory(s.priceHistory, patch.priceHistory)
            : s.priceHistory,
          receipts:     patch.receipts || patch.deletedReceipts
            ? mergeReceipts(s.receipts, patch.receipts ?? [], mergedReceiptTombstones)
            : s.receipts,
          trips:        patch.trips || patch.deletedTrips
            ? mergeTrips(s.trips, patch.trips ?? [], mergedTripTombstones)
            : s.trips,
          activity:     patch.activity
            ? mergeActivity(s.activity, patch.activity)
            : s.activity,
          ...mergedPrefs,
          // Gated: never write an unvalidated remote session — same policy as
          // session-store.ts's applyRemoteSession (clear guard + same-trip merge).
          activeSession: 'activeSession' in patch ? gatedActiveSession ?? null : s.activeSession ?? null,
          deletedItems: mergedTombstones,
          deletedStores: mergedStoreTombstones,
          deletedTrips: mergedTripTombstones,
          deletedReceipts: mergedReceiptTombstones,
          closedTripIds: mergedClosedTripIds,
        };
      });
      if ('activeSession' in patch) {
        const remoteSession = patch.activeSession ?? null;
        void import('./session-store').then(({ useSessionStore }) => {
          useSessionStore.getState().applyRemoteSession(remoteSession);
        });
      }
      // Save to disk (AsyncStorage) so we have it offline, but do NOT call persist()
      // because persist() triggers the syncEngine push loop.
      void saveDurable(snapshot(get()));
      void refreshWidgets(get().items);
    },
  };
});
