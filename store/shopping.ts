import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShoppingEntry {
  id: string;
  household_id: string;
  source_item_id: string | null;
  name: string;
  category: 'fridge' | 'freezer' | 'pantry' | 'spice_rack';
  aisle: string | null;
  quantity: number;
  status: 'active' | 'completed' | 'archived';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ShoppingState {
  entries: ShoppingEntry[];
  setEntries: (entries: ShoppingEntry[]) => void;
  upsertEntry: (entry: ShoppingEntry) => void;
  removeEntry: (id: string) => void;
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set) => ({
      entries: [],
      setEntries: (entries) => set({ entries }),
      upsertEntry: (entry) =>
        set((state) => {
          const idx = state.entries.findIndex((e) => e.id === entry.id);
          if (idx === -1) return { entries: [...state.entries, entry] };
          const next = [...state.entries];
          next[idx] = entry;
          return { entries: next };
        }),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
    }),
    {
      name: 'pantrypal:shopping-store:v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
