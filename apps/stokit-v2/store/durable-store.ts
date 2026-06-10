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
  PantryItem,
  PantryStatus,
  Receipt,
  Store,
  StorageLocation,
  Trip,
  Unit,
} from '../types';
export type { StorageLocation as StorageLocationImport };
import { uid, now } from '../core/services/id';
import {
  defaultPrefs,
  emptyDurableState,
  loadDurable,
  saveDurable,
  clearDurable,
} from '../core/repositories/durableRepository';
import { pushLocalState, startSyncEngine } from '../core/services/syncEngine';

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
  updateStore: (id: string, patch: { name?: string; logoColor?: string; logoEmoji?: string; logoUrl?: string; openingHours?: string; isOpen?: boolean }) => void;
  deleteStore: (id: string) => void;

  // Trips / receipts (committed from the shopping session)
  commitTrip: (trip: Trip, receipts: Receipt[]) => void;

  // Preferences
  updatePrefs: (patch: Partial<HouseholdPrefs>) => void;

  // Activity
  logActivity: (
    type: ActivityType,
    message: string,
    refs?: { itemId?: string; storeId?: string; tripId?: string }
  ) => void;

  resetAll: () => Promise<void>;
  
  // Sync Engine support: updates local state from remote WITHOUT pushing back
  applyRemotePatch: (patch: Partial<DurableState>) => void;
}

function snapshot(s: DurableState): DurableState {
  return {
    items: s.items,
    stores: s.stores,
    receipts: s.receipts,
    trips: s.trips,
    activity: s.activity,
    prefs: s.prefs,
  };
}

export const useDurableStore = create<DurableStore>((set, get) => {
  // is swallowed by the repository so the in-memory state stays authoritative.
  const persist = () => {
    const snap = snapshot(get());
    void saveDurable(snap);
    void pushLocalState(snap);
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
      if (loaded) {
        set({ ...loaded, hydrated: true });
      } else {
        set({ hydrated: true });
      }
      // Start real-time sync listeners once hydrated
      startSyncEngine();
    },

    addItem: (input) => {
      const { getStorageLocation } = require('../core/services/itemClassifier');
      const item: PantryItem = {
        id: uid('item'),
        name: input.name.trim(),
        quantity: input.quantity,
        unit: input.unit,
        status: input.status ?? 'stocked',
        storageLocation: input.storageLocation ?? getStorageLocation(input.name),
        storeId: input.storeId,
        expiryDate: input.expiryDate ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      set((s) => ({ items: [item, ...s.items] }));
      pushActivity('item_added', `Added ${item.name}`, { itemId: item.id });
      if (item.status === 'low') {
        pushActivity('marked_low', `${item.name} marked low`, { itemId: item.id });
      }
      persist();
      return item;
    },

    updateItem: (id, patch) => {
      set((s) => ({
        items: s.items.map((it) =>
          it.id === id ? { ...it, ...patch, updatedAt: now() } : it
        ),
      }));
      persist();
    },

    setItemStatus: (id, status) => {
      const item = get().items.find((it) => it.id === id);
      set((s) => ({
        items: s.items.map((it) =>
          it.id === id ? { ...it, status, updatedAt: now() } : it
        ),
      }));
      if (item && status === 'low' && item.status !== 'low') {
        pushActivity('marked_low', `${item.name} marked low`, { itemId: id });
      }
      persist();
    },

    deleteItem: (id) => {
      set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
      persist();
    },

    addStore: (input) => {
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
      return store;
    },

    updateStore: (id, patch) => {
      set((s) => ({
        stores: s.stores.map((st) =>
          st.id === id ? { ...st, ...patch, updatedAt: now() } : st
        ),
      }));
      persist();
    },

    deleteStore: (id) => {
      set((s) => ({
        stores: s.stores.filter((st) => st.id !== id),
        // Unassign items pointing at the removed store; never delete the items.
        items: s.items.map((it) =>
          it.storeId === id ? { ...it, storeId: null, updatedAt: now() } : it
        ),
      }));
      persist();
    },

    commitTrip: (trip, receipts) => {
      set((s) => ({
        trips: [trip, ...s.trips],
        receipts: [...receipts, ...s.receipts],
        // Mark purchased items as stocked again and reset expiry.
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

    updatePrefs: (patch) => {
      set((s) => ({ prefs: { ...s.prefs, ...patch } }));
      persist();
    },

    logActivity: (type, message, refs) => {
      pushActivity(type, message, refs);
      persist();
    },

    resetAll: async () => {
      await clearDurable();
      set({ ...emptyDurableState, prefs: { ...defaultPrefs }, hydrated: true });
    },

    applyRemotePatch: (patch) => {
      set((s) => ({ ...s, ...patch }));
      // Save to disk (AsyncStorage) so we have it offline, but do NOT call persist()
      // because persist() triggers the syncEngine push loop.
      void saveDurable(snapshot(get()));
    },
  };
});
