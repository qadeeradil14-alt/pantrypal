import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      isDark: true,  // Slow Kitchen is dark-first; users can toggle in Settings
      toggle: () => set({ isDark: !get().isDark }),
    }),
    {
      name: 'pantrypal:theme:v2',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
