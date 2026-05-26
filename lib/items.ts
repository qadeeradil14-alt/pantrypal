import { supabase } from './supabase';
import type { ItemCategory } from '../constants/defaultItems';
import { DEFAULT_ITEMS } from '../constants/defaultItems';
import { enqueueOfflineMutation, isTransientNetworkErrorForQueue, runWithOfflineQueue } from './offlineQueue';

export const OFFLINE_ITEM_ID_PREFIX = 'offline:';

export function isOfflineItemId(id: string): boolean {
  return id.startsWith(OFFLINE_ITEM_ID_PREFIX);
}

export class ItemConflictError extends Error {
  constructor() {
    super('This item was changed on another device. Pull to refresh and try again.');
    this.name = 'ItemConflictError';
  }
}

function makeOfflineItemId(): string {
  return `${OFFLINE_ITEM_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeOptimisticItem(
  householdId: string,
  name: string,
  category: ItemCategory,
  userId: string,
): Item {
  const ts = new Date().toISOString();
  return {
    id: makeOfflineItemId(),
    household_id: householdId,
    name,
    category,
    macro_status: 'in_stock',
    is_low: false,
    marked_low_by: null,
    got_it_by: null,
    added_by: isUuid(userId) ? userId : null,
    preferred_store_id: null,
    updated_at: ts,
    created_at: ts,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value.trim());
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export interface Item {
  id: string;
  household_id: string;
  name: string;
  category: ItemCategory;
  macro_status: 'in_stock' | 'running_low' | 'out_of_stock';
  is_low: boolean;
  marked_low_by: string | null;
  got_it_by: string | null;
  added_by: string | null;
  preferred_store_id: string | null;
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
    .update({ is_low: true, marked_low_by: userId, got_it_by: null })
    .eq('id', itemId);

  if (error) throw error;
}

export async function markItemLowWithQueue(itemId: string, userId: string): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'mark_low',
    { itemId, userId },
    () => markItemLow(itemId, userId),
  );
}

export async function markItemOk(itemId: string) {
  const { error } = await supabase
    .from('items')
    .update({ is_low: false, marked_low_by: null, got_it_by: null })
    .eq('id', itemId);

  if (error) throw error;
}

export async function markItemOkWithQueue(itemId: string): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'mark_ok',
    { itemId },
    () => markItemOk(itemId),
  );
}

export async function markItemGotIt(itemId: string, userId: string) {
  const { error } = await supabase
    .from('items')
    .update({ is_low: false, got_it_by: userId })
    .eq('id', itemId);

  if (error) throw error;
}

export async function markItemGotItWithQueue(itemId: string, userId: string): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'mark_got_it',
    { itemId, userId },
    () => markItemGotIt(itemId, userId),
  );
}

export async function addItemWithQueue(
  householdId: string,
  name: string,
  category: ItemCategory,
  userId: string,
): Promise<{ queued: boolean; item: Item }> {
  try {
    const item = await addItem(householdId, name, category, userId);
    return { queued: false, item };
  } catch (error) {
    if (!isTransientNetworkErrorForQueue(error)) throw error;
    const item = makeOptimisticItem(householdId, name, category, userId);
    await enqueueOfflineMutation('add_item', { householdId, name, category, userId });
    return { queued: true, item };
  }
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

export async function deleteItemWithQueue(itemId: string): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'delete_item',
    { itemId },
    () => deleteItem(itemId),
  );
}

export async function ensureDefaultItems(householdId: string, userId?: string | null): Promise<number> {
  if (!isUuid(householdId)) return 0;

  const { data: existingRows, error: existingError } = await supabase
    .from('items')
    .select('name, category')
    .eq('household_id', householdId);

  if (existingError) throw existingError;

  const existing = new Set(
    (existingRows ?? []).map((row: any) => `${norm(row.name)}::${String(row.category).toLowerCase()}`),
  );

  const addedBy = isUuid(userId) ? userId : null;
  const missing = DEFAULT_ITEMS
    .filter((item) => !existing.has(`${norm(item.name)}::${item.category}`))
    .map((item) => ({
      household_id: householdId,
      name: item.name,
      category: item.category,
      added_by: addedBy,
    }));

  if (missing.length === 0) return 0;

  const { error } = await supabase.from('items').insert(missing);
  if (error) throw error;
  return missing.length;
}

export async function updateItemDetails(
  itemId: string,
  updates: { name?: string; category?: string },
  expectedUpdatedAt?: string,
): Promise<Item> {
  let query = supabase.from('items').update(updates).eq('id', itemId);
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }
  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ItemConflictError();
  }
  return data as Item;
}

export async function updateItemDetailsWithQueue(
  itemId: string,
  updates: { name?: string; category?: string },
  expectedUpdatedAt: string,
): Promise<{ queued: boolean; item?: Item }> {
  if (isOfflineItemId(itemId)) {
    return { queued: true };
  }
  try {
    const item = await updateItemDetails(itemId, updates, expectedUpdatedAt);
    return { queued: false, item };
  } catch (error) {
    if (error instanceof ItemConflictError) throw error;
    if (!isTransientNetworkErrorForQueue(error)) throw error;
    await enqueueOfflineMutation('update_item', {
      itemId,
      name: updates.name ?? '',
      category: updates.category ?? 'pantry',
      expectedUpdatedAt,
    });
    return { queued: true };
  }
}
