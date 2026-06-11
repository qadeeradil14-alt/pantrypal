import { supabase } from '../../lib/supabase';
import { useDurableStore } from '../../store/durable-store';
import { useHouseholdStore } from '../../store/household-store';
import type { DurableState, PantryItem, Receipt } from '../../types';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'receipts' },
      (payload) => {
        const state = useDurableStore.getState();
        const receipts = [...state.receipts];

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = payload.new as any;
          const incoming: Receipt = {
            id: remote.id,
            tripId: remote.trip_id,
            storeId: remote.store_id,
            amount: Number(remote.amount),
            status: remote.status,
            imageUri: remote.image_uri,
            createdAt: Number(remote.created_at),
          };
          const existingIdx = receipts.findIndex(r => r.id === incoming.id);
          if (existingIdx >= 0) {
            receipts[existingIdx] = incoming;
          } else {
            receipts.unshift(incoming);
          }
          state.applyRemotePatch({ receipts });
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id;
          state.applyRemotePatch({ receipts: receipts.filter(r => r.id !== deletedId) });
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
/**
 * Pull pantry_items and receipts from Supabase and restore them to local store.
 * Called on sign-in when local AsyncStorage is empty (e.g. after reinstall).
 * Uses auth.user.id as the stable household identifier — survives reinstalls.
 */
export async function pullFromSupabase(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    console.log('[Sync Engine] Pulling cloud data for user:', userId);

    const { data: remoteItems, error: itemsError } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', userId)
      .order('created_at', { ascending: false });

    if (!itemsError && remoteItems && remoteItems.length > 0) {
      const items: PantryItem[] = remoteItems.map((row: any) => ({
        id: row.id,
        name: row.name,
        quantity: Number(row.quantity),
        unit: row.unit,
        status: row.status,
        storageLocation: row.storage_location,
        storeId: row.store_id,
        expiryDate: row.expiry_date,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      }));
      console.log('[Sync Engine] Restored', items.length, 'items from cloud.');
      useDurableStore.getState().applyRemotePatch({ items });
    }

    const { data: remoteReceipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('*')
      .eq('household_id', userId)
      .order('created_at', { ascending: false });

    if (!receiptsError && remoteReceipts && remoteReceipts.length > 0) {
      const receipts: Receipt[] = remoteReceipts.map((row: any) => ({
        id: row.id,
        tripId: row.trip_id,
        storeId: row.store_id,
        amount: Number(row.amount),
        status: row.status,
        imageUri: row.image_uri,
        createdAt: Number(row.created_at),
      }));
      console.log('[Sync Engine] Restored', receipts.length, 'receipts from cloud.');
      useDurableStore.getState().applyRemotePatch({ receipts });
    }
  } catch (err) {
    console.warn('[Sync Engine] Cloud pull failed:', err);
  }
}

export async function pushLocalState(state: DurableState) {
  // Push all items to Supabase
  // In a real app we'd only push items that changed (dirty tracking)
  // For the prototype, we push the whole pantry if we have an active household.

  // Use auth user.id as the stable cloud household key — survives reinstalls.
  const { data: { session } } = await supabase.auth.getSession();
  const householdId = session?.user?.id ?? useHouseholdStore.getState().household?.id ?? null;

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

    // Sync Receipts
    const receiptRecords = await Promise.all(state.receipts.map(async (receipt) => {
      let finalUri = receipt.imageUri;

      // If it's a local file URI, upload to Supabase Storage first
      if (finalUri?.startsWith('file://')) {
        try {
          const base64 = await FileSystem.readAsStringAsync(finalUri, { encoding: FileSystem.EncodingType.Base64 });
          const fileExt = finalUri.split('.').pop()?.toLowerCase() || 'jpeg';
          const fileName = `${receipt.id}.${fileExt}`;
          const filePath = `${householdId ?? 'guest'}/${fileName}`;
          
          const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, decode(base64), {
            contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
            upsert: true
          });

          if (!uploadError) {
            const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
            finalUri = data.publicUrl;
            
            // Update durable store with the remote URI silently
            setTimeout(() => {
               const s = useDurableStore.getState();
               s.applyRemotePatch({ receipts: s.receipts.map(r => r.id === receipt.id ? { ...r, imageUri: finalUri, status: 'logged' } : r) });
            }, 0);
          }
        } catch (e) {
          console.warn('[Sync Engine] Failed to upload receipt image', e);
        }
      }

      return {
        id: receipt.id,
        trip_id: receipt.tripId,
        store_id: receipt.storeId,
        amount: receipt.amount,
        status: (finalUri && !finalUri.startsWith('file://')) ? 'logged' : receipt.status,
        image_uri: finalUri,
        household_id: householdId,
        created_at: receipt.createdAt,
      };
    }));

    if (receiptRecords.length > 0) {
      const { error } = await supabase.from('receipts').upsert(receiptRecords, { onConflict: 'id' });
      if (error) console.warn('[Sync Engine] Failed to push receipts:', error.message);
    }
  } catch (err) {
    console.warn('[Sync Engine] Offline or push failed.', err);
  }
}
