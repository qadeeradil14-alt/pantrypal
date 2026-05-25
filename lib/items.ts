import { supabase } from './supabase';
import type { ItemCategory } from '../constants/defaultItems';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value.trim());
}

export interface Item {
  id: string;
  household_id: string;
  name: string;
  category: ItemCategory;
  is_low: boolean;
  marked_low_by: string | null;
  got_it_by: string | null;
  added_by: string | null;
  updated_at: string;
  created_at: string;
}

export async function fetchItems(householdId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('household_id', householdId)
    .order('name');

  if (error) throw error;
  return data as Item[];
}

export async function markItemLow(itemId: string, userId: string) {
  const { error } = await supabase
    .from('items')
    .update({ is_low: true, marked_low_by: userId, got_it_by: null, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throw error;
}

export async function markItemOk(itemId: string) {
  const { error } = await supabase
    .from('items')
    .update({ is_low: false, marked_low_by: null, got_it_by: null, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throw error;
}

export async function markItemGotIt(itemId: string, userId: string) {
  const { error } = await supabase
    .from('items')
    .update({ is_low: false, got_it_by: userId, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throw error;
}

export async function addItem(householdId: string, name: string, category: ItemCategory, userId: string): Promise<Item> {
  if (!isUuid(householdId)) {
    throw new Error('Household not loaded yet. Please close and reopen Add item.');
  }

  const addedBy = isUuid(userId) ? userId : null;

  const { data, error } = await supabase
    .from('items')
    .insert({ household_id: householdId, name, category, added_by: addedBy })
    .select()
    .single();

  if (error) throw error;
  return data as Item;
}

export async function deleteItem(itemId: string) {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
}
