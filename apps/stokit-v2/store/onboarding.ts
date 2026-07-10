/**
 * Onboarding completion flag — persisted so the intro carousel is shown once
 * and never again (unless app data is reset). Hydrated at startup by _layout
 * before the first paint so there is no flash of onboarding for returning users.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ONBOARDING_KEY = 'stokit:v2:onboarding-complete';

interface OnboardingStore {
  completed: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Marks onboarding complete and persists it BEFORE the caller navigates. */
  complete: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  completed: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_KEY);
      set({ completed: value === '1', hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  complete: async () => {
    // Flip in-memory state first (synchronous) so routing is correct
    // immediately, then persist.
    set({ completed: true });
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // Non-fatal — worst case the user sees onboarding once more.
    }
  },
}));
