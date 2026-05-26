import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Store } from '../lib/stores';

interface StoresState {
  stores: Store[];
  activeStoreId: string | null;
  setStores: (stores: Store[]) => void;
  addStore: (store: Store) => void;
  removeStore: (id: string) => void;
  setActiveStore: (id: string | null) => void;
}

export const useStoresStore = create<StoresState>()(
  persist(
    (set) => ({
      stores: [],
      activeStoreId: null,
      setStores: (stores) => set({ stores }),
      addStore: (store) => set((s) => ({ stores: [...s.stores, store] })),
      removeStore: (id) => set((s) => ({ stores: s.stores.filter((st) => st.id !== id) })),
      setActiveStore: (activeStoreId) => set({ activeStoreId }),
    }),
    {
      name: 'pantrypal:stores-store:v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ stores: state.stores, activeStoreId: state.activeStoreId }),
    },
  ),
);
