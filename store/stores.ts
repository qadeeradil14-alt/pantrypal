import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Store } from '../lib/stores';

interface StoresState {
  stores: Store[];
  /** Currently active store for shopping mode (chip tap or own geofence). */
  activeStoreId: string | null;
  /**
   * Set only by the realtime store_arrivals subscription — meaning a *partner*
   * just walked into a store. This drives the ArrivalBanner only, and is never
   * set by chip taps or the local geofence handler.
   */
  arrivalStoreId: string | null;
  setStores: (stores: Store[]) => void;
  addStore: (store: Store) => void;
  removeStore: (id: string) => void;
  setActiveStore: (id: string | null) => void;
  setArrivalStore: (id: string | null) => void;
}

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      stores: [],
      activeStoreId: null,
      arrivalStoreId: null,
      setStores: (stores) => set({ stores }),
      addStore: (store) => set((s) => ({ stores: [...s.stores, store] })),
      removeStore: (id) => set((s) => ({ stores: s.stores.filter((st) => st.id !== id) })),
      setActiveStore: (activeStoreId) => set({ activeStoreId }),
      setArrivalStore: (arrivalStoreId) => set({ arrivalStoreId }),
    }),
    {
      name: 'pantrypal:stores-store:v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist arrivalStoreId — it should always be fresh on next launch
      partialize: (state) => ({ stores: state.stores, activeStoreId: state.activeStoreId }),
    },
  ),
);
