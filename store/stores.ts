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
  /**
   * Set only by the realtime store_arrivals subscription — meaning a *partner*
   * just walked into a store. This drives the ArrivalBanner only, and is never
   * set by chip taps or the local geofence handler.
   */
  arrivalStoreId: string | null;
  arrivalNotice: ArrivalNotice | null;
  setStores: (stores: Store[]) => void;
  addStore: (store: Store) => void;
  removeStore: (id: string) => void;
  setActiveStore: (id: string | null) => void;
  setPendingReceiptStoreId: (id: string | null) => void;
  setArrivalStore: (notice: string | ArrivalNotice | null) => void;
  togglePin: (storeId: string) => void;
}

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      stores: [],
      pinnedStoreIds: [],
      activeStoreId: null,
      pendingReceiptStoreId: null,
      arrivalStoreId: null,
      arrivalNotice: null,
      setStores: (stores) => set({ stores }),
      addStore: (store) => set((s) => ({ stores: [...s.stores, store] })),
      removeStore: (id) => set((s) => ({
        stores: s.stores.filter((st) => st.id !== id),
        pinnedStoreIds: s.pinnedStoreIds.filter((pid) => pid !== id),
      })),
      setActiveStore: (activeStoreId) => set({ activeStoreId }),
      setPendingReceiptStoreId: (pendingReceiptStoreId) => set({ pendingReceiptStoreId }),
      setArrivalStore: (notice) => set({
        arrivalStoreId: typeof notice === 'string' ? notice : notice?.storeId ?? null,
        arrivalNotice: typeof notice === 'string'
          ? { storeId: notice, actorName: null, arrivedAt: null }
          : notice,
      }),
      togglePin: (storeId) => set((s) => ({
        pinnedStoreIds: s.pinnedStoreIds.includes(storeId)
          ? s.pinnedStoreIds.filter((id) => id !== storeId)
          : [...s.pinnedStoreIds, storeId],
      })),
    }),
    {
      name: 'pantrypal:stores-store:v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist arrivalStoreId — it should always be fresh on next launch
      partialize: (state) => ({
        stores: state.stores,
        activeStoreId: state.activeStoreId,
        pendingReceiptStoreId: state.pendingReceiptStoreId,
        pinnedStoreIds: state.pinnedStoreIds,
      }),
    },
  ),
);
