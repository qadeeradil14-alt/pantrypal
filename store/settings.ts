import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  weeklyBudget: number;
  setWeeklyBudget: (budget: number) => void;

  // Notification preferences
  notifArrivalSelf: boolean;     // notify me when I arrive at a store
  notifArrivalPartner: boolean;  // notify me when partner arrives at a store
  notifExpiry: boolean;          // remind me about items expiring soon
  notifLowStock: boolean;        // alert when items go low

  setNotifArrivalSelf: (v: boolean) => void;
  setNotifArrivalPartner: (v: boolean) => void;
  setNotifExpiry: (v: boolean) => void;
  setNotifLowStock: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weeklyBudget: 150,
      setWeeklyBudget: (weeklyBudget) => set({ weeklyBudget }),

      notifArrivalSelf: true,
      notifArrivalPartner: true,
      notifExpiry: true,
      notifLowStock: true,

      setNotifArrivalSelf: (notifArrivalSelf) => set({ notifArrivalSelf }),
      setNotifArrivalPartner: (notifArrivalPartner) => set({ notifArrivalPartner }),
      setNotifExpiry: (notifExpiry) => set({ notifExpiry }),
      setNotifLowStock: (notifLowStock) => set({ notifLowStock }),
    }),
    {
      name: 'pantrypal:settings:v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
