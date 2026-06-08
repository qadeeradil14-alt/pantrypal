import { useDurableStore } from '../store/durable-store';
import { useHouseholdStore } from '../store/household-store';
import { useSessionStore } from '../store/session-store';

export async function clearLocalAppData(): Promise<void> {
  await Promise.all([
    useDurableStore.getState().resetAll(),
    useHouseholdStore.getState().clearLocal(),
    useSessionStore.getState().clearSession(),
  ]);
}
