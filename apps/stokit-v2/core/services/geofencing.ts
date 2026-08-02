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
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { notifyArrival, requestNotificationPermission, appendNotificationLog } from './notifications';
import type { PantryItem, Store } from '../../types';
import { loadDurable } from '../repositories/durableRepository';
import { arrivalItemNames, decideStoreArrival, geofenceableStores, isActivePantryItem, type StoreCandidate } from './geofencingLogic';

// ── Constants (match V1 values) ───────────────────────────────────────────────

export const GEOFENCE_TASK = 'STOKIT_V2_GEOFENCE';

/** Minimum time between arrival events for the same store (parking-lot GPS bounce). */
export const DEBOUNCE_MS = 3 * 60 * 1000;

/**
 * Geofence radius around each store in metres — this is BOTH the iOS region
 * size AND the "true arrival" wake-up distance. Kept at iOS's practical
 * reliability floor (~100m) so the Enter event represents arriving AT the
 * store (pulling into its lot), not merely nearing the shopping center.
 * Previously 200m, which fired a notification while still a considerable
 * distance away (field test, 2026-06-25).
 */
export const GEOFENCE_RADIUS_M = 100;

/**
 * Acceptance radius used by decideStoreArrival. Deliberately >= GEOFENCE_RADIUS_M
 * so an Enter event fired at the region boundary is never spuriously rejected as
 * out_of_radius from GPS jitter — the entry check returns early on out_of_radius
 * and iOS does NOT re-fire Enter as the user moves closer, so a too-tight
 * acceptance bound would silently drop a genuine arrival. The iOS region
 * (GEOFENCE_RADIUS_M) is the real true-arrival gate; this is a jitter buffer.
 */
export const ARRIVAL_RADIUS_M = 150;

/**
 * Confirmation delay before treating a geofence Enter as a real arrival (drive-by guard).
 * Kept short because this runs inside the iOS background geofence task callback,
 * which has a limited execution window — a long sleep risks the OS suspending the
 * task before it resolves, which would silently drop a genuine arrival.
 */
export const DWELL_CONFIRM_MS = 10 * 1000;

/**
 * Speed above which an arrival is rejected as a drive-by (metres per second).
 * 5 m/s ≈ 18 km/h — faster than parking/walking but slower than driving past.
 * iOS reports speed as -1 when unavailable; that case is treated as passing
 * (no rejection) so a missing speed fix never silently drops a real arrival.
 */
export const ARRIVAL_SPEED_THRESHOLD_MPS = 5;

/**
 * Maximum GPS horizontal accuracy (metres) accepted during dwell confirmation.
 * A fix worse than this is too imprecise to confidently confirm the user is
 * inside the store's lot rather than on a nearby road. Rejected to avoid false
 * positives when GPS is reflecting off buildings or sheltered in a parking structure.
 */
export const ARRIVAL_MAX_GPS_ACCURACY_M = 60;

/** Maximum geofences iOS supports. */
const MAX_GEOFENCES_IOS = 20;

const LAST_ENTER_KEY = 'stokit:v2:geofence:last-enter';
const DIAGNOSTICS_KEY = 'stokit:v2:geofence:diagnostics';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

export interface GeofenceStoreDiagnostic {
  id: string;
  name: string;
  considered: boolean;
  eligible: boolean;
  skippedReason: string | null;
  itemCount: number;
  latitude: number | null;
  longitude: number | null;
  radius: number;
  regionPayload: Location.LocationRegion | null;
  registrationStatus: string;
  lastRegisteredAt: number | null;
  lastEnterAt: number | null;
  lastExitAt: number | null;
  lastNotificationAt: number | null;
  lastNotificationResult: string | null;
  /** App state at the time the notification was scheduled. */
  lastNotificationAppState: string | null;
  /**
   * Timestamp (ms) when the per-store cooldown expires after the last
   * accepted arrival. null = no cooldown active.
   */
  cooldownEndsAt: number | null;
}

export interface GeofenceDiagnostics {
  /**
   * Live native state: Location.hasStartedGeofencingAsync() for the Stokit task.
   * NOT the user's setting — see storeArrivalPreferenceOn.
   */
  storeArrivalRemindersOn: boolean;
  /**
   * The user's persisted intent, which must survive the engine unregistering
   * regions for operational reasons (e.g. every assigned item was purchased, so
   * there is temporarily nothing to watch). Without this the toggle silently
   * flipped itself off whenever eligibility hit zero.
   */
  storeArrivalPreferenceOn: boolean;
  /** Native started state captured at the end of the last registration attempt. */
  nativeGeofencingStarted: boolean;
  foregroundPermission: PermissionStatus;
  backgroundPermission: PermissionStatus;
  notificationPermission: PermissionStatus;
  activeShoppingTrip: boolean;
  monitoredStoresCount: number;
  storesConsideredCount: number;
  eligibleStoresCount: number;
  skippedStores: GeofenceStoreDiagnostic[];
  lastRegistrationAttemptAt: number | null;
  startGeofencingCalled: boolean;
  regionsPassedCount: number;
  registrationResult: 'not_attempted' | 'skipped' | 'success' | 'failed';
  registrationError: string | null;
  registrationErrorStack: string | null;
  stores: GeofenceStoreDiagnostic[];
  lastError: string | null;
  updatedAt: number;
  // ── Per-arrival precision diagnostics ──────────────────────────────────
  /** The raw iOS region identifier that triggered the last Enter event. */
  lastEnteredRegionId: string | null;
  /** The store ID decideStoreArrival selected as the best match. */
  lastMatchedStoreId: string | null;
  lastMatchedStoreName: string | null;
  /** GPS distance to the matched store at the time of the dwell confirmation (metres). */
  lastMatchedDistanceM: number | null;
  /** All eligible stores within the geofence radius, sorted nearest-first. */
  lastNearbyCandidates: StoreCandidate[];
  /**
   * Human-readable outcome of the last ambiguity evaluation:
   *   'clear'     — one store clearly closest (gap ≥ AMBIGUITY_MARGIN_M)
   *   'ambiguous' — two+ stores too close to distinguish; notification suppressed
   *   'none'      — no candidates in radius
   */
  lastAmbiguityDecision: 'clear' | 'ambiguous' | 'none' | null;
  /** Store ID actually chosen for the notification (null if suppressed). */
  lastNotificationStoreId: string | null;
  lastNotificationStoreName: string | null;
  /**
   * True when the live-computed eligible store count no longer matches the
   * region count from the last actual native registration call — i.e. iOS may
   * still be monitoring a stale set of regions. Should normally be false;
   * refreshGeofencedStoreData() re-registers on every relevant item or store
   * mutation specifically to keep this from happening.
   */
  registrationOutOfDate: boolean;
  // ── Arrival confidence diagnostics ─────────────────────────────────────────
  /** GPS horizontal accuracy (metres) at the dwell-confirmation fix. null if no arrival yet. */
  lastDwellAccuracy: number | null;
  /** Movement speed (m/s) at the dwell-confirmation fix. -1 means iOS reported unavailable. null if no arrival yet. */
  lastDwellSpeed: number | null;
  /**
   * Why the arrival confidence check passed or failed:
   *   'passed'           — speed and accuracy both within thresholds
   *   'rejected_speed'   — moving too fast (drive-by)
   *   'rejected_accuracy'— GPS fix too imprecise to confirm location
   *   null               — no dwell confirmation attempted yet
   */
  lastConfidenceResult: 'passed' | 'rejected_speed' | 'rejected_accuracy' | null;
}

const emptyDiagnostics: GeofenceDiagnostics = {
  storeArrivalRemindersOn: false,
  storeArrivalPreferenceOn: false,
  nativeGeofencingStarted: false,
  foregroundPermission: 'unknown',
  backgroundPermission: 'unknown',
  notificationPermission: 'unknown',
  activeShoppingTrip: false,
  monitoredStoresCount: 0,
  storesConsideredCount: 0,
  eligibleStoresCount: 0,
  skippedStores: [],
  lastRegistrationAttemptAt: null,
  startGeofencingCalled: false,
  regionsPassedCount: 0,
  registrationResult: 'not_attempted',
  registrationError: null,
  registrationErrorStack: null,
  stores: [],
  lastError: null,
  updatedAt: 0,
  // Arrival precision
  lastEnteredRegionId: null,
  lastMatchedStoreId: null,
  lastMatchedStoreName: null,
  lastMatchedDistanceM: null,
  lastNearbyCandidates: [],
  lastAmbiguityDecision: null,
  lastNotificationStoreId: null,
  lastNotificationStoreName: null,
  registrationOutOfDate: false,
  lastDwellAccuracy: null,
  lastDwellSpeed: null,
  lastConfidenceResult: null,
};

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

function countAssignedItems(items: PantryItem[], storeId: string): number {
  return items.filter((item) =>
    item.storeId === storeId && isActivePantryItem(item)
  ).length;
}

function regionForStore(store: Store): Location.LocationRegion | null {
  if (!Number.isFinite(store.lat) || !Number.isFinite(store.lng)) return null;
  return {
    identifier: store.id,
    latitude: store.lat!,
    longitude: store.lng!,
    radius: GEOFENCE_RADIUS_M,
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

function skippedReasonForStore(store: Store, items: PantryItem[]): string | null {
  const hasAnyCoordinate = store.lat != null || store.lng != null;
  if (!hasAnyCoordinate) return 'no coordinates';
  if (!Number.isFinite(store.lat) || !Number.isFinite(store.lng)) return 'invalid lat/lng';
  if (countAssignedItems(items, store.id) === 0) return 'no assigned shopping-list items';
  return null;
}

function buildStoreDiagnostic(
  store: Store,
  items: PantryItem[],
  previous?: GeofenceStoreDiagnostic,
  running = false,
  lastArrivalAt: Record<string, number> = {},
): GeofenceStoreDiagnostic {
  const skippedReason = skippedReasonForStore(store, items);
  const regionPayload = regionForStore(store);
  const lastAcceptedArrival = lastArrivalAt[store.id] ?? null;
  const cooldownEndsAt = lastAcceptedArrival ? lastAcceptedArrival + DEBOUNCE_MS : null;
  return {
    id: store.id,
    name: store.name,
    considered: true,
    eligible: skippedReason === null,
    skippedReason,
    itemCount: countAssignedItems(items, store.id),
    latitude: Number.isFinite(store.lat) ? store.lat! : null,
    longitude: Number.isFinite(store.lng) ? store.lng! : null,
    radius: GEOFENCE_RADIUS_M,
    regionPayload,
    registrationStatus: running
      ? previous?.registrationStatus ?? 'registration attempted/succeeded'
      : 'not_running',
    lastRegisteredAt: previous?.lastRegisteredAt ?? null,
    lastEnterAt: previous?.lastEnterAt ?? null,
    lastExitAt: previous?.lastExitAt ?? null,
    lastNotificationAt: previous?.lastNotificationAt ?? null,
    lastNotificationResult: previous?.lastNotificationResult ?? null,
    lastNotificationAppState: previous?.lastNotificationAppState ?? null,
    cooldownEndsAt,
  };
}

function statusOf(value?: string): PermissionStatus {
  return value === 'granted' || value === 'denied' || value === 'undetermined' ? value : 'unknown';
}

async function readDiagnostics(): Promise<GeofenceDiagnostics> {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
    return raw ? { ...emptyDiagnostics, ...JSON.parse(raw) } : { ...emptyDiagnostics };
  } catch {
    return { ...emptyDiagnostics };
  }
}

async function writeDiagnostics(next: GeofenceDiagnostics): Promise<void> {
  await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify({ ...next, updatedAt: Date.now() }));
}

async function patchDiagnostics(
  patch: Partial<GeofenceDiagnostics> | ((current: GeofenceDiagnostics) => GeofenceDiagnostics),
): Promise<void> {
  const current = await readDiagnostics();
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
  await writeDiagnostics(next);
}

function buildRegisteredStoreDiagnostics(stores: Store[], items: PantryItem[], at: number): GeofenceStoreDiagnostic[] {
  return stores.map((store) => ({
    ...buildStoreDiagnostic(store, items, undefined, true),
    registrationStatus: 'registration attempted/succeeded',
    lastRegisteredAt: at,
  }));
}

export async function getGeofenceDiagnostics(
  stores: Store[],
  items: PantryItem[],
  activeShoppingTrip: boolean,
): Promise<GeofenceDiagnostics> {
  const current = await readDiagnostics();
  const [running, foreground, background, notifications, lastArrivalAt] = await Promise.all([
    isGeofencingRunning(),
    Location.getForegroundPermissionsAsync().catch(() => ({ status: 'unknown' })),
    Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'unknown' })),
    Notifications.getPermissionsAsync().catch(() => ({ status: 'unknown' })),
    readLastArrivalAt(),
  ]);
  const expectedIds = new Set(geofenceableStores(stores, Platform.OS === 'ios' ? MAX_GEOFENCES_IOS : 100, items).map((s) => s.id));
  const byId = new Map(current.stores.map((store) => [store.id, store]));
  const consideredStores = stores.map((store) => buildStoreDiagnostic(store, items, byId.get(store.id), running, lastArrivalAt));
  const diagnosticStores = stores
    .filter((store) => expectedIds.has(store.id))
    .map((store) => buildStoreDiagnostic(store, items, byId.get(store.id), running, lastArrivalAt));
  const permissionMissing =
    foreground.status !== 'granted' ||
    background.status !== 'granted' ||
    notifications.status !== 'granted';
  // NOTE: shopping-trip state is intentionally NOT a global skip reason.
  // decideStoreArrival()/defineGeofenceTask() never read trip state — an
  // inactive trip does not stop registration or arrival firing — so it must
  // never cause an already-registered, eligible store to be listed as
  // "not monitored". Trip state is surfaced separately as informational text
  // (see activeShoppingTrip on the returned object) instead.
  const globalSkipReason = !running
    ? 'reminders off'
    : permissionMissing
    ? 'permission missing'
    : null;
  // A store only counts as genuinely monitored when it passed the per-store
  // eligibility check AND made it past the MAX_GEOFENCES_IOS slice in
  // geofenceableStores() AND nothing globally prevents registration.
  const skippedStores = consideredStores
    .filter((store) => !(store.eligible && expectedIds.has(store.id)) || globalSkipReason)
    .map((store) => {
      if (!store.eligible) return store; // keep its real per-store reason (no coordinates, invalid lat/lng, no assigned shopping-list items)
      if (globalSkipReason) return { ...store, skippedReason: globalSkipReason };
      if (!expectedIds.has(store.id)) return { ...store, skippedReason: 'over iOS region monitoring limit' };
      return store;
    });
  const registrationSucceeded = current.registrationResult === 'success';
  // The last successful native registration registered current.regionsPassedCount
  // regions. If the live eligible count has since drifted away from that (an
  // item/store mutation changed eligibility but refreshGeofencedStoreData()
  // hasn't caught up yet, e.g. mid-flight), iOS may still be watching a stale
  // region set.
  const registrationOutOfDate =
    running && registrationSucceeded && diagnosticStores.length !== current.regionsPassedCount;

  return {
    ...current,
    storeArrivalRemindersOn: running,
    // Native state is the truth for "is it working"; the stored preference is
    // the truth for "did the user ask for it". They differ legitimately while
    // nothing is eligible to monitor (see the no_stores path in startGeofencing).
    storeArrivalPreferenceOn: current.storeArrivalPreferenceOn,
    nativeGeofencingStarted: running,
    foregroundPermission: statusOf(foreground.status),
    backgroundPermission: statusOf(background.status),
    notificationPermission: statusOf(notifications.status),
    activeShoppingTrip,
    monitoredStoresCount: running ? diagnosticStores.length : 0,
    storesConsideredCount: stores.length,
    eligibleStoresCount: diagnosticStores.length,
    skippedStores,
    stores: diagnosticStores,
    registrationOutOfDate,
    lastError: running && registrationSucceeded ? null : current.lastError,
    updatedAt: Date.now(),
  };
}

async function markStoreEvent(storeId: string, patch: Partial<GeofenceStoreDiagnostic>): Promise<void> {
  await patchDiagnostics((current) => ({
    ...current,
    stores: current.stores.map((store) => store.id === storeId ? { ...store, ...patch } : store),
  }));
}

/**
 * Clear the per-store arrival cooldown timestamps.
 * Use this in testing to allow a second notification without waiting 3 minutes.
 * Safe to call at any time — does not stop or restart geofencing.
 */
export async function clearArrivalCooldown(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_ENTER_KEY);
  } catch {
    // Non-fatal
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
    if (error) {
      await patchDiagnostics({ lastError: `task:${error.message ?? String(error)}` });
      return;
    }
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: { identifier: string };
    };
    const storeId = region?.identifier;
    if (!storeId) return;
    const now = Date.now();
    if (eventType === Location.GeofencingEventType.Exit) {
      await markStoreEvent(storeId, { lastExitAt: now });
      return;
    }
    if (eventType !== Location.GeofencingEventType.Enter) return;

    // Record the raw iOS region that woke us up.
    await markStoreEvent(storeId, { lastEnterAt: now });
    await patchDiagnostics({ lastEnteredRegionId: storeId });

    // Load durable state once — used by both the arrival decision and the notification
    const durable = await loadDurable();
    const items = durable?.items ?? getItems();
    const stores = durable?.stores ?? getStores();
    const lastArrivalAt = await readLastArrivalAt();

    // Region identifier is only a wake-up signal — decideStoreArrival is the single
    // source of truth for which store (if any) wins, using a fresh GPS fix.
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const initial = decideStoreArrival({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        stores,
        items,
        radiusMetres: ARRIVAL_RADIUS_M,
        cooldownMs: DEBOUNCE_MS,
        lastArrivalAt,
      });
      await patchDiagnostics({
        lastMatchedStoreId: initial.storeId ?? null,
        lastMatchedStoreName: initial.storeName ?? null,
        lastMatchedDistanceM: initial.distanceMetres ?? null,
        lastNearbyCandidates: initial.nearbyCandidates,
        lastAmbiguityDecision: initial.ambiguous ? 'ambiguous'
          : initial.nearbyCandidates.length === 0 ? 'none'
          : 'clear',
      });
      if (!initial.accepted) {
        if (initial.reason === 'ambiguous_nearby_store') {
          await appendNotificationLog(
            'schedule_error',
            `ambiguous_nearby_store: entered=${storeId} nearest=${initial.storeName ?? '?'} ` +
            `(${(initial.distanceMetres ?? 0).toFixed(0)}m) ` +
            `candidates=${initial.nearbyCandidates.map((c) => `${c.storeName}:${c.distanceMetres.toFixed(0)}m`).join(', ')}`,
          );
        }
        await patchDiagnostics({ lastError: `enter_rejected:${initial.reason ?? 'unknown'}` });
        return;
      }
    } catch (err) {
      await patchDiagnostics({ lastError: `enter_location:${err instanceof Error ? err.message : String(err)}` });
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

      // Arrival confidence checks — reject drive-bys before deciding store.
      const dwellSpeed = confirmPos.coords.speed ?? -1;
      const dwellAccuracy = confirmPos.coords.accuracy ?? 999;
      if (dwellAccuracy > ARRIVAL_MAX_GPS_ACCURACY_M) {
        await patchDiagnostics({
          lastDwellAccuracy: dwellAccuracy,
          lastDwellSpeed: dwellSpeed,
          lastConfidenceResult: 'rejected_accuracy',
          lastError: `confidence:gps_accuracy_${dwellAccuracy.toFixed(0)}m`,
        });
        return;
      }
      if (dwellSpeed >= 0 && dwellSpeed > ARRIVAL_SPEED_THRESHOLD_MPS) {
        await patchDiagnostics({
          lastDwellAccuracy: dwellAccuracy,
          lastDwellSpeed: dwellSpeed,
          lastConfidenceResult: 'rejected_speed',
          lastError: `confidence:speed_${dwellSpeed.toFixed(1)}mps`,
        });
        return;
      }
      await patchDiagnostics({
        lastDwellAccuracy: dwellAccuracy,
        lastDwellSpeed: dwellSpeed,
        lastConfidenceResult: 'passed',
      });

      decision = decideStoreArrival({
        lat: confirmPos.coords.latitude,
        lng: confirmPos.coords.longitude,
        stores,
        items,
        radiusMetres: ARRIVAL_RADIUS_M,
        cooldownMs: DEBOUNCE_MS,
        lastArrivalAt,
      });
      // Update diagnostics with the dwell-confirmed decision (more accurate GPS fix).
      await patchDiagnostics({
        lastMatchedStoreId: decision.storeId ?? null,
        lastMatchedStoreName: decision.storeName ?? null,
        lastMatchedDistanceM: decision.distanceMetres ?? null,
        lastNearbyCandidates: decision.nearbyCandidates,
        lastAmbiguityDecision: decision.ambiguous ? 'ambiguous'
          : decision.nearbyCandidates.length === 0 ? 'none'
          : 'clear',
      });
    } catch (err) {
      await patchDiagnostics({ lastError: `dwell_location:${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    if (!decision.accepted || !decision.storeId) {
      if (decision.reason === 'ambiguous_nearby_store') {
        await appendNotificationLog(
          'schedule_error',
          `ambiguous_nearby_store (dwell): entered=${storeId} nearest=${decision.storeName ?? '?'} ` +
          `(${(decision.distanceMetres ?? 0).toFixed(0)}m) ` +
          `candidates=${decision.nearbyCandidates.map((c) => `${c.storeName}:${c.distanceMetres.toFixed(0)}m`).join(', ')}`,
        );
      }
      await patchDiagnostics({ lastError: `dwell_rejected:${decision.reason ?? 'unknown'}` });
      return;
    }

    // Cooldown is written only now, after the arrival is fully accepted — a failed
    // dwell re-check or a notification error above never blocks a real future arrival.
    await writeLastArrivalAt(decision.storeId, Date.now());

    const store = stores.find((s) => s.id === decision.storeId);
    if (!store) return;
    const activeItemNames = arrivalItemNames(items, decision.storeId);
    const activeItemCount = activeItemNames.length;
    try {
      const result = await notifyArrival(store.name, activeItemCount, 'geofence', {
        storeId: decision.storeId,
        itemNames: activeItemNames,
      });
      await patchDiagnostics({
        lastNotificationStoreId: decision.storeId,
        lastNotificationStoreName: store.name,
      });
      await markStoreEvent(decision.storeId, {
        lastNotificationAt: Date.now(),
        lastNotificationResult: result.result,
        lastNotificationAppState: 'background',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendNotificationLog('schedule_error', `geofence task exception: ${message}`);
      await markStoreEvent(decision.storeId, {
        lastNotificationAt: Date.now(),
        lastNotificationResult: `failed:${message}`,
        lastNotificationAppState: 'background',
      });
      await patchDiagnostics({ lastError: `notification:${message}` });
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
): Promise<'ok' | 'no_permission' | 'no_notification_permission' | 'no_stores' | 'expo_go' | 'registration_failed'> {
  if (isExpoGo()) {
    await patchDiagnostics({
      storeArrivalRemindersOn: false,
      lastRegistrationAttemptAt: Date.now(),
      storesConsideredCount: stores.length,
      eligibleStoresCount: 0,
      startGeofencingCalled: false,
      regionsPassedCount: 0,
      registrationResult: 'skipped',
      registrationError: 'expo_go',
      registrationErrorStack: null,
      lastError: 'expo_go',
    });
    return 'expo_go';
  }

  const at = Date.now();
  const consideredStores = stores.map((store) => buildStoreDiagnostic(store, items));
  const skippedStores = consideredStores.filter((store) => !store.eligible);
  const geofenceable = geofenceableStores(
    stores,
    Platform.OS === 'ios' ? MAX_GEOFENCES_IOS : 100,
    items,
  );
  if (geofenceable.length === 0) {
    // DEFECT A FIX: this branch used to return without touching iOS, leaving the
    // previous registration live while diagnostics reported zero monitored
    // stores. After the last assigned item was purchased, iOS kept watching
    // stale regions and native state silently diverged from reported state.
    // Tear the registration down so "no stores" is true natively too. The user's
    // preference is untouched, so the toggle stays on and the existing refresh
    // path (refreshGeofencedStoreData, called from every item/store mutation)
    // re-registers as soon as a store becomes eligible again.
    let removalError: string | null = null;
    try {
      if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
      }
    } catch (err) {
      removalError = err instanceof Error ? err.message : String(err);
    }
    await patchDiagnostics({
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: 0,
      skippedStores,
      startGeofencingCalled: false,
      regionsPassedCount: 0,
      registrationResult: 'skipped',
      registrationError: 'no_assigned_coordinate_stores',
      registrationErrorStack: null,
      monitoredStoresCount: 0,
      nativeGeofencingStarted: false,
      stores: [],
      lastError: removalError
        ? `removal:${removalError}`
        : 'no_assigned_coordinate_stores',
    });
    return 'no_stores';
  }

  if (!(await requestNotificationPermission())) {
    await patchDiagnostics({
      notificationPermission: 'denied',
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: false,
      regionsPassedCount: 0,
      registrationResult: 'skipped',
      registrationError: 'permission missing: notifications',
      registrationErrorStack: null,
      lastError: 'no_notification_permission',
    });
    return 'no_notification_permission';
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') {
    await patchDiagnostics({
      foregroundPermission: statusOf(fg),
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: false,
      regionsPassedCount: 0,
      registrationResult: 'skipped',
      registrationError: 'permission missing: foreground location',
      registrationErrorStack: null,
      lastError: 'no_foreground_permission',
    });
    return 'no_permission';
  }

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') {
    await patchDiagnostics({
      backgroundPermission: statusOf(bg),
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: false,
      regionsPassedCount: 0,
      registrationResult: 'skipped',
      registrationError: 'permission missing: background location',
      registrationErrorStack: null,
      lastError: 'no_background_permission',
    });
    return 'no_permission';
  }

  const regions: Location.LocationRegion[] = geofenceable.flatMap((store) => {
    const region = regionForStore(store);
    return region ? [region] : [];
  });

  try {
    await patchDiagnostics({
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: true,
      regionsPassedCount: regions.length,
      registrationResult: 'not_attempted',
      registrationError: null,
      registrationErrorStack: null,
      stores: buildRegisteredStoreDiagnostics(geofenceable, items, at),
    });
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);

    // DEFECT B FIX: startGeofencingAsync resolving only means iOS accepted the
    // call, not that monitoring is live. Success used to be recorded here
    // unconditionally, so a rejected registration still displayed as active.
    // Ask the platform what actually happened before claiming anything.
    const nativeStarted = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);

    if (!nativeStarted) {
      await patchDiagnostics({
        storeArrivalRemindersOn: false,
        nativeGeofencingStarted: false,
        foregroundPermission: statusOf(fg),
        backgroundPermission: statusOf(bg),
        notificationPermission: 'granted',
        monitoredStoresCount: 0,
        stores: [],
        lastRegistrationAttemptAt: at,
        storesConsideredCount: stores.length,
        eligibleStoresCount: geofenceable.length,
        skippedStores,
        startGeofencingCalled: true,
        regionsPassedCount: regions.length,
        registrationResult: 'failed',
        registrationError: 'native_not_started',
        registrationErrorStack: null,
        lastError: 'registration:native_not_started',
      });
      return 'registration_failed';
    }

    await patchDiagnostics({
      storeArrivalRemindersOn: true,
      storeArrivalPreferenceOn: true,
      nativeGeofencingStarted: true,
      foregroundPermission: statusOf(fg),
      backgroundPermission: statusOf(bg),
      notificationPermission: 'granted',
      monitoredStoresCount: geofenceable.length,
      stores: buildRegisteredStoreDiagnostics(geofenceable, items, at),
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: true,
      regionsPassedCount: regions.length,
      registrationResult: 'success',
      registrationError: null,
      registrationErrorStack: null,
      lastError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchDiagnostics({
      storeArrivalRemindersOn: false,
      lastRegistrationAttemptAt: at,
      storesConsideredCount: stores.length,
      eligibleStoresCount: geofenceable.length,
      skippedStores,
      startGeofencingCalled: true,
      regionsPassedCount: regions.length,
      registrationResult: 'failed',
      registrationError: message,
      registrationErrorStack: err instanceof Error ? err.stack ?? null : null,
      lastError: `registration:${message}`,
    });
    throw err;
  }
  return 'ok';
}

/** Stop background geofencing and remove all regions. */
export async function stopGeofencing(): Promise<void> {
  try {
    const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    // Every caller is an explicit user action (toggle off, sign-out, account
    // deletion, privacy reset), so the stored intent goes off with the regions.
    await patchDiagnostics({
      storeArrivalRemindersOn: false,
      storeArrivalPreferenceOn: false,
      nativeGeofencingStarted: false,
      monitoredStoresCount: 0,
      stores: [],
    });
  } catch (err) {
    await patchDiagnostics({ lastError: `removal:${err instanceof Error ? err.message : String(err)}` });
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
