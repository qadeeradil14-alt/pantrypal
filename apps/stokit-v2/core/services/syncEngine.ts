import { supabase } from '../../lib/supabase';
import { useDurableStore } from '../../store/durable-store';
import { useHouseholdStore } from '../../store/household-store';
import type { DurableState, PantryItem } from '../../types';

let syncChannel: ReturnType<typeof supabase.channel> | null = null;
let isStarted = false;

export function startSyncEngine() {
  if (isStarted) return;
  isStarted = true;

  console.log('[Sync Engine] Starting realtime subscription...');

  syncChannel = supabase
    .channel('public:pantry_items')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pantry_items' },
      (payload) => {
        console.log('[Sync Engine] Received remote change:', payload.eventType);
        const state = useDurableStore.getState();
        const items = [...state.items];

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remoteItem = payload.new as any;
          // Map DB snake_case back to camelCase PantryItem
          const incoming: PantryItem = {
            id: remoteItem.id,
            name: remoteItem.name,
            quantity: Number(remoteItem.quantity),
            unit: remoteItem.unit,
            status: remoteItem.status,
            storageLocation: remoteItem.storage_location,
            storeId: remoteItem.store_id,
            expiryDate: remoteItem.expiry_date,
            createdAt: Number(remoteItem.created_at),
            updatedAt: Number(remoteItem.updated_at),
          };

          const existingIdx = items.findIndex(it => it.id === incoming.id);
          if (existingIdx >= 0) {
            // Only overwrite if the remote change is strictly newer to prevent bouncing
            if (incoming.updatedAt > items[existingIdx].updatedAt) {
              items[existingIdx] = incoming;
              state.applyRemotePatch({ items });
            }
          } else {
            items.unshift(incoming);
            state.applyRemotePatch({ items });
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id;
          const newItems = items.filter(it => it.id !== deletedId);
          state.applyRemotePatch({ items: newItems });
        }
      }
    )
    .subscribe((status) => {
      console.log('[Sync Engine] Subscription status:', status);
    });
}

export function stopSyncEngine() {
  if (syncChannel) {
    supabase.removeChannel(syncChannel);
    syncChannel = null;
  }
  isStarted = false;
}

/**
 * Called automatically by durable-store persist()
 */
export async function pushLocalState(state: DurableState) {
  // Push all items to Supabase
  // In a real app we'd only push items that changed (dirty tracking)
  // For the prototype, we push the whole pantry if we have an active household.
  
  const household = useHouseholdStore.getState().household;
  const householdId = household ? household.id : null;

  try {
    const records = state.items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status,
      storage_location: item.storageLocation,
      store_id: item.storeId,
      expiry_date: item.expiryDate,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      household_id: householdId,
    }));

    if (records.length > 0) {
      // upsert handles inserting new or updating existing
      const { error } = await supabase.from('pantry_items').upsert(records, { onConflict: 'id' });
      if (error) {
        console.warn('[Sync Engine] Failed to push to Supabase:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Sync Engine] Offline or push failed.', err);
  }
}
