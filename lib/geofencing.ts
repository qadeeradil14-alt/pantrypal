import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import type { Store } from './stores';
import { supabase } from './supabase';

export const GEOFENCE_TASK = 'PANTRYPAL_GEOFENCE';

/** Same-store re-enters within this window are ignored (parking-lot GPS bounce). */
export const GEOFENCE_DEBOUNCE_MS = 3 * 60 * 1000;

/** How long grocery "shopping mode" stays pinned after an arrival. */
export const ACTIVE_STORE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const GEOFENCE_DEBOUNCE_KEY = 'pantrypal:geofence:last-enter:v1';

export function defineGeofenceTask(onEnter: (storeId: string) => void) {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK)) return;

  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
    if (error) return;
    const { eventType, region } = data;
    if (eventType === Location.GeofencingEventType.Enter && region?.identifier) {
      await handleStoreGeofenceEnter(region.identifier).catch(() => {});
      onEnter(region.identifier);
    }
  });
}

export async function startGeofencing(stores: Store[]): Promise<boolean> {
  const geofenceable = stores.filter((s) => s.latitude != null && s.longitude != null);
  if (geofenceable.length === 0) return false;

  let { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== 'granted') {
    const requested = await Location.requestBackgroundPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return false;

  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    geofenceable.map((s) => ({
      identifier: s.id,
      latitude: s.latitude!,
      longitude: s.longitude!,
      radius: s.radius_meters,
      notifyOnEnter: true,
      notifyOnExit: false,
    })),
  );

  return true;
}

export async function stopGeofencing() {
  const active = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (active) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

async function shouldHandleGeofenceEnter(storeId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(GEOFENCE_DEBOUNCE_KEY);
    const now = Date.now();
    if (raw) {
      const parsed = JSON.parse(raw) as { storeId: string; at: number };
      if (parsed.storeId === storeId && now - parsed.at < GEOFENCE_DEBOUNCE_MS) {
        return false;
      }
    }
    await AsyncStorage.setItem(GEOFENCE_DEBOUNCE_KEY, JSON.stringify({ storeId, at: now }));
    return true;
  } catch {
    return true;
  }
}

async function getArrivalUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

async function fetchStoreById(storeId: string): Promise<Store | null> {
  const { data, error } = await supabase.from('stores').select('*').eq('id', storeId).maybeSingle();
  if (error || !data) return null;
  return data as Store;
}

/**
 * Server-backed check so background geofence events do not rely on stale Zustand caches.
 */
async function hasRelevantShoppingAtStore(store: Store): Promise<boolean> {
  const [{ data: entries, error: entriesError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from('shopping_list')
        .select('id, source_item_id')
        .eq('household_id', store.household_id)
        .eq('status', 'active'),
      supabase
        .from('items')
        .select('id, preferred_store_id')
        .eq('household_id', store.household_id),
    ]);

  if (entriesError || itemsError || !entries?.length) return false;

  const itemMap = new Map((items ?? []).map((item) => [item.id, item]));
  return entries.some((entry) => {
    if (!entry.source_item_id) return true;
    const source = itemMap.get(entry.source_item_id);
    if (!source) return true;
    return source.preferred_store_id == null || source.preferred_store_id === store.id;
  });
}

export async function scheduleLocalArrivalNotification(storeName: string, storeId?: string) {
  // Respect the user's notification preference stored in AsyncStorage
  try {
    const raw = await AsyncStorage.getItem('pantrypal:settings:v1');
    if (raw) {
      const prefs = JSON.parse(raw)?.state;
      if (prefs?.notifArrivalSelf === false) return; // user turned it off
    }
  } catch { /* if we can't read prefs, fire anyway */ }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `You're at ${storeName}`,
      body: 'Your shopping list is ready. Tap to open it.',
      sound: 'default',
      data: { storeId, type: 'arrival_self' },
    },
    trigger: null,
  });
}

/** @deprecated Use scheduleLocalArrivalNotification — local device only, not partner push. */
export const notifyPartnerArrival = scheduleLocalArrivalNotification;

export async function recordStoreArrival(store: Store, arrivedBy: string | null) {
  await supabase.from('store_arrivals').insert({
    household_id: store.household_id,
    store_id: store.id,
    arrived_by: arrivedBy,
  });
}

/**
 * Core geofence enter handler: debounce, server validation, local notify, DB row for partners.
 */
export async function handleStoreGeofenceEnter(storeId: string): Promise<void> {
  if (!(await shouldHandleGeofenceEnter(storeId))) return;

  const store = (await fetchStoreById(storeId)) ?? null;
  if (!store) return;

  const relevant = await hasRelevantShoppingAtStore(store);
  if (!relevant) return;

  const arrivedBy = await getArrivalUserId();
  await Promise.all([
    scheduleLocalArrivalNotification(store.name, store.id),
    recordStoreArrival(store, arrivedBy),
  ]);

  const { useStoresStore } = await import('../store/stores');
  useStoresStore.getState().setActiveStore(store.id);
}
