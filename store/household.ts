import { create } from 'zustand';
import { getMyHousehold } from '../lib/households';

export type HouseholdStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
  plan: 'free' | 'paid';
}

interface HouseholdStore {
  household: Household | null;
  status: HouseholdStatus;
  /** Fetch from Supabase. Safe to call concurrently — ignores if already loading. */
  load: (userId: string) => Promise<void>;
  /** Set household after create/join (no re-fetch needed). */
  confirm: (h: Household) => void;
  /** Patch household fields in place (rename, invite code refresh, etc.). */
  update: (patch: Partial<Household>) => void;
  /** Intentional reset — sign-out or leave household. Returns to idle so the
   *  loader will re-run if the user signs in again. */
  clear: () => void;
}

export const useHouseholdStore = create<HouseholdStore>((set, get) => ({
  household: null,
  status: 'idle',

  load: async (userId) => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const data = await getMyHousehold(userId);
      const raw = data?.households;
      const h = Array.isArray(raw) ? raw[0] : raw;
      if (h && data?.role) {
        set({
          status: 'ready',
          household: {
            id: h.id,
            name: h.name,
            inviteCode: h.invite_code ?? '',
            role: data.role,
            plan: h.plan ?? 'free',
          },
        });
      } else {
        set({ status: 'none', household: null });
      }
    } catch {
      // Preserve any previously loaded household in memory on network error —
      // the user stays functional with stale data until connectivity returns.
      set((s) => ({ status: 'error', household: s.household }));
    }
  },

  confirm: (household) => set({ household, status: 'ready' }),

  update: (patch) =>
    set((s) => (s.household ? { household: { ...s.household, ...patch } } : {})),

  clear: () => set({ household: null, status: 'idle' }),
}));
