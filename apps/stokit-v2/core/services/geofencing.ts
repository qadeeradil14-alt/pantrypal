/**
 * Stokit V2 — Geofencing service.
 *
 * An opt-in background feature (off by default) that fires a gentle
 * notification when the user arrives at a store where they have low items.
 *
 * Architecture (mirrors V1):
 *   - `defineGeofenceTask()` must be called at module level before any render.
 *   - `startGeofencing(stores, items)` starts the background task.
 *   - `stopGeofencing()` removes all regions.
 *
 * Limitations in Expo Go (development):
 *   Background geofencing requires a native build (EAS Build or expo run:ios).
 *   In Expo Go the foreground permission flow works but the background task
 *   will not fire when the app is closed. Use `isExpoGo()` to show a note.
 *
 * Production checklist:
 *   - Enable "Background Modes > Location updates" in Xcode capabilities.
 *   - Request always-on location permission (requestBackgroundPermissionsAsync).
 *   - Add NSLocationAlwaysAndWhenInUseUsageDescription to app.json.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { notifyArrival, requestNotificationPermission } from './notifications';
import type { PantryItem, Store } from '../../types';
import { loadDurable } from '../repositories/durableRepository';
import { arrivalItemCount, decideStoreArrival, geofenceableStores } from './geofencingLogic';

// ── Constants (match V1 values) ───────────────────────────────────────────────

export const GEOFENCE_TASK = 'STOKIT_V2_GEOFENCE';

/** Minimum time between arrival events for the same store (parking-lot GPS bounce). */
export const DEBOUNCE_MS = 3 * 60 * 1000;

/** Geofence radius around each store in metres. */
export const GEOFENCE_RADIUS_M = 150;

/**
 * Confirmation delay before treating a geofence Enter as a real arrival (drive-by guard).
 * Kept short because this runs inside the iOS background geofence task callback,
 * which has a limited execution window — a long sleep risks the OS suspending the
 * task before it resolves, which would silently drop a genuine arrival.
 */
export const DWELL_CONFIRM_MS = 10 * 1000;

/** Maximum geofences iOS supports. */
const MAX_GEOFENCES_IOS = 20;

const LAST_ENTER_KEY = 'stokit:v2:geofence:last-enter';

/** storeId -> ms timestamp of the last accepted arrival. */
async function readLastArrivalAt(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ENTER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeLastArrivalAt(storeId: string, at: number): Promise<void> {
  try {
    const record = await readLastArrivalAt();
    record[storeId] = at;
    await AsyncStorage.setItem(LAST_ENTER_KEY, JSON.stringify(record));
  } catch {
    // Non-fatal — a missed cooldown write just means the next debounce window resets
  }
}

// ── Expo Go detection ─────────────────────────────────────────────────────────

/** True when running inside the Expo Go client (not a standalone build). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

// ── Task definition (call at module level) ────────────────────────────────────

/**
 * Must be called before any render, at the top level of a module.
 * Safe to call multiple times — skips if already defined.
 */
export function defineGeofenceTask(
  getItems: () => PantryItem[],
  getStores: () => Store[],
): void {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK)) return;

  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
    if (error) return;
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: { identifier: string };
    };
    if (eventType !== Location.GeofencingEventType.Enter) return;
    const storeId = region?.identifier;
    if (!storeId) return;

    // Load durable state once — used by both the arrival decision and the notification
    const durable = await loadDurable();
    const items = durable?.items ?? getItems();
    const stores = durable?.stores ?? getStores();
    const lastArrivalAt = await readLastArrivalAt();

    // Region identifier is only a wake-up signal here — decideStoreArrival is the single
    // source of truth for which store (if any) actually wins, using a fresh GPS fix to
    // confirm assignment, radius, and cooldown rather than trusting the region alone.
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const initial = decideStoreArrival({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        stores,
        items,
        radiusMetres: GEOFENCE_RADIUS_M,
        cooldownMs: DEBOUNCE_MS,
        lastArrivalAt,
      });
      if (!initial.accepted) return;
    } catch {
      // Location unavailable — proceed without verification rather than silently dropping
    }

    // Dwell confirmation — ignore quick drive-bys. Wait, then re-run the decision so a
    // store the user only drove past doesn't get treated as a real arrival.
    await new Promise((resolve) => setTimeout(resolve, DWELL_CONFIRM_MS));

    let decision;
    try {
      // Unlike the entry check above (which fails open on GPS error), this dwell
      // re-check fails closed — an uncertain location here aborts the arrival.
      const confirmPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      decision = decideStoreArrival({
        lat: confirmPos.coords.latitude,
        lng: confirmPos.coords.longitude,
        stores,
        items,
        radiusMetres: GEOFENCE_RADIUS_M,
        cooldownMs: DEBOUNCE_MS,
        lastArrivalAt,
      });
    } catch {
      return;
    }

    if (!decision.accepted || !decision.storeId) return;

    // Cooldown is written only now, after the arrival is fully accepted — a failed
    // dwell re-check or a notification error above never blocks a real future arrival.
    await writeLastArrivalAt(decision.storeId, Date.now());

    const store = stores.find((s) => s.id === decision.storeId);
    if (!store) return;
    const lowCount = arrivalItemCount(items, decision.storeId);
    await notifyArrival(store.name, lowCount);

    // Insert store_arrivals row — DB trigger pushes notification to other household members
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const householdRaw = await AsyncStorage.getItem('stokit:v2:household');
        if (householdRaw) {
          const parsed = JSON.parse(householdRaw) as {
            household: { id: string };
            members: Array<{ isMe: boolean; displayName: string }>;
          };
          const me = parsed.members?.find((m) => m.isMe);
          await supabase.from('store_arrivals').insert({
            household_id: parsed.household.id,
            store_id: decision.storeId,
            arrived_by: user.id,
            arrived_by_name: me?.displayName ?? null,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  });
}

// ── Start / stop ──────────────────────────────────────────────────────────────

/**
 * Start geofencing. Only registers stores that have GPS coordinates (placeId is
 * not required — lat/lng is enough). Silently caps at 20 regions on iOS.
 *
 * Returns 'ok' | 'no_permission' | 'no_notification_permission' | 'no_stores' | 'expo_go'.
 */
export async function startGeofencing(
  stores: Store[],
  items: PantryItem[] = [],
): Promise<'ok' | 'no_permission' | 'no_notification_permission' | 'no_stores' | 'expo_go'> {
  if (isExpoGo()) return 'expo_go';

  const geofenceable = geofenceableStores(
    stores,
    Platform.OS === 'ios' ? MAX_GEOFENCES_IOS : 100,
    items,
  );
  if (geofenceable.length === 0) return 'no_stores';

  if (!(await requestNotificationPermission())) return 'no_notification_permission';

  // Request foreground first (required before background on iOS)
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return 'no_permission';

  // Background permission for when app is closed
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return 'no_permission';

  const regions: Location.LocationRegion[] = geofenceable.map((s) => ({
      identifier: s.id,
      latitude: s.lat!,
      longitude: s.lng!,
      radius: GEOFENCE_RADIUS_M,
      notifyOnEnter: true,
      notifyOnExit: false,
    }));

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  return 'ok';
}

/** Stop background geofencing and remove all regions. */
export async function stopGeofencing(): Promise<void> {
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch {
    // Not running — ignore
  }
}

/** Whether geofencing is currently active. */
export async function isGeofencingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}
