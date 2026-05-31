import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { useShoppingStore, type ShoppingEntry } from '../store/shopping';
import { useAuthStore } from '../store/auth';
import type { Item } from './items';

// Fields that are managed optimistically locally — incoming realtime events
// for these fields must not overwrite a recent local change. We track the
// last locally-written value per item so we can guard against stale echoes.
const localOverrides = new Map<string, Partial<Item>>();

/** Record a local optimistic write so the realtime echo is ignored. */
export function recordLocalOverride(itemId: string, patch: Partial<Item>) {
  const existing = localOverrides.get(itemId) ?? {};
  localOverrides.set(itemId, { ...existing, ...patch });
  // Auto-clear after 8s — plenty of time for the DB round-trip + realtime echo.
  setTimeout(() => {
    const current = localOverrides.get(itemId);
    if (!current) return;
    const remaining = Object.fromEntries(
      Object.entries(current).filter(([k]) => !Object.keys(patch).includes(k)),
    ) as Partial<Item>;
    if (Object.keys(remaining).length === 0) localOverrides.delete(itemId);
    else localOverrides.set(itemId, remaining);
  }, 8000);
}

/** Merge a realtime payload with any pending local overrides. */
function mergeWithOverrides(incoming: Item): Item {
  const overrides = localOverrides.get(incoming.id);
  if (!overrides) return incoming;
  return { ...incoming, ...overrides };
}

export function useRealtime(householdId: string | null) {
  const { upsertItem, removeItem } = useItemsStore();
  const { upsertEntry, removeEntry } = useShoppingStore();
  const setArrivalStore = useStoresStore((s) => s.setArrivalStore);
  const currentUserId = useAuthStore((s) => s.session?.user.id ?? null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const instanceKeyRef = useRef(Math.random().toString(36).slice(2));

  async function subscribe() {
    if (!householdId) return;
    // Important: tab screens can mount this hook concurrently.
    // Use a unique channel topic per hook instance to avoid callback registration
    // on an already-subscribed shared channel.
    await unsubscribe();

    channelRef.current = supabase
      .channel(`items:${householdId}:${instanceKeyRef.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        (payload) => upsertItem(payload.new as Item),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        (payload) => upsertItem(mergeWithOverrides(payload.new as Item)),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        (payload) => removeItem((payload.old as Item).id),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'store_arrivals', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const arrival = payload.new as {
            store_id?: string;
            arrived_by?: string | null;
            arrived_by_name?: string | null;
            arrived_at?: string | null;
          };
          // Use setArrivalStore (not setActiveStore) so the ArrivalBanner fires
          // only for partner arrivals — not for the person's own chip taps.
          if (arrival.store_id && arrival.arrived_by !== currentUserId) {
            setArrivalStore({
              storeId: arrival.store_id,
              actorName: arrival.arrived_by_name ?? null,
              arrivedAt: arrival.arrived_at ?? null,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_list', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const entry = payload.new as ShoppingEntry;
          if (entry.status === 'active') upsertEntry(entry);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shopping_list', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const entry = payload.new as ShoppingEntry;
          if (entry.status === 'active') {
            upsertEntry(entry);
          } else {
            removeEntry(entry.id);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_list', filter: `household_id=eq.${householdId}` },
        (payload) => {
          const oldEntry = payload.old as ShoppingEntry;
          removeEntry(oldEntry.id);
        },
      )
      .subscribe();
  }

  async function unsubscribe() {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  useEffect(() => {
    subscribe().catch(() => {
      // Keep UI functional even if realtime fails.
    });

    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        subscribe().catch(() => {
          // Ignore and let next app-state transition retry.
        });
      } else if (state === 'background') {
        unsubscribe().catch(() => {
          // Ignore background unsubscribe failures.
        });
      }
    };

    const sub = AppState.addEventListener('change', handler);

    return () => {
      sub.remove();
      unsubscribe().catch(() => {
        // Ignore cleanup failures.
      });
    };
  }, [householdId, currentUserId]);
}
