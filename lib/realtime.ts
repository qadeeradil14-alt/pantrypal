import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';
import { useItemsStore } from '../store/items';
import type { Item } from './items';

export function useRealtime(householdId: string | null) {
  const { upsertItem, removeItem } = useItemsStore();
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
        (payload) => upsertItem(payload.new as Item),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        (payload) => removeItem((payload.old as Item).id),
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
  }, [householdId]);
}
