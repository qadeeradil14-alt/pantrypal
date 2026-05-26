import { supabase } from './supabase';
import { runWithOfflineQueue } from './offlineQueue';
import type { ShoppingEntry } from '../store/shopping';

export async function fetchActiveShoppingList(householdId: string): Promise<ShoppingEntry[]> {
  const { data, error } = await supabase
    .from('shopping_list')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ShoppingEntry[];
}

export async function completeShoppingEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw error;
}

export async function completeShoppingEntryWithQueue(entryId: string): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'complete_shopping_entry',
    { entryId },
    () => completeShoppingEntry(entryId),
  );
}
