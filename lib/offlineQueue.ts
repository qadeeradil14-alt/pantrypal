import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'pantrypal:offline-mutation-queue:v1';
const FLUSH_INTERVAL_MS = 3000; // reduced from 8s for snappier sync recovery

type MutationType =
  | 'mark_low'
  | 'mark_ok'
  | 'mark_got_it'
  | 'delete_item'
  | 'set_item_store'
  | 'complete_shopping_entry'
  | 'set_shopping_entry_aisle'
  | 'add_item'
  | 'update_item'
  | 'add_store'
  | 'delete_store';

type MutationPayloadMap = {
  mark_low: { itemId: string; userId: string };
  mark_ok: { itemId: string };
  mark_got_it: { itemId: string; userId: string };
  delete_item: { itemId: string };
  set_item_store: { itemId: string; storeId: string | null };
  complete_shopping_entry: { entryId: string };
  set_shopping_entry_aisle: { entryId: string; aisle: string | null };
  add_item: { householdId: string; name: string; category: string; userId: string; preferredStoreId?: string | null };
  update_item: {
    itemId: string;
    name: string;
    category: string;
    expectedUpdatedAt: string;
  };
  add_store: { householdId: string; name: string; address?: string; brandDomain?: string | null; logoUrl?: string | null };
  delete_store: { storeId: string };
};

type QueuedMutation<T extends MutationType = MutationType> = {
  id: string;
  type: T;
  payload: MutationPayloadMap[T];
  createdAt: string;
};

let workerStarted = false;
let intervalRef: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let flushing = false;
const queueListeners = new Set<() => void>();

function notifyQueueListeners(): void {
  queueListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeOfflineQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

export async function getPendingMutationCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyQueueListeners();
}

async function appendMutation<T extends MutationType>(type: T, payload: MutationPayloadMap[T]): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: makeId(),
    type,
    payload,
    createdAt: nowIso(),
  });
  await writeQueue(queue);
}

export async function enqueueOfflineMutation<T extends MutationType>(
  type: T,
  payload: MutationPayloadMap[T],
): Promise<void> {
  await appendMutation(type, payload);
}

export function isTransientNetworkErrorForQueue(error: unknown): boolean {
  return isTransientNetworkError(error);
}

function isTransientNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message ?? '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('fetch failed')
    || message.includes('network')
    || message.includes('offline')
    || message.includes('timed out')
    || message.includes('internet connection')
  );
}

async function runMutation(m: QueuedMutation): Promise<void> {
  switch (m.type) {
    case 'mark_low': {
      const payload = m.payload as MutationPayloadMap['mark_low'];
      const { error } = await supabase
        .from('items')
        .update({ is_low: true, macro_status: 'running_low', marked_low_by: payload.userId, got_it_by: null })
        .eq('id', payload.itemId);
      if (error) throw error;
      return;
    }
    case 'mark_ok': {
      const payload = m.payload as MutationPayloadMap['mark_ok'];
      const { error } = await supabase
        .from('items')
        .update({ is_low: false, macro_status: 'in_stock', marked_low_by: null, got_it_by: null })
        .eq('id', payload.itemId);
      if (error) throw error;
      return;
    }
    case 'mark_got_it': {
      const payload = m.payload as MutationPayloadMap['mark_got_it'];
      const { error } = await supabase
        .from('items')
        .update({ is_low: false, macro_status: 'in_stock', got_it_by: payload.userId })
        .eq('id', payload.itemId);
      if (error) throw error;
      return;
    }
    case 'delete_item': {
      const payload = m.payload as MutationPayloadMap['delete_item'];
      const { error } = await supabase.from('items').delete().eq('id', payload.itemId);
      if (error) throw error;
      return;
    }
    case 'set_item_store': {
      const payload = m.payload as MutationPayloadMap['set_item_store'];
      const { error } = await supabase
        .from('items')
        .update({ preferred_store_id: payload.storeId })
        .eq('id', payload.itemId);
      if (error) throw error;
      return;
    }
    case 'complete_shopping_entry': {
      const payload = m.payload as MutationPayloadMap['complete_shopping_entry'];
      const { error } = await supabase
        .from('shopping_list')
        .update({ status: 'completed', completed_at: nowIso() })
        .eq('id', payload.entryId);
      if (error) throw error;
      return;
    }
    case 'add_item': {
      const payload = m.payload as MutationPayloadMap['add_item'];
      const { error } = await supabase.from('items').insert({
        household_id: payload.householdId,
        name: payload.name,
        category: payload.category,
        added_by: payload.userId,
        preferred_store_id: payload.preferredStoreId ?? null,
      });
      if (error) throw error;
      return;
    }
    case 'update_item': {
      const payload = m.payload as MutationPayloadMap['update_item'];
      const { data, error } = await supabase
        .from('items')
        .update({ name: payload.name, category: payload.category })
        .eq('id', payload.itemId)
        .eq('updated_at', payload.expectedUpdatedAt)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('ITEM_CONFLICT');
      }
      return;
    }
    case 'add_store': {
      const payload = m.payload as MutationPayloadMap['add_store'];
      const { error } = await supabase.from('stores').insert({
        household_id: payload.householdId,
        name: payload.name,
        address: payload.address?.trim() || null,
        latitude: null,
        longitude: null,
        brand_domain: payload.brandDomain ?? null,
        logo_url: payload.logoUrl ?? null,
      });
      if (error) throw error;
      return;
    }
    case 'delete_store': {
      const payload = m.payload as MutationPayloadMap['delete_store'];
      const { error } = await supabase.from('stores').delete().eq('id', payload.storeId);
      if (error) throw error;
      return;
    }
    default:
      return;
  }
}

export async function flushMutationQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = await readQueue();
    if (queue.length === 0) return;

    const remaining: QueuedMutation[] = [];
    for (const mutation of queue) {
      try {
        await runMutation(mutation);
      } catch (error) {
        if (isTransientNetworkError(error)) {
          remaining.push(mutation);
          // Keep order for at-least-once semantics.
          const idx = queue.indexOf(mutation);
          remaining.push(...queue.slice(idx + 1));
          break;
        }
        // Permanent failures are dropped to avoid queue deadlock.
        if (String((error as Error)?.message) === 'ITEM_CONFLICT') {
          // Drop conflicted update; user must refresh.
        }
      }
    }

    await writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

export async function runWithOfflineQueue<T extends MutationType>(
  type: T,
  payload: MutationPayloadMap[T],
  onlineOperation: () => Promise<void>,
): Promise<{ queued: boolean }> {
  try {
    await onlineOperation();
    return { queued: false };
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    await appendMutation(type, payload);
    return { queued: true };
  }
}

export function startMutationQueueWorker(): () => void {
  if (!workerStarted) {
    workerStarted = true;
    void flushMutationQueue();
    intervalRef = setInterval(() => {
      void flushMutationQueue();
    }, FLUSH_INTERVAL_MS);

    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void flushMutationQueue();
      }
    });
  }

  return () => {
    if (intervalRef) {
      clearInterval(intervalRef);
      intervalRef = null;
    }
    appStateSub?.remove();
    appStateSub = null;
    workerStarted = false;
  };
}
