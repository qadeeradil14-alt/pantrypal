import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../store/auth';
import { useHouseholdStore } from '../store/household';

/**
 * Single owner of all household loading lifecycle.
 * Call this once from app/_layout.tsx so it always runs regardless of which
 * screen the app opens to (normal flow, push notification tap, deep link).
 *
 * Responsibilities:
 *  1. Trigger load() when a userId is present and status is idle.
 *  2. Retry load() on foreground after a network failure (status === 'error').
 */
export function useHouseholdLoader() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const status = useHouseholdStore((s) => s.status);

  // Initial load — fires whenever we have a user and nothing has started yet.
  useEffect(() => {
    if (!userId || status !== 'idle') return;
    void useHouseholdStore.getState().load(userId);
  }, [userId, status]);

  // Foreground retry after network failure.
  // Reads state via getState() inside the callback to avoid stale closures.
  useEffect(() => {
    if (status !== 'error' || !userId) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const s = useHouseholdStore.getState();
      if (s.status !== 'error') return;
      void s.load(userId);
    });
    return () => sub.remove();
  }, [status, userId]);
}
