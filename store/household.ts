import { create } from 'zustand';

interface Household {
  id: string;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
  plan: 'free' | 'paid';
}

interface HouseholdStore {
  household: Household | null;
  setHousehold: (h: Household | null) => void;
  clearHousehold: () => void;
}

export const useHouseholdStore = create<HouseholdStore>((set) => ({
  household: null,
  setHousehold: (household) => set({ household }),
  clearHousehold: () => set({ household: null }),
}));
