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
  loading: boolean;
  loaded: boolean;
  setHousehold: (h: Household | null) => void;
  setLoading: (loading: boolean) => void;
  clearHousehold: () => void;
}

export const useHouseholdStore = create<HouseholdStore>((set) => ({
  household: null,
  loading: false,
  loaded: false,
  setHousehold: (household) => set({ household, loaded: true, loading: false }),
  setLoading: (loading) => set({ loading }),
  clearHousehold: () => set({ household: null, loaded: true, loading: false }),
}));
