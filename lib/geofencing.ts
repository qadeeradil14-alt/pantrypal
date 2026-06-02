import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Store } from './stores';
import { supabase } from './supabase';

export const GEOFENCE_TASK = 'PANTRYPAL_GEOFENCE';

/** Same-store re-enters within this window are ignored (parking-lot GPS bounce). */
export const GEOFENCE_DEBOUNCE_MS = 3 * 60 * 1000;

/** How long grocery "shopping mode" stays pinned after an arrival. */
export const ACTIVE_STORE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const GEOFENCE_ACCURACY_BUFFER_M = 75;
export const ARRIVAL_RECORD_DEDUPE_MS = 10 * 60 * 1000;

const GEOFENCE_DEBOUNCE_KEY = 'pantrypal:geofence:last-enter:v1';

const MAX_ACTIVE_GEOFENCES = Platform.OS === 'ios' ? 20 : 100;

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
  const geofenceable = await getBestGeofenceStores(stores);
  if (geofenceable.length === 0) return false;

  let foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    foreground = await Location.requestForegroundPermissionsAsync();
  }
  if (foreground.status !== 'granted') return false;

  let background = await Location.getBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    background = await Location.requestBackgroundPermissionsAsync();
  }
  if (background.status !== 'granted') return false;

  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    geofenceable.map((s) => ({
      identifier: s.id,
      latitude: s.latitude!,
      longitude: s.longitude!,
      radius: Math.max(100, Math.min(s.radius_meters || 150, 500)),
      notifyOnEnter: true,
      notifyOnExit: false,
    })),
  );

  return true;
}

async function getBestGeofenceStores(stores: Store[]): Promise<Store[]> {
  const geofenceable = stores.filter((s) => s.latitude != null && s.longitude != null);
  if (geofenceable.length <= MAX_ACTIVE_GEOFENCES) return geofenceable;

  const here = await Location.getLastKnownPositionAsync()
    .then((position) => position ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    .catch(() => null);

  if (!here) {
    return geofenceable
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ACTIVE_GEOFENCES);
  }

  return geofenceable
    .slice()
    .sort((a, b) =>
      distanceMeters(here.coords.latitude, here.coords.longitude, a.latitude!, a.longitude!)
      - distanceMeters(here.coords.latitude, here.coords.longitude, b.latitude!, b.longitude!),
    )
    .slice(0, MAX_ACTIVE_GEOFENCES);
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

async function getArrivalActorName(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const metadata = session?.user?.user_metadata ?? {};
  const name = metadata.full_name || metadata.name || session?.user?.email?.split('@')[0];
  return typeof name === 'string' && name.trim() ? name.trim() : null;
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

async function isLikelyInsideStoreRegion(store: Store): Promise<boolean> {
  if (store.latitude == null || store.longitude == null) return true;

  const position = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 500 })
    .then((lastKnown) => lastKnown ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    .catch(() => null);

  if (!position) return true;

  const distance = distanceMeters(
    position.coords.latitude,
    position.coords.longitude,
    store.latitude,
    store.longitude,
  );
  const allowedDistance = Math.max(100, Math.min(store.radius_meters || 150, 500))
    + Math.max(position.coords.accuracy ?? 0, GEOFENCE_ACCURACY_BUFFER_M);
  return distance <= allowedDistance;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusM = 6_371_000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  if (arrivedBy) {
    const since = new Date(Date.now() - ARRIVAL_RECORD_DEDUPE_MS).toISOString();
    const { data: recent } = await supabase
      .from('store_arrivals')
      .select('id')
      .eq('household_id', store.household_id)
      .eq('store_id', store.id)
      .eq('arrived_by', arrivedBy)
      .gte('arrived_at', since)
      .limit(1);
    if (recent?.length) return;
  }

  const arrival = {
    household_id: store.household_id,
    store_id: store.id,
    arrived_by: arrivedBy,
    arrived_by_name: await getArrivalActorName(),
  };
  const { error } = await supabase.from('store_arrivals').insert(arrival);
  if (!error) return;
  if (!`${error.message ?? ''} ${error.details ?? ''}`.includes('arrived_by_name')) throw error;
  const { arrived_by_name: _name, ...legacyArrival } = arrival;
  const legacy = await supabase.from('store_arrivals').insert(legacyArrival);
  if (legacy.error) throw legacy.error;
}

/**
 * Core geofence enter handler: debounce, server validation, local notify, DB row for partners.
 */
export async function handleStoreGeofenceEnter(storeId: string): Promise<void> {
  if (!(await shouldHandleGeofenceEnter(storeId))) return;

  const store = (await fetchStoreById(storeId)) ?? null;
  if (!store) return;

  if (!(await isLikelyInsideStoreRegion(store))) return;

  const relevant = await hasRelevantShoppingAtStore(store);
  if (!relevant) return;

  const arrivedBy = await getArrivalUserId();
  await Promise.all([
    scheduleLocalArrivalNotification(store.name, store.id),
    recordStoreArrival(store, arrivedBy),
  ]);

  const { useStoresStore } = await import('../store/stores');
  const { pendingReceiptStoreId, receiptCompletedStoreIds, setActiveStore } = useStoresStore.getState();
  if (
    pendingReceiptStoreId
    && pendingReceiptStoreId !== store.id
    && !receiptCompletedStoreIds.includes(pendingReceiptStoreId)
  ) {
    return;
  }
  setActiveStore(store.id);
}
