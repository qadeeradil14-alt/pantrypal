import { create } from 'zustand';
import type { Item } from '../lib/items';

interface ItemsStore {
  items: Item[];
  setItems: (items: Item[]) => void;
  upsertItem: (item: Item) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
}

export const useItemsStore = create<ItemsStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  upsertItem: (item) =>
    set((state) => {
      const idx = state.items.findIndex((i) => i.id === item.id);
      if (idx === -1) return { items: [...state.items, item] };
      const next = [...state.items];
      next[idx] = item;
      return { items: next };
    }),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
}));
