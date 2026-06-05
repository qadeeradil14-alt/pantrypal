import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Store } from './stores';
import { supabase } from './supabase';

// ── Public constants ──────────────────────────────────────────────────────────

export const GEOFENCE_TASK = 'PANTRYPAL_GEOFENCE';

/** Same-store re-enters within this window are ignored (parking-lot GPS bounce). */
export const GEOFENCE_DEBOUNCE_MS = 3 * 60 * 1000;

/** How long grocery "shopping mode" stays pinned after an arrival. */
export const ACTIVE_STORE_TTL_MS = 2 * 60 * 60 * 1000;

export const GEOFENCE_ACCURACY_BUFFER_M = 75;
export const ARRIVAL_RECORD_DEDUPE_MS = 10 * 60 * 1000;

// ── Private tunables ──────────────────────────────────────────────────────────

/** GPS accuracy worse than this suppresses arrival detection entirely. */
const MAX_ACCEPTABLE_ACCURACY_M = 200;

/**
 * Stability window: wait this long after geofence enter, then re-verify position.
 * Filters drive-bys — a car at 50 km/h covers 500 m in ~36 s, so 25 s catches most.
 */
const STABILITY_WINDOW_MS = 25_000;

/** Global cooldown: suppress ALL arrival notifications within this window. */
const GLOBAL_NOTIF_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Two stores whose centroids are within this radius of each other are
 * considered "ambiguous" — we ask the user rather than guessing.
 */
const AMBIGUOUS_RADIUS_M = 300;

const MAX_ACTIVE_GEOFENCES = Platform.OS === 'ios' ? 20 : 100;

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const GEOFENCE_DEBOUNCE_KEY   = 'pantrypal:geofence:last-enter:v1';
const GLOBAL_NOTIF_KEY        = 'pantrypal:geofence:last-notification:v1';
const GEO_LOG_KEY             = 'pantrypal:geofence:debug-log:v1';

// ── Debug log ─────────────────────────────────────────────────────────────────

async function geoLog(storeId: string, message: string): Promise<void> {
  try {
    const entry = `[${new Date().toISOString()}] store=${storeId} | ${message}`;
    const raw = await AsyncStorage.getItem(GEO_LOG_KEY).catch(() => null);
    const lines: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    lines.unshift(entry);
    await AsyncStorage.setItem(GEO_LOG_KEY, JSON.stringify(lines.slice(0, 100)));
  } catch { /* non-fatal */ }
}

/** Read the last 100 geofence debug log lines (newest first). */
export async function getGeoDebugLog(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GEO_LOG_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ── Task definition ───────────────────────────────────────────────────────────

export function defineGeofenceTask(onEnter: (storeId: string) => void) {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK)) return;

  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
    if (error) return;
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: { identifier: string };
    };
    if (eventType === Location.GeofencingEventType.Enter && region?.identifier) {
      await handleStoreGeofenceEnter(region.identifier).catch(() => {});
      onEnter(region.identifier);
    }
  });
}

// ── Geofence start / stop ─────────────────────────────────────────────────────

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

/**
 * Candidate ranking (fix #1): if user has more stores than the OS limit,
 * select the MAX_ACTIVE_GEOFENCES closest to current position.
 */
async function getBestGeofenceStores(stores: Store[]): Promise<Store[]> {
  const geofenceable = stores.filter((s) => s.latitude != null && s.longitude != null);
  if (geofenceable.length <= MAX_ACTIVE_GEOFENCES) return geofenceable;

  const here = await Location.getLastKnownPositionAsync()
    .then((p) => p ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
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

// ── Debounce / cooldown ───────────────────────────────────────────────────────

/**
 * Per-store debounce (fix #6 hysteresis): ignore re-entries within 3 minutes
 * for the same store — prevents parking-lot GPS bounce.
 */
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

/**
 * Global notification cooldown (fix #5): no matter which store fires,
 * suppress notifications if we already sent one within 5 minutes.
 */
async function shouldFireNotification(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_NOTIF_KEY);
    const now = Date.now();
    if (raw) {
      const lastAt = Number(raw);
      if (!Number.isNaN(lastAt) && now - lastAt < GLOBAL_NOTIF_COOLDOWN_MS) return false;
    }
    await AsyncStorage.setItem(GLOBAL_NOTIF_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

// ── Location helpers ──────────────────────────────────────────────────────────

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Position check with GPS accuracy guard (fix #2).
 * Returns false when:
 *   - GPS accuracy is worse than MAX_ACCEPTABLE_ACCURACY_M, OR
 *   - calculated distance exceeds allowed distance for this store.
 */
async function isLikelyInsideStoreRegion(store: Store): Promise<boolean> {
  if (store.latitude == null || store.longitude == null) return true;

  const position = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 500 })
    .then((lastKnown) => lastKnown ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    .catch(() => null);

  if (!position) return true; // can't determine — allow

  const accuracy = position.coords.accuracy ?? 0;

  // Fix #2: reject when GPS accuracy is too poor to be reliable
  if (accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
    await geoLog(store.id, `ACCURACY_GUARD: ${accuracy.toFixed(0)}m > max ${MAX_ACCEPTABLE_ACCURACY_M}m — suppressing`);
    return false;
  }

  const distance = distanceMeters(
    position.coords.latitude,
    position.coords.longitude,
    store.latitude,
    store.longitude,
  );
  const allowed = Math.max(100, Math.min(store.radius_meters || 150, 500))
    + Math.max(accuracy, GEOFENCE_ACCURACY_BUFFER_M);

  await geoLog(store.id, `POSITION: dist=${distance.toFixed(0)}m allowed=${allowed.toFixed(0)}m acc=${accuracy.toFixed(0)}m`);
  return distance <= allowed;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

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
 * Fix #9: server-backed relevance check — no notification if no active shopping items
 * for this store.
 */
async function hasRelevantShoppingAtStore(store: Store): Promise<boolean> {
  const [{ data: entries, error: eErr }, { data: items, error: iErr }] = await Promise.all([
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

  if (eErr || iErr || !entries?.length) return false;

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  return entries.some((entry) => {
    if (!entry.source_item_id) return true;
    const src = itemMap.get(entry.source_item_id);
    if (!src) return true;
    return src.preferred_store_id == null || src.preferred_store_id === store.id;
  });
}

/**
 * Fix #7: find other stores belonging to the same household whose centroid
 * is within AMBIGUOUS_RADIUS_M of this store.
 */
async function findNearbyAmbiguousStoreIds(store: Store): Promise<string[]> {
  if (store.latitude == null || store.longitude == null) return [];

  const { data } = await supabase
    .from('stores')
    .select('id, latitude, longitude')
    .eq('household_id', store.household_id)
    .neq('id', store.id);

  if (!data) return [];

  return data
    .filter(
      (s) =>
        s.latitude != null
        && s.longitude != null
        && distanceMeters(store.latitude!, store.longitude!, s.latitude, s.longitude)
          <= AMBIGUOUS_RADIUS_M,
    )
    .map((s) => s.id as string);
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function scheduleLocalArrivalNotification(storeName: string, storeId?: string) {
  try {
    const raw = await AsyncStorage.getItem('pantrypal:settings:v1');
    if (raw) {
      const prefs = JSON.parse(raw)?.state;
      if (prefs?.notifArrivalSelf === false) return;
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

/** @deprecated Use scheduleLocalArrivalNotification */
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

// ── Core enter handler ────────────────────────────────────────────────────────

/**
 * Full guard stack — called from the background TaskManager task.
 *
 * Guards (in order):
 *   1. Per-store debounce          — 3 min same-store re-enter
 *   2. GPS accuracy guard          — reject > 200 m accuracy
 *   3. Stability window            — wait 25 s, re-check position (drive-by filter)
 *   4. Active-store lock           — don't hijack an active shopping session
 *   5. Pending receipt lock        — don't switch if receipt step is open
 *   6. Relevance check             — 0 relevant items → suppress notification
 *   7. Multi-store disambiguation  — 2+ stores within 300 m → let user pick
 *   8. Global notif cooldown       — no more than 1 notification per 5 min
 */
export async function handleStoreGeofenceEnter(storeId: string): Promise<void> {

  // Guard 1 — per-store debounce
  if (!(await shouldHandleGeofenceEnter(storeId))) {
    await geoLog(storeId, 'SUPPRESSED [G1]: within 3-min same-store debounce window');
    return;
  }

  const store = await fetchStoreById(storeId);
  if (!store) {
    await geoLog(storeId, 'SUPPRESSED: store not found in DB');
    return;
  }

  // Guard 2 — initial position + accuracy check
  if (!(await isLikelyInsideStoreRegion(store))) {
    await geoLog(storeId, 'SUPPRESSED [G2]: failed initial position/accuracy check');
    return;
  }

  // Guard 3 — stability window (drive-by filter)
  await geoLog(storeId, `STABILITY: waiting ${STABILITY_WINDOW_MS / 1000}s before confirming...`);
  await new Promise<void>((resolve) => setTimeout(resolve, STABILITY_WINDOW_MS));
  if (!(await isLikelyInsideStoreRegion(store))) {
    await geoLog(storeId, 'SUPPRESSED [G3]: drive-by — failed position re-check after stability window');
    return;
  }

  // Guards 4 & 5 — active store lock + pending receipt lock
  const {
    activeStoreId,
    pendingReceiptStoreId,
    receiptCompletedStoreIds,
    setAmbiguousArrivals,
  } = (await import('../store/stores')).useStoresStore.getState();

  if (activeStoreId && activeStoreId !== storeId) {
    await geoLog(storeId, `SUPPRESSED [G4]: active-store lock — already shopping at ${activeStoreId}`);
    return;
  }

  if (
    pendingReceiptStoreId
    && pendingReceiptStoreId !== storeId
    && !receiptCompletedStoreIds.includes(pendingReceiptStoreId)
  ) {
    await geoLog(storeId, `SUPPRESSED [G5]: pending receipt open for store ${pendingReceiptStoreId}`);
    return;
  }

  // Guard 6 — relevance check (fix #9)
  const relevant = await hasRelevantShoppingAtStore(store);
  if (!relevant) {
    await geoLog(storeId, 'SUPPRESSED [G6]: no relevant shopping items at this store');
    return;
  }

  // Guard 7 — multi-store disambiguation (fix #7)
  const nearbyIds = await findNearbyAmbiguousStoreIds(store);
  if (nearbyIds.length > 0) {
    await geoLog(storeId, `DISAMBIGUATION [G7]: ${nearbyIds.length} other store(s) within ${AMBIGUOUS_RADIUS_M}m — deferring to user`);
    setAmbiguousArrivals([storeId, ...nearbyIds]);
    return; // grocery screen shows "Where are you shopping?" sheet
  }

  // Guard 8 — global notification cooldown (fix #5)
  const canNotify = await shouldFireNotification();
  if (!canNotify) {
    await geoLog(storeId, 'SUPPRESSED [G8]: global notification cooldown (< 5 min since last notification)');
    // Suggest-only: do NOT auto-set the active store or auto-start shopping mode.
    // The user starts shopping by tapping the notification or the Start selector.
    return;
  }

  // ✅ All guards passed — geofence only SUGGESTS (fires a notification).
  // It must never auto-set activeStoreId / auto-enter shopping mode. The user
  // accepts the suggestion by tapping the notification, which routes via the
  // payload storeId in app/(main)/_layout.tsx and sets the active store there.
  await geoLog(storeId, 'CONFIRMED: all guards passed — firing suggestion notification + recording arrival');
  const arrivedBy = await getArrivalUserId();
  await Promise.all([
    scheduleLocalArrivalNotification(store.name, store.id),
    recordStoreArrival(store, arrivedBy),
  ]);
}
