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
import { arrivalItemCount, geofenceableStores, isNearestStore } from './geofencingLogic';

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

    // Load durable state once — used by both nearest-store check and notification
    const durable = await loadDurable();
    const items = durable?.items ?? getItems();
    const stores = durable?.stores ?? getStores();

    // Nearest-store verification — reject bleed from adjacent stores (e.g. Walmart vs Sam's Club).
    // Get a fresh GPS fix and confirm this store is physically the closest geofenceable store.
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isNearestStore(storeId, stores, pos.coords.latitude, pos.coords.longitude)) {
        return; // physically closer to a different store — abort
      }
    } catch {
      // Location unavailable — proceed without verification rather than silently dropping
    }

    // Debounce — ignore re-enters within 3 min
    try {
      const raw = await AsyncStorage.getItem(LAST_ENTER_KEY);
      const record: Record<string, number> = raw ? JSON.parse(raw) : {};
      const last = record[storeId] ?? 0;
      if (Date.now() - last < DEBOUNCE_MS) return;
      record[storeId] = Date.now();
      await AsyncStorage.setItem(LAST_ENTER_KEY, JSON.stringify(record));
    } catch {
      // Non-fatal — continue
    }

    // Dwell confirmation — ignore quick drive-bys. Wait, then re-check that this
    // store is still the closest before treating the Enter as a real arrival.
    await new Promise((resolve) => setTimeout(resolve, DWELL_CONFIRM_MS));
    // Unlike the entry check above (which fails open on GPS error), this dwell
    // re-check fails closed — an uncertain location here aborts the arrival.
    try {
      const confirmPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (
        !isNearestStore(storeId, stores, confirmPos.coords.latitude, confirmPos.coords.longitude)
      ) {
        return; // user moved away from this store during the confirmation window — abort
      }
    } catch {
      // Confirmation GPS read failed — abort rather than notify on uncertain location
      return;
    }

    // Count low items at this store
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    const lowCount = arrivalItemCount(items, storeId);
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
            store_id: storeId,
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
): Promise<'ok' | 'no_permission' | 'no_notification_permission' | 'no_stores' | 'expo_go'> {
  if (isExpoGo()) return 'expo_go';

  const geofenceable = geofenceableStores(
    stores,
    Platform.OS === 'ios' ? MAX_GEOFENCES_IOS : 100,
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
