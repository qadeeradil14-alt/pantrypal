import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetchStores } from '../lib/stores';
import { fetchItems } from '../lib/items';
import { fetchActiveShoppingList } from '../lib/shoppingList';
import { flushMutationQueue } from '../lib/offlineQueue';
import { startGeofencing, stopGeofencing } from '../lib/geofencing';
import { useStoresStore } from '../store/stores';
import { useItemsStore } from '../store/items';
import { useShoppingStore } from '../store/shopping';

async function loadAndSync(householdId: string, signal: { cancelled: boolean }): Promise<void> {
  await flushMutationQueue();
  if (signal.cancelled) return;
  const [stores, items, shoppingEntries] = await Promise.all([
    fetchStores(householdId),
    fetchItems(householdId),
    fetchActiveShoppingList(householdId),
  ]);
  if (signal.cancelled) return;
  useStoresStore.getState().setStores(stores);
  useItemsStore.getState().setItems(items);
  useShoppingStore.getState().setEntries(shoppingEntries);
  await stopGeofencing();
  if (stores.some((s) => s.latitude != null && s.longitude != null)) {
    await startGeofencing(stores);
  }
}

/**
 * Single owner of data bootstrap + foreground refresh for the (main) shell.
 * Fetches stores, items, and shopping list when householdId becomes available,
 * then re-fetches every time the app returns to the foreground.
 */
export function useDataBootstrap(householdId: string | null) {
  // Initial load when householdId is first set (or changes after a household switch).
  useEffect(() => {
    if (!householdId) return;
    const signal = { cancelled: false };
    void loadAndSync(householdId, signal).catch(() => {
      // Persisted state covers the gap until foreground refresh succeeds.
    });
    return () => { signal.cancelled = true; };
  }, [householdId]);

  // Foreground refresh — re-syncs everything when the app returns to the foreground.
  useEffect(() => {
    if (!householdId) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const signal = { cancelled: false };
      void loadAndSync(householdId, signal).catch(() => {});
    });
    return () => sub.remove();
  }, [householdId]);
}
