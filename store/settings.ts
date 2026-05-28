import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  weeklyBudget: number;
  setWeeklyBudget: (budget: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weeklyBudget: 150,
      setWeeklyBudget: (weeklyBudget) => set({ weeklyBudget }),
    }),
    {
      name: 'pantrypal:settings:v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
