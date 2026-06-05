import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Store } from '../lib/stores';

export interface ArrivalNotice {
  storeId: string;
  actorName: string | null;
  arrivedAt: string | null;
}

interface StoresState {
  stores: Store[];
  pinnedStoreIds: string[];
  /** Currently active store for shopping mode (chip tap or own geofence). */
  activeStoreId: string | null;
  /**
   * Store finished shopping but receipt step not completed (save/upload/skip).
   * Blocks switching to another store until cleared.
   */
  pendingReceiptStoreId: string | null;
  /** Stores where the post-stop receipt step (amount / upload / skip) was completed this trip. */
  receiptCompletedStoreIds: string[];
  /**
   * Set only by the realtime store_arrivals subscription — meaning a *partner*
   * just walked into a store. This drives the ArrivalBanner only, and is never
   * set by chip taps or the local geofence handler.
   */
  arrivalStoreId: string | null;
  arrivalNotice: ArrivalNotice | null;
  /**
   * Set by the geofence engine when 2+ stores are within AMBIGUOUS_RADIUS_M.
   * The grocery screen shows a "Where are you shopping?" disambiguation sheet.
   * Cleared once the user picks a store or dismisses.
   */
  ambiguousArrivals: string[];
  setStores: (stores: Store[]) => void;
  addStore: (store: Store) => void;
  removeStore: (id: string) => void;
  setActiveStore: (id: string | null) => void;
  setPendingReceiptStoreId: (id: string | null) => void;
  markReceiptCompleted: (storeId: string) => void;
  clearReceiptTrip: () => void;
  setArrivalStore: (notice: string | ArrivalNotice | null) => void;
  setAmbiguousArrivals: (ids: string[]) => void;
  togglePin: (storeId: string) => void;
}

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      stores: [],
      pinnedStoreIds: [],
      activeStoreId: null,
      pendingReceiptStoreId: null,
      receiptCompletedStoreIds: [],
      arrivalStoreId: null,
      arrivalNotice: null,
      ambiguousArrivals: [],
      setStores: (stores) => set({ stores }),
      addStore: (store) => set((s) => ({
        stores: s.stores.some((st) => st.id === store.id) ? s.stores : [...s.stores, store],
      })),
      removeStore: (id) => set((s) => ({
        stores: s.stores.filter((st) => st.id !== id),
        pinnedStoreIds: s.pinnedStoreIds.filter((pid) => pid !== id),
      })),
      setActiveStore: (activeStoreId) => set({ activeStoreId }),
      setPendingReceiptStoreId: (pendingReceiptStoreId) => set({ pendingReceiptStoreId }),
      markReceiptCompleted: (storeId) => set((s) => ({
        receiptCompletedStoreIds: s.receiptCompletedStoreIds.includes(storeId)
          ? s.receiptCompletedStoreIds
          : [...s.receiptCompletedStoreIds, storeId],
        pendingReceiptStoreId: s.pendingReceiptStoreId === storeId ? null : s.pendingReceiptStoreId,
      })),
      clearReceiptTrip: () => set({ receiptCompletedStoreIds: [], pendingReceiptStoreId: null }),
      setArrivalStore: (notice) => set({
        arrivalStoreId: typeof notice === 'string' ? notice : notice?.storeId ?? null,
        arrivalNotice: typeof notice === 'string'
          ? { storeId: notice, actorName: null, arrivedAt: null }
          : notice,
      }),
      setAmbiguousArrivals: (ambiguousArrivals) => set({ ambiguousArrivals }),
      togglePin: (storeId) => set((s) => ({
        pinnedStoreIds: s.pinnedStoreIds.includes(storeId)
          ? s.pinnedStoreIds.filter((id) => id !== storeId)
          : [...s.pinnedStoreIds, storeId],
      })),
    }),
    {
      name: 'pantrypal:stores-store:v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist static store data and UI preferences.
      // Shopping session state (activeStoreId, pendingReceiptStoreId, receiptCompletedStoreIds)
      // must NOT be persisted — stale values on app reopen cause shopping mode to auto-start,
      // the spend sheet to reopen immediately, and geofence notifications to misbehave.
      partialize: (state) => ({
        stores: state.stores,
        pinnedStoreIds: state.pinnedStoreIds,
      }),
    },
  ),
);
