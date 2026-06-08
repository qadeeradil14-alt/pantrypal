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
      isDark: false,
      toggle: () => set({ isDark: !get().isDark }),
    }),
    {
      name: 'stokit:v2:theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
