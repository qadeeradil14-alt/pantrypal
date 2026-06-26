import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeStore {
  // null = follow iOS system color scheme; boolean = explicit user override
  isDark: boolean | null;
  setIsDark: (v: boolean | null) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      isDark: null,
      setIsDark: (v) => set({ isDark: v }),
    }),
    {
      name: 'stokit:v2:theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
