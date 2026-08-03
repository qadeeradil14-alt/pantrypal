import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  arrivalItemCount,
  arrivalItemNames,
  arrivalSampleOffsetsMs,
  createSingleFlight,
  decideStoreArrival,
  evaluateArrivalSample,
  geofenceableStores,
  regionFingerprint,
  seedExitStateFromDiagnostics,
  shouldContinueArrivalSampling,
  haversineMetres,
  AMBIGUITY_MARGIN_M,
  type StoreCandidate,
} from '../core/services/geofencingLogic';
import type { PantryItem, Store } from '../types';

// Constants are read from source rather than imported: importing geofencing.ts
// pulls in expo-location/expo-task-manager, which cannot load under Node. This
// still binds the assertions to the real values, so drift is caught.
const geofencingSource = readFileSync(
  new URL('../core/services/geofencing.ts', import.meta.url), 'utf8',
);
function numericConstant(name: string): number {
  const match = geofencingSource.match(
    new RegExp(`export const ${name} = ([0-9*\\s]+);`),
  );
  assert.ok(match, `${name} must be defined in geofencing.ts`);
  // Values are written as arithmetic (e.g. "6 * 1000"); evaluate that safely.
  return match[1].split('*').map((part) => Number(part.trim())).reduce((a, b) => a * b, 1);
}
const DWELL_CONFIRM_MS = numericConstant('DWELL_CONFIRM_MS');
const ARRIVAL_RETRY_MAX_ATTEMPTS = numericConstant('ARRIVAL_RETRY_MAX_ATTEMPTS');
const ARRIVAL_RETRY_INTERVAL_MS = numericConstant('ARRIVAL_RETRY_INTERVAL_MS');
const ARRIVAL_RETRY_BUDGET_MS = numericConstant('ARRIVAL_RETRY_BUDGET_MS');

const NYC = { lat: 40.7128, lng: -74.006 };
/** ~50m north of NYC — well within a 150m radius. */
const NYC_NEAR = { lat: 40.71325, lng: -74.006 };
/** ~50km away — well outside any geofence radius. */
const NYC_FAR = { lat: 41.16, lng: -74.006 };

const store = (id: string, lat?: number, lng?: number): Store => ({
  id,
  name: id,
  lat,
  lng,
  createdAt: 1,
  updatedAt: 1,
});

const item = (storeId: string, status: PantryItem['status']): PantryItem => ({
  id: `${storeId}-${status}`,
  name: status,
  quantity: 1,
  unit: 'unit',
  status,
  storageLocation: 'pantry',
  storeId,
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
});

test('geofencing only registers coordinate-backed stores and respects platform limits', () => {
  const stores = [store('zero', 0, 0), store('missing', 1), store('two', 2, 2)];
  const items = [item('zero', 'low'), item('two', 'expiring'), item('missing', 'low')];
  assert.deepEqual(geofenceableStores(stores, 1, items).map(({ id }) => id), ['zero']);
});

test('geofencing registers assigned coordinate-backed stores only', () => {
  const stores = [store('first', 1, 1), store('second', 2, 2), store('walmart', 3, 3)];
  const items = [item('walmart', 'low')];

  assert.deepEqual(
    geofenceableStores(stores, 2, items).map(({ id }) => id),
    ['walmart'],
  );
});

test('geofencing rejects invalid coordinates', () => {
  const stores = [store('good', 1, 1), store('bad', Number.NaN, 3)];
  const items = [item('good', 'low'), item('bad', 'low')];

  assert.deepEqual(geofenceableStores(stores, 20, items).map(({ id }) => id), ['good']);
});

test('arrival reminders count every active (non-purchased) assigned item for the entered store', () => {
  const items = [
    item('aldi', 'low'),
    item('aldi', 'expiring'),
    item('aldi', 'stocked'),    // stocked pantry item — excluded from shopping alerts
    item('aldi', 'purchased'),  // picked up — must NOT count
    item('other', 'low'),
  ];
  // low + expiring = 2; stocked/purchased excluded; 'other' store excluded.
  assert.equal(arrivalItemCount(items, 'aldi'), 2);
});

// ── Eligibility: shopping-list items only ─────────────────────────────────────
// Product rule: geofencing mirrors Shopping. A store is eligible for arrival
// reminders when it has GPS coordinates AND at least one assigned low/expiring
// item. Stocked pantry items must not trigger arrival alerts.

test('a normal (stocked) assigned item does NOT make a GPS store eligible', () => {
  const stores = [store('seven-eleven', 1, 1)];
  const items = [item('seven-eleven', 'stocked')];
  assert.equal(geofenceableStores(stores, 20, items).length, 0);
});

test('a low assigned item makes a GPS store eligible', () => {
  const stores = [store('aldi', 1, 1)];
  const items = [item('aldi', 'low')];
  assert.deepEqual(geofenceableStores(stores, 20, items).map(({ id }) => id), ['aldi']);
});

test('an expiring assigned item makes a GPS store eligible', () => {
  const stores = [store('kroger', 1, 1)];
  const items = [item('kroger', 'expiring')];
  assert.deepEqual(geofenceableStores(stores, 20, items).map(({ id }) => id), ['kroger']);
});

test('a purchased (completed/picked-up) item does NOT make a store eligible', () => {
  const stores = [store('target', 1, 1)];
  const items = [item('target', 'purchased')];
  assert.equal(
    geofenceableStores(stores, 20, items).length,
    0,
    'A picked-up item must not keep its store eligible',
  );
});

test('a GPS store with no assigned shopping-list items is ignored', () => {
  const stores = [store('costco', 1, 1)];
  const items: PantryItem[] = []; // coordinates present, but nothing assigned to it
  assert.equal(
    geofenceableStores(stores, 20, items).length,
    0,
    'A store with coordinates but no assigned shopping-list items must never be registered',
  );
});

test('decideStoreArrival accepts an assigned store within radius', () => {
  const stores = [store('walmart', NYC.lat, NYC.lng)];
  const items = [item('walmart', 'low')];

  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores,
    items,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.storeId, 'walmart');
});

test('decideStoreArrival rejects an assigned store outside radius', () => {
  const stores = [store('walmart', NYC.lat, NYC.lng)];
  const items = [item('walmart', 'low')];

  const decision = decideStoreArrival({
    lat: NYC_FAR.lat,
    lng: NYC_FAR.lng,
    stores,
    items,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'out_of_radius');
});

test('decideStoreArrival rejects a store whose only assigned item is purchased', () => {
  const stores = [store('walmart', NYC.lat, NYC.lng)];
  const items = [item('walmart', 'purchased')];

  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores,
    items,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'no_assigned_items');
});

test('decideStoreArrival cooldown blocks a duplicate arrival for the same store', () => {
  const stores = [store('walmart', NYC.lat, NYC.lng)];
  const items = [item('walmart', 'low')];
  const now = 1_000_000;

  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores,
    items,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: { walmart: now - 1_000 },
    // A valid exit AFTER the last arrival, so this isolates the cooldown rather
    // than tripping the exit gate first.
    lastExitAt: { walmart: now - 500 },
    now,
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'cooldown');
});

test('decideStoreArrival picks the nearest eligible assigned store over a farther one', () => {
  const stores = [
    store('far-assigned', NYC_FAR.lat, NYC_FAR.lng),
    store('near-assigned', NYC.lat, NYC.lng),
    store('nearest-unassigned', NYC_NEAR.lat, NYC_NEAR.lng),
  ];
  const items = [item('far-assigned', 'low'), item('near-assigned', 'expiring')];

  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores,
    items,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.storeId, 'near-assigned');
});

test('native config enables background location and notification permissions', () => {
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  const locationPlugin = app.plugins.find((plugin: unknown) =>
    Array.isArray(plugin) && plugin[0] === 'expo-location',
  );

  assert.equal(locationPlugin[1].isIosBackgroundLocationEnabled, true);
  assert.equal(locationPlugin[1].isAndroidBackgroundLocationEnabled, true);
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(app.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription);
});

test('geofence task is defined at module scope and permission is requested before registration', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');

  assert.match(layout, /defineGeofenceTask\(/);
  assert.ok(service.indexOf('requestNotificationPermission()') < service.indexOf('startGeofencingAsync'));
});

test('shopping start re-registers geofences when reminders are already running', () => {
  const screen = readFileSync(new URL('../app/(tabs)/shopping.tsx', import.meta.url), 'utf8');

  assert.match(screen, /isGeofencingRunning\(\)/);
  assert.match(screen, /startGeofencing\(stores, items\)/);
  assert.doesNotMatch(screen, /const nextItems = items\.map/);
});

// ── Item-level mutations must re-register geofences ───────────────────────────
// Eligibility (geofenceableStores) is driven by `items`, not just `stores`, so
// every item mutation that can change which store is eligible must trigger the
// same refreshGeofencedStoreData() path already used by addStore/updateStore/
// deleteStore — not a second registration system.

test('addItem triggers a geofence refresh on both the merge path and the create path', () => {
  const store = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  // Anchor on the *implementation* signature (no type annotations) — the
  // interface declaration earlier in the file uses a different signature
  // shape ("addItem: (input: {"), so this won't accidentally match that.
  const addItemBody = store.slice(store.indexOf('addItem: (input, options) => {'), store.indexOf('updateItem: (id, patch) => {'));

  // Two return points inside addItem: merging into an existing item, and
  // creating a brand new one. Both can change storeId/status and must refresh.
  const refreshCount = addItemBody.split('void refreshGeofencedStoreData();').length - 1;
  assert.ok(refreshCount >= 2, `addItem must call refreshGeofencedStoreData() on both return paths, found ${refreshCount}`);
});

test('updateItem triggers a geofence refresh (covers storeId assignment and any patch)', () => {
  const store = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const updateItemBody = store.slice(store.indexOf('updateItem: (id, patch) => {'), store.indexOf('setItemStatus: (id, status) => {'));

  assert.match(
    updateItemBody,
    /void refreshGeofencedStoreData\(\);/,
    'updateItem must call refreshGeofencedStoreData() — patch may set storeId or status',
  );
});

test('setItemStatus triggers a geofence refresh (covers purchased/restored transitions)', () => {
  const store = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const setStatusBody = store.slice(store.indexOf('setItemStatus: (id, status) => {'), store.indexOf('deleteItem: (id) => {'));

  assert.match(
    setStatusBody,
    /void refreshGeofencedStoreData\(\);/,
    'setItemStatus must call refreshGeofencedStoreData() — marking purchased/restored changes eligibility',
  );
});

test('deleteItem triggers a geofence refresh (removing the last active item drops eligibility)', () => {
  const store = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const deleteItemBody = store.slice(store.indexOf('deleteItem: (id) => {'), store.indexOf('addStore: (input) => {'));

  assert.match(
    deleteItemBody,
    /void refreshGeofencedStoreData\(\);/,
    'deleteItem must call refreshGeofencedStoreData() so a store can drop out of monitoring',
  );
});

test('item mutations reuse the existing refreshGeofencedStoreData path, not a second registration system', () => {
  const store = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../core/services/syncEngine.ts', import.meta.url), 'utf8');

  // Exactly one definition of refreshGeofencedStoreData, imported (not redefined) in durable-store.ts.
  assert.match(sync, /export async function refreshGeofencedStoreData/);
  assert.doesNotMatch(store, /function refreshGeofencedStoreData/, 'durable-store.ts must not redefine refreshGeofencedStoreData');
  assert.match(
    store,
    /from ['"]\.\.\/core\/services\/syncEngine['"]/,
    'durable-store.ts must import refreshGeofencedStoreData from syncEngine, not define its own',
  );
});

test('diagnostics surface a staleness warning when live eligible count diverges from last registration', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url), 'utf8');

  assert.match(service, /registrationOutOfDate/, 'GeofenceDiagnostics must expose registrationOutOfDate');
  assert.match(
    service,
    /diagnosticStores\.length !== current\.regionsPassedCount/,
    'registrationOutOfDate must compare the live eligible count against the last registered region count',
  );
  assert.match(
    settings,
    /Geofence registration may be out of date\./,
    'settings.tsx must render the staleness warning copy',
  );
});

// ── "Not monitored / trip inactive" diagnostics fix ────────────────────────────
// Trip state must never affect skippedStores: decideStoreArrival() and
// defineGeofenceTask() never read trip state, so an inactive trip does not
// stop registration or arrival firing. Listing an already-registered,
// eligible store as "not monitored" because of trip state is a pure UI bug.

test('trip-inactive state is not a global skip reason', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    service,
    /'trip inactive'/,
    'trip state must never produce a skip reason — geofence firing does not depend on trip state',
  );
});

test('skippedStores only excludes genuinely-unmonitored stores, not every store when a global reason exists', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  // Old buggy filter: `!store.eligible || globalSkipReason` is true for ALL
  // stores whenever globalSkipReason is truthy, regardless of eligibility.
  assert.doesNotMatch(
    service,
    /\.filter\(\(store\) => !store\.eligible \|\| globalSkipReason\)/,
    'skippedStores must not use the old eligibility-agnostic filter',
  );
  // New filter: only a store that is not genuinely monitored (ineligible, over
  // the region limit, or blocked by a real global reason) is included.
  assert.match(
    service,
    /\.filter\(\(store\) => !\(store\.eligible && expectedIds\.has\(store\.id\)\) \|\| globalSkipReason\)/,
    'skippedStores must filter on genuine monitoring status, not eligibility alone',
  );
});

test('global skip reason is limited to reminders-off and permission-missing', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /'reminders off'/);
  assert.match(service, /'permission missing'/);
  assert.doesNotMatch(service, /'trip inactive'/);
});

test('a store beyond the iOS region-monitoring limit gets its own skip reason, not silent omission', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(
    service,
    /'over iOS region monitoring limit'/,
    'a per-store-eligible store excluded by the MAX_GEOFENCES_IOS slice must surface a real reason',
  );
});

test('truly ineligible stores keep their own per-store skip reason untouched', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(
    service,
    /if \(!store\.eligible\) return store;/,
    'an ineligible store must keep its original skippedReason (no coordinates / invalid lat-lng / no assigned shopping-list items), not be overwritten',
  );
});

test('settings.tsx renders skipped stores from a single source — no duplicate rows', () => {
  const settings = readFileSync(new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url), 'utf8');

  // The old local `skippedStores`/`hasActiveItem` duplicate list must be gone.
  assert.doesNotMatch(
    settings,
    /const skippedStores = gpsStores\.filter/,
    'settings.tsx must not maintain its own duplicate skipped-store list',
  );
  assert.doesNotMatch(
    settings,
    /hasActiveItem/,
    'settings.tsx must not render a second "no active item" label alongside the diagnostics-driven one',
  );

  // Exactly one "Not monitored" section, fed by exactly one .skippedStores.map(...).
  const headingMatches = settings.match(/Not monitored/g) ?? [];
  assert.equal(headingMatches.length, 1, 'must render exactly one "Not monitored" heading');
  const mapMatches = settings.match(/geofenceDiagnostics\?\.skippedStores\.map/g) ?? [];
  assert.equal(mapMatches.length, 1, 'must render skippedStores from exactly one source');
});

test('trip-inactive state is shown as separate informational text, not folded into skip reasons', () => {
  const settings = readFileSync(new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url), 'utf8');
  assert.match(
    settings,
    /Shopping trip inactive — arrival reminders still active\./,
    'settings.tsx must show trip-inactive as informational text, separate from "Not monitored"',
  );
});

test('diagnostics record registration attempts and clear stale errors on success', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');

  assert.match(service, /lastRegistrationAttemptAt/);
  assert.match(service, /startGeofencingCalled: true/);
  assert.match(service, /regionsPassedCount: regions\.length/);
  assert.match(service, /registrationResult: 'success'/);
  assert.match(service, /lastError: null/);
});

test('diagnostics record skipped store reasons and registration failures', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');

  assert.match(service, /no assigned shopping-list items/);
  assert.match(service, /invalid lat\/lng/);
  assert.match(service, /registrationResult: 'failed'/);
  assert.match(service, /registrationErrorStack/);
});

test('clearArrivalCooldown is exported from geofencing service', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  // Must be an exported async function so the Settings screen can call it
  assert.match(
    service,
    /export async function clearArrivalCooldown/,
    'clearArrivalCooldown must be an exported async function',
  );
});

test('GeofenceStoreDiagnostic exposes cooldownEndsAt for UI display', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  // Without this field the settings screen cannot show active cooldown state
  assert.match(
    service,
    /cooldownEndsAt: number \| null/,
    'GeofenceStoreDiagnostic must include cooldownEndsAt field',
  );
});

test('getGeofenceDiagnostics reads lastArrivalAt to compute cooldown end times', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  // Ensures diagnostics are live, not just reading stale stored values
  assert.match(
    service,
    /readLastArrivalAt\(\)/,
    'getGeofenceDiagnostics must call readLastArrivalAt() to get live cooldown state',
  );
});

test('settings screen shows cooldown state and offers a reset button', () => {
  const settings = readFileSync(new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url), 'utf8');
  assert.match(settings, /clearArrivalCooldown/, 'settings.tsx must import and use clearArrivalCooldown');
  assert.match(settings, /cooldownEndsAt/, 'settings.tsx must read cooldownEndsAt from store diagnostics');
  assert.match(settings, /Reset arrival cooldown/, 'settings.tsx must render a reset cooldown button label');
});

// ── Store-precision / ambiguity tests ────────────────────────────────────────
// These tests encode the v1 Sam's Club / Walmart bug and prevent its return.

/**
 * Build a pair of stores positioned like a shared-parking-lot scenario.
 *
 * Stores are ~150 m apart (Sam's Club and Walmart Supercenter commonly share
 * a large parking lot with centroids 100–300 m apart).  We use real-ish
 * coordinates so haversine gives accurate distances.
 *
 * User GPS position is placed at the Sam's Club entrance.
 */
const SAMS_LAT  = 40.71280;
const SAMS_LNG  = -74.00600;   // Sam's Club centroid
const WALMART_LAT = 40.71145;  // Walmart centroid, ~150 m south
const WALMART_LNG = -74.00600;
const USER_AT_SAMS_LAT = 40.71265; // user is ~17 m from Sam's, ~133 m from Walmart
const USER_AT_SAMS_LNG = -74.00600;

const samsClub  = (id = 'sams'):  Store => ({ id, name: "Sam's Club",  lat: SAMS_LAT,    lng: SAMS_LNG,    createdAt: 1, updatedAt: 1 });
const walmartSC = (id = 'walmart'): Store => ({ id, name: 'Walmart',    lat: WALMART_LAT, lng: WALMART_LNG, createdAt: 1, updatedAt: 1 });

test("Sam's + Walmart close, only Sam's has item → Sam's fires, Walmart never fires", () => {
  const stores = [samsClub(), walmartSC()];
  // Only Sam's has a qualifying item.
  const items  = [item('sams', 'low')];

  const decision = decideStoreArrival({
    lat: USER_AT_SAMS_LAT,
    lng: USER_AT_SAMS_LNG,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, true, 'Should accept arrival');
  assert.equal(decision.storeId, 'sams', "Should match Sam's Club, not Walmart");
  assert.equal(decision.ambiguous, false);

  // Walmart has no qualifying item so it must NOT be in nearbyCandidates
  const candidateIds = decision.nearbyCandidates.map((c) => c.storeId);
  assert.ok(!candidateIds.includes('walmart'), 'Walmart (no items) must never be a candidate');
});

test("Sam's + Walmart close, only Walmart has item → Walmart fires, Sam's never fires", () => {
  const stores = [samsClub(), walmartSC()];
  // Only Walmart has a qualifying item; user is physically at Sam's entrance.
  const items  = [item('walmart', 'low')];

  const decision = decideStoreArrival({
    lat: USER_AT_SAMS_LAT,
    lng: USER_AT_SAMS_LNG,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  // Walmart is inside the 200 m radius from the user (~133 m away) so it is
  // the only candidate and should be accepted even though the user is closer to Sam's.
  assert.equal(decision.accepted, true, 'Walmart is within radius and has items — should fire');
  assert.equal(decision.storeId, 'walmart');
  assert.equal(decision.ambiguous, false);

  const candidateIds = decision.nearbyCandidates.map((c) => c.storeId);
  assert.ok(!candidateIds.includes('sams'), "Sam's (no items) must never be a candidate");
});

test("Sam's + Walmart, both have items and distances too close → ambiguous, no notification", () => {
  const stores = [samsClub(), walmartSC()];
  // Both have qualifying items.  User is equidistant (midpoint of the two stores).
  const midLat = (SAMS_LAT + WALMART_LAT) / 2;
  const items = [item('sams', 'low'), item('walmart', 'low')];

  const decision = decideStoreArrival({
    lat: midLat,
    lng: SAMS_LNG,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  // Both stores are within 200 m, equidistant (gap = 0 m < AMBIGUITY_MARGIN_M).
  assert.equal(decision.accepted, false, 'Must not fire when ambiguous');
  assert.equal(decision.reason, 'ambiguous_nearby_store');
  assert.equal(decision.ambiguous, true);
  assert.ok(decision.nearbyCandidates.length >= 2, 'Both stores should be in nearbyCandidates');
});

test('GPS store with no active item is never a candidate, even when closest', () => {
  // The store has perfect coordinates but its only item is already purchased.
  const stores = [samsClub(), walmartSC()];
  const items: PantryItem[] = [item('sams', 'purchased')]; // purchased does not qualify

  const decision = decideStoreArrival({
    lat: USER_AT_SAMS_LAT,
    lng: USER_AT_SAMS_LNG,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'no_assigned_items');
  assert.equal(decision.nearbyCandidates.length, 0, 'No candidates when no items qualify');
});

test('GPS store with no active item is excluded from geofenceableStores', () => {
  const stores = [samsClub(), walmartSC()];
  // Neither store has an active item — both items already purchased.
  const items: PantryItem[] = [item('sams', 'purchased'), item('walmart', 'purchased')];
  assert.equal(
    geofenceableStores(stores, 20, items).length,
    0,
    'Stores with only purchased items must never be registered',
  );
});

test('ambiguity guard uses the AMBIGUITY_MARGIN_M constant as its threshold', () => {
  // One store at user position (distance ≈ 0), another exactly AMBIGUITY_MARGIN_M - 1 away.
  // Both within radius → should be ambiguous.
  const userLat = 40.71280;
  const userLng = -74.00600;

  // Place second store at exactly (AMBIGUITY_MARGIN_M - 1) metres east.
  // 1 degree longitude ≈ 82_633 m at this latitude.  (AMBIGUITY_MARGIN_M-1)/82633 degrees.
  const deltaLng = (AMBIGUITY_MARGIN_M - 1) / 82_633;

  const close1 = { id: 'close1', name: 'Close1', lat: userLat, lng: userLng, createdAt: 1, updatedAt: 1 };
  const close2 = { id: 'close2', name: 'Close2', lat: userLat, lng: userLng + deltaLng, createdAt: 1, updatedAt: 1 };

  const stores = [close1, close2];
  const items = [item('close1', 'low'), item('close2', 'low')];

  const decision = decideStoreArrival({
    lat: userLat,
    lng: userLng,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.equal(decision.ambiguous, true, `Gap < ${AMBIGUITY_MARGIN_M}m should be ambiguous`);
  assert.equal(decision.reason, 'ambiguous_nearby_store');
});

test('clear winner fires when gap to second candidate exceeds AMBIGUITY_MARGIN_M', () => {
  const userLat = 40.71280;
  const userLng = -74.00600;

  // Second store is AMBIGUITY_MARGIN_M + 20 m away — clearly not ambiguous.
  const deltaLng = (AMBIGUITY_MARGIN_M + 20) / 82_633;

  const close  = { id: 'close',  name: 'Close',  lat: userLat, lng: userLng,           createdAt: 1, updatedAt: 1 };
  const farish = { id: 'farish', name: 'Farish', lat: userLat, lng: userLng + deltaLng, createdAt: 1, updatedAt: 1 };

  const stores = [close, farish];
  const items = [item('close', 'low'), item('farish', 'low')];

  const decision = decideStoreArrival({
    lat: userLat,
    lng: userLng,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, true, `Gap ≥ ${AMBIGUITY_MARGIN_M}m should fire`);
  assert.equal(decision.storeId, 'close');
  assert.equal(decision.ambiguous, false);
});

test('nearbyCandidates is populated on all decision outcomes', () => {
  // On rejection (out_of_radius), nearbyCandidates should still be populated.
  const stores = [samsClub()];
  const items = [item('sams', 'low')];
  const FAR_LAT = 41.0; // ~32 km north

  const decision = decideStoreArrival({
    lat: FAR_LAT,
    lng: SAMS_LNG,
    stores,
    items,
    radiusMetres: 200,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'out_of_radius');
  // nearbyCandidates lists all assigned stores with their distances regardless of radius.
  assert.equal(decision.nearbyCandidates.length, 1);
  assert.ok(decision.nearbyCandidates[0].distanceMetres > 200);
});

test('haversineMetres returns plausible distances for well-known coordinate pairs', () => {
  // NYC to London is approximately 5,570,000 m (5,570 km).
  const nycToLondon = haversineMetres(40.7128, -74.0060, 51.5074, -0.1278);
  assert.ok(nycToLondon > 5_500_000 && nycToLondon < 5_650_000,
    `NYC→London should be ~5,570 km, got ${(nycToLondon / 1000).toFixed(0)} km`);

  // Same point should be 0.
  const zero = haversineMetres(40.7128, -74.0060, 40.7128, -74.0060);
  assert.equal(zero, 0);
});

test('decideStoreArrival returns nearbyCandidates sorted nearest-first', () => {
  const stores = [
    { id: 'far',  name: 'far',  lat: 40.715, lng: -74.006, createdAt: 1, updatedAt: 1 }, // ~330 m
    { id: 'near', name: 'near', lat: 40.713, lng: -74.006, createdAt: 1, updatedAt: 1 }, // ~55 m
  ];
  const items = [item('far', 'low'), item('near', 'low')];

  const decision = decideStoreArrival({
    lat: 40.7128,
    lng: -74.006,
    stores,
    items,
    radiusMetres: 500,
    cooldownMs: 0,
    lastArrivalAt: {},
  });

  assert.ok(decision.nearbyCandidates.length >= 1);
  // Nearest first
  for (let i = 1; i < decision.nearbyCandidates.length; i++) {
    assert.ok(
      decision.nearbyCandidates[i].distanceMetres >= decision.nearbyCandidates[i - 1].distanceMetres,
      'nearbyCandidates must be sorted nearest-first',
    );
  }
});

// ── Structural checks for new diagnostics fields ──────────────────────────────

test('GeofenceDiagnostics includes all required arrival precision fields', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  const requiredFields = [
    'lastEnteredRegionId',
    'lastMatchedStoreId',
    'lastMatchedStoreName',
    'lastMatchedDistanceM',
    'lastNearbyCandidates',
    'lastAmbiguityDecision',
    'lastNotificationStoreId',
    'lastNotificationStoreName',
  ];
  for (const field of requiredFields) {
    assert.ok(service.includes(field), `GeofenceDiagnostics must include '${field}'`);
  }
});

test('background task logs ambiguous_nearby_store to notification pipeline', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(
    service,
    /ambiguous_nearby_store/,
    'geofencing.ts must log ambiguous_nearby_store when ambiguity suppresses the notification',
  );
});

test('ArrivalDecision includes nearbyCandidates and ambiguous fields', () => {
  const logic = readFileSync(new URL('../core/services/geofencingLogic.ts', import.meta.url), 'utf8');
  assert.match(logic, /nearbyCandidates: StoreCandidate\[\]/);
  assert.match(logic, /ambiguous: boolean/);
  assert.match(logic, /AMBIGUITY_MARGIN_M/);
});

test('AMBIGUITY_MARGIN_M is exported and equals 50', () => {
  assert.equal(AMBIGUITY_MARGIN_M, 50, 'AMBIGUITY_MARGIN_M must be 50 m');
});

// ── Post-field-test refinements (OTA 178) ─────────────────────────────────────

// ① True-arrival radius decoupled from iOS region radius.
test('iOS region radius is the tight true-arrival distance (100m), not the old 200m', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /export const GEOFENCE_RADIUS_M = 100;/,
    'region radius must be 100m so Enter fires on true arrival, not 200m away');
});

test('decision acceptance radius (ARRIVAL_RADIUS_M) is >= region radius to absorb GPS jitter', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /export const ARRIVAL_RADIUS_M = 150;/,
    'ARRIVAL_RADIUS_M must be defined (150m) so a boundary Enter is never falsely rejected out_of_radius');
  // EVERY decideStoreArrival call must use the acceptance radius, not the tight
  // region radius, or a boundary Enter would early-return. Asserted as a ratio
  // rather than a fixed count so adding a call site (the re-sampling distance
  // check) can't silently pass with the wrong radius.
  const decisions = service.match(/decideStoreArrival\(\{/g) ?? [];
  const usages = service.match(/radiusMetres: ARRIVAL_RADIUS_M,/g) ?? [];
  assert.ok(decisions.length >= 2, 'entry and dwell decisions must both exist');
  assert.equal(usages.length, decisions.length,
    'every decideStoreArrival call must use ARRIVAL_RADIUS_M');
  assert.doesNotMatch(service, /radiusMetres: GEOFENCE_RADIUS_M,/,
    'no decision may gate on the tight region radius (would drop genuine arrivals)');
});

// ② Store-specific notification with item names.
test('arrivalItemNames returns only the matched store active items, never an aggregate', () => {
  const items = [
    item('target', 'low'),       // name === 'low'
    item('target', 'expiring'),  // name === 'expiring'
    item('target', 'stocked'),   // stocked — excluded from shopping alerts
    item('target', 'purchased'), // picked up — excluded
    item('other', 'low'),        // different store — excluded
  ];
  const names = arrivalItemNames(items, 'target');
  assert.deepEqual(names, ['low', 'expiring'],
    'names must be store-scoped shopping-list items, exclude stocked/purchased, and never include other stores');
});

test('arrivalItemNames length always matches arrivalItemCount for the same store', () => {
  const items = [
    item('aldi', 'low'),
    item('aldi', 'expiring'),
    item('aldi', 'stocked'),
    item('aldi', 'purchased'),
    item('bravo', 'low'),
  ];
  assert.equal(arrivalItemNames(items, 'aldi').length, arrivalItemCount(items, 'aldi'),
    'the names shown and the count shown must always agree');
});

test('arrival notification body is built from item names, not a bare count', () => {
  const notif = readFileSync(new URL('../core/services/notifications.ts', import.meta.url), 'utf8');
  assert.match(notif, /function buildArrivalBody/, 'a store-specific body builder must exist');
  assert.match(notif, /itemNames\.length === 1/, 'singular item case must name the item');
  assert.match(notif, /\+\$\{itemNames\.length - 2\} more/, '3+ items must summarize with overflow');
});

// ③ Hybrid: geofence tap deep-links into the matched store.
test('notification payload carries storeId for the hybrid focus flow', () => {
  const notif = readFileSync(new URL('../core/services/notifications.ts', import.meta.url), 'utf8');
  assert.match(notif, /opts\?\.storeId \? \{ storeId: opts\.storeId \}/,
    'store_arrival data must include storeId when available');
});

test('tap handler deep-links store_arrival to Shopping with arrivalStoreId', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout,
    /params: \{ arrivalStoreId: data\.storeId \}/,
    'a store_arrival tap must navigate to Shopping focused on the matched store');
});

test('Shopping auto-starts at the matched store via the existing startTripAt engine, guarded', () => {
  const screen = readFileSync(new URL('../app/(tabs)/shopping.tsx', import.meta.url), 'utf8');
  assert.match(screen, /arrivalStoreId/, 'Shopping must read the arrivalStoreId param');
  assert.match(screen, /startTripAt\(arrivalStoreId, false, localMember\?\.id \?\? null\)/, 'must reuse startTripAt — no duplicate trip engine');
  assert.match(screen, /session\.status !== 'idle'/, 'must not hijack an in-progress trip');
  assert.match(screen, /plan\.has\(arrivalStoreId\)/, 'must not start an empty trip when the store has no shoppable items');
  assert.match(screen, /arrivalHandledRef/, 'auto-start must be one-shot');
});

// ── Bounded re-sampling after a speed rejection ──────────────────────────────
//
// Field defect: a single GPS sample 10s after crossing a 100m boundary decided
// the arrival. Entering a car park at speed puts that sample mid-manoeuvre, so
// it read `rejected_speed` — and because iOS fires ENTER only on a boundary
// crossing, parking and walking in produced no second chance. A real device
// showed `rejected_speed` with `Last arrival: none yet`.

const sampleOpts = {
  maxAccuracyM: 60,
  speedThresholdMps: 5,
  arrivalRadiusM: 150,
  isFirstSample: false,
  budgetExpired: false,
};

test('1. genuine parking arrival: fast first sample, slow second sample → notify', () => {
  const first = evaluateArrivalSample(
    { speedMps: 9, accuracyM: 20, distanceM: 60 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.deepEqual(first, { decision: 'retry', reason: 'speed' },
    'still moving through the lot must not end the attempt');

  const second = evaluateArrivalSample({ speedMps: 0.4, accuracyM: 20, distanceM: 55 }, sampleOpts);
  assert.deepEqual(second, { decision: 'accept' }, 'parked and inside radius → arrival');
});

test('2a. drive-by: every sample stays above the speed threshold → suppressed', () => {
  let outcome = evaluateArrivalSample(
    { speedMps: 14, accuracyM: 15, distanceM: 90 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.equal(outcome.decision, 'retry');
  outcome = evaluateArrivalSample({ speedMps: 15, accuracyM: 15, distanceM: 120 }, sampleOpts);
  assert.equal(outcome.decision, 'retry');
  // Budget spent — must land on a terminal rejection, never accept.
  outcome = evaluateArrivalSample(
    { speedMps: 16, accuracyM: 15, distanceM: 140 },
    { ...sampleOpts, budgetExpired: true },
  );
  assert.deepEqual(outcome, { decision: 'reject', reason: 'rejected_speed' });
});

test('2b. drive-by: leaving the radius rejects immediately, without waiting out the budget', () => {
  const outcome = evaluateArrivalSample({ speedMps: 12, accuracyM: 15, distanceM: 400 }, sampleOpts);
  assert.deepEqual(outcome, { decision: 'reject', reason: 'moved_away' });
});

test('2c. pass-by protection is unchanged for a first sample that is moving', () => {
  // Previously this was a terminal rejection; it is now a retry, but it must
  // never be an acceptance.
  const outcome = evaluateArrivalSample(
    { speedMps: 20, accuracyM: 10, distanceM: 50 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.notEqual(outcome.decision, 'accept');
});

test('3. stale/unknown speed (-1) still passes, as before', () => {
  const outcome = evaluateArrivalSample(
    { speedMps: -1, accuracyM: 20, distanceM: 40 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.deepEqual(outcome, { decision: 'accept' },
    'a missing speed fix must never silently drop a real arrival');
});

test('4a. poor accuracy on the FIRST sample still fails closed', () => {
  const outcome = evaluateArrivalSample(
    { speedMps: 0, accuracyM: 120, distanceM: 40 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.deepEqual(outcome, { decision: 'reject', reason: 'rejected_accuracy' },
    'unchanged from before the re-sampling change');
});

test('4b. transient poor accuracy mid-retry is skipped, not fatal', () => {
  const transient = evaluateArrivalSample({ speedMps: 0, accuracyM: 120, distanceM: 40 }, sampleOpts);
  assert.deepEqual(transient, { decision: 'retry', reason: 'accuracy' });
  // ...but if it never recovers before the budget runs out, it is terminal.
  const terminal = evaluateArrivalSample(
    { speedMps: 0, accuracyM: 120, distanceM: 40 },
    { ...sampleOpts, budgetExpired: true },
  );
  assert.deepEqual(terminal, { decision: 'reject', reason: 'rejected_accuracy' });
});

test('5. timeout: budget expiry always yields a terminal decision', () => {
  for (const speed of [6, 9, 30]) {
    const outcome = evaluateArrivalSample(
      { speedMps: speed, accuracyM: 20, distanceM: 40 },
      { ...sampleOpts, budgetExpired: true },
    );
    assert.equal(outcome.decision, 'reject', `speed ${speed} must not hang in retry`);
  }
});

test('8. a stopped user inside the radius accepts on the first opportunity', () => {
  // Guards against a retry loop that keeps sampling after a valid arrival,
  // which is what would produce more than one notification.
  const outcome = evaluateArrivalSample(
    { speedMps: 0, accuracyM: 10, distanceM: 30 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.deepEqual(outcome, { decision: 'accept' });
});

// ── Exact sampling timeline ──────────────────────────────────────────────────
//
// Pins the real window. An earlier report claimed "park 40s after crossing the
// boundary → retries accept", which these numbers disprove: the last sample is
// taken at 28s of sleep time. Only cumulative GPS-fix duration pushes it later,
// and that is not something the implementation controls or can promise.

test('timeline: 4 samples total — post-dwell plus 3 retries', () => {
  const offsets = arrivalSampleOffsetsMs({
    dwellMs: DWELL_CONFIRM_MS,
    retryIntervalMs: ARRIVAL_RETRY_INTERVAL_MS,
    maxAttempts: ARRIVAL_RETRY_MAX_ATTEMPTS,
  });
  assert.equal(offsets.length, ARRIVAL_RETRY_MAX_ATTEMPTS + 1,
    'MAX_ATTEMPTS counts retries AFTER the initial sample');
  assert.deepEqual(offsets, [10_000, 16_000, 22_000, 28_000]);
});

test('timeline: the last sample is at 28s of sleep time, not 40s', () => {
  const offsets = arrivalSampleOffsetsMs({
    dwellMs: DWELL_CONFIRM_MS,
    retryIntervalMs: ARRIVAL_RETRY_INTERVAL_MS,
    maxAttempts: ARRIVAL_RETRY_MAX_ATTEMPTS,
  });
  const last = offsets[offsets.length - 1];
  assert.equal(last, 28_000);
  assert.ok(last < 40_000,
    'a 40s parking arrival is NOT caught by sleep timing alone — do not claim it is');
});

test('timeline: sleep budget of the retry phase is 18s, under the 20s cap', () => {
  const retrySleep = ARRIVAL_RETRY_MAX_ATTEMPTS * ARRIVAL_RETRY_INTERVAL_MS;
  assert.equal(retrySleep, 18_000);
  assert.ok(retrySleep < ARRIVAL_RETRY_BUDGET_MS,
    'the attempt cap binds before the wall-clock budget unless GPS fixes are slow');
});

test('loop guard: stops after MAX_ATTEMPTS retries and never on a terminal verdict', () => {
  const retry = { decision: 'retry', reason: 'speed' } as const;
  assert.equal(shouldContinueArrivalSampling(retry, 0, 3), true);
  assert.equal(shouldContinueArrivalSampling(retry, 2, 3), true);
  assert.equal(shouldContinueArrivalSampling(retry, 3, 3), false, 'hard stop at the cap');
  assert.equal(shouldContinueArrivalSampling({ decision: 'accept' }, 0, 3), false);
  assert.equal(
    shouldContinueArrivalSampling({ decision: 'reject', reason: 'moved_away' }, 0, 3), false);
});

test('budget boundary: a good sample still accepts on the final retry', () => {
  // budgetExpired forces a terminal answer only for a BAD sample. Someone who
  // parks just before the window closes must still be notified.
  const outcome = evaluateArrivalSample(
    { speedMps: 0.2, accuracyM: 15, distanceM: 40 },
    { ...sampleOpts, budgetExpired: true },
  );
  assert.deepEqual(outcome, { decision: 'accept' });
});

test('parking AFTER the window stays suppressed (honest limitation)', () => {
  // Still moving at the final sample → suppressed. Parking at 45s cannot be
  // seen, because iOS re-fires ENTER only on a new boundary crossing.
  const outcome = evaluateArrivalSample(
    { speedMps: 7, accuracyM: 15, distanceM: 50 },
    { ...sampleOpts, budgetExpired: true },
  );
  assert.deepEqual(outcome, { decision: 'reject', reason: 'rejected_speed' });
});

test('one notification maximum: acceptance is terminal, never re-entered', () => {
  const accepted = evaluateArrivalSample(
    { speedMps: 0, accuracyM: 10, distanceM: 20 },
    { ...sampleOpts, isFirstSample: true },
  );
  assert.equal(accepted.decision, 'accept');
  assert.equal(shouldContinueArrivalSampling(accepted, 0, ARRIVAL_RETRY_MAX_ATTEMPTS), false,
    'no further sampling after acceptance, so notifyArrival runs at most once');
});

// ── Task interruption ────────────────────────────────────────────────────────

test('a task killed mid-retry leaves "sampling", not a false verdict', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');

  // The phase marker must be written BEFORE the loop, so an interrupted attempt
  // is distinguishable from a genuine suppression.
  const phaseWrite = service.indexOf("lastArrivalPhase: 'sampling'");
  const loopStart = service.indexOf('while (shouldContinueArrivalSampling(');
  assert.ok(phaseWrite > -1 && loopStart > phaseWrite,
    'sampling phase must be recorded before any retry runs');

  // Terminal phases exist and are only set on terminal paths.
  assert.match(service, /lastArrivalPhase: 'suppressed'/);
  assert.match(service, /lastArrivalPhase: 'accepted'/);

  // Nothing irreversible happens during sampling: the cooldown is written only
  // after acceptance, so an interrupted attempt cannot block a future arrival.
  const cooldownWrite = service.indexOf('await writeLastArrivalAt(decision.storeId, Date.now())');
  assert.ok(cooldownWrite > loopStart,
    'cooldown must be written after sampling completes, never during it');
});

// ── Repeat-arrival suppression: EXIT required before re-notifying ────────────
//
// Field defect: repeated "You arrived at..." alerts at a store the user never
// left. A 3-minute cooldown was the only duplicate guard, and lastExitAt was
// recorded but never consulted — so any ENTER more than 3 minutes after the last
// arrival notified again, including ENTER events iOS re-delivers when regions
// are re-registered while the user is already inside one.

const ARRIVAL_STORE = store('walmart', NYC.lat, NYC.lng);
const ARRIVAL_ITEMS = [item('walmart', 'low')];

function arrivalDecision(overrides: {
  lastArrivalAt?: Record<string, number>;
  lastExitAt?: Record<string, number>;
  exitGateMigrated?: Record<string, boolean>;
  now?: number;
  cooldownMs?: number;
}) {
  return decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores: [ARRIVAL_STORE],
    items: ARRIVAL_ITEMS,
    radiusMetres: 150,
    cooldownMs: overrides.cooldownMs ?? 60_000,
    lastArrivalAt: overrides.lastArrivalAt ?? {},
    lastExitAt: overrides.lastExitAt,
    // Steady state: the gate is already active for this store. The one-time
    // upgrade grandfather is covered separately by the MIGRATION tests.
    exitGateMigrated: overrides.exitGateMigrated ?? { walmart: true },
    now: overrides.now ?? 1_700_000_000_000,
  });
}

test('first ENTER with no prior arrival is allowed', () => {
  const decision = arrivalDecision({ lastArrivalAt: {}, lastExitAt: {} });
  assert.equal(decision.accepted, true, 'a newly monitored store must still notify');
  assert.equal(decision.storeId, 'walmart');
});

test('second ENTER without an EXIT is suppressed', () => {
  const now = 1_700_000_000_000;
  // Well beyond the cooldown, so only the exit gate can suppress this.
  const decision = arrivalDecision({
    lastArrivalAt: { walmart: now - 60 * 60 * 1000 },
    lastExitAt: {},
    now,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'no_exit_since_last_arrival');
});

test('an EXIT recorded BEFORE the last arrival does not unlock the next ENTER', () => {
  const now = 1_000_000;
  const decision = arrivalDecision({
    lastArrivalAt: { walmart: now - 10_000 },
    lastExitAt: { walmart: now - 20_000 }, // stale: predates the arrival
    now,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'no_exit_since_last_arrival');
});

test('a valid EXIT after the last arrival allows the next ENTER', () => {
  const now = 1_000_000;
  const decision = arrivalDecision({
    lastArrivalAt: { walmart: now - 600_000 },
    lastExitAt: { walmart: now - 300_000 }, // left after arriving, long enough ago
    now,
  });
  assert.equal(decision.accepted, true);
  assert.equal(decision.storeId, 'walmart');
});

test('cooldown still blocks a genuine but too-fast re-entry', () => {
  const now = 1_000_000;
  const decision = arrivalDecision({
    lastArrivalAt: { walmart: now - 1_000 },
    lastExitAt: { walmart: now - 500 }, // genuinely exited, but seconds ago
    now,
    cooldownMs: 60_000,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'cooldown', 'cooldown remains the secondary safeguard');
});

test('the exit gate is evaluated before cooldown, so the reason is the actionable one', () => {
  const now = 1_000_000;
  const decision = arrivalDecision({
    lastArrivalAt: { walmart: now - 1_000 },
    lastExitAt: {},
    now,
  });
  assert.equal(decision.reason, 'no_exit_since_last_arrival',
    'never left is more actionable than "too soon"');
});

test('exit state is read from persisted input, so suppression survives a restart', () => {
  // decideStoreArrival is pure over the persisted maps; the task loads both from
  // AsyncStorage. Re-running with the same persisted state must give the same
  // verdict, which is what makes a cold start behave like a warm one.
  const now = 1_700_000_000_000;
  const persisted = { lastArrivalAt: { walmart: now - 60 * 60 * 1000 }, lastExitAt: {} };
  const first = arrivalDecision({ ...persisted, now });
  const afterRestart = arrivalDecision({ ...persisted, now: now + 5_000 });
  assert.equal(first.reason, 'no_exit_since_last_arrival');
  assert.equal(afterRestart.reason, 'no_exit_since_last_arrival',
    'a relaunch must not silently re-open the gate');
});

test('the exit gate is per-store and never leaks across stores', () => {
  const now = 1_000_000;
  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores: [ARRIVAL_STORE],
    items: ARRIVAL_ITEMS,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: { other: now - 10_000 }, // a different store arrived recently
    lastExitAt: {},
    now,
  });
  assert.equal(decision.accepted, true, 'another store’s arrival must not gate this one');
});

// ── Native re-registration control ──────────────────────────────────────────

const REGION_A = { identifier: 'a', latitude: 1, longitude: 2, radius: 100, notifyOnEnter: true, notifyOnExit: true };
const REGION_B = { identifier: 'b', latitude: 3, longitude: 4, radius: 100, notifyOnEnter: true, notifyOnExit: true };

test('unchanged region set produces an identical fingerprint (no native restart)', () => {
  assert.equal(regionFingerprint([REGION_A, REGION_B]), regionFingerprint([REGION_A, REGION_B]));
});

test('region ordering does not change the fingerprint', () => {
  assert.equal(regionFingerprint([REGION_A, REGION_B]), regionFingerprint([REGION_B, REGION_A]));
});

test('changed coordinates change the fingerprint (native restart required)', () => {
  const moved = { ...REGION_A, latitude: 9.9 };
  assert.notEqual(regionFingerprint([REGION_A]), regionFingerprint([moved]));
});

test('changed store set changes the fingerprint', () => {
  assert.notEqual(regionFingerprint([REGION_A]), regionFingerprint([REGION_A, REGION_B]));
  assert.notEqual(regionFingerprint([REGION_A, REGION_B]), regionFingerprint([REGION_A]));
});

test('changed radius changes the fingerprint', () => {
  assert.notEqual(regionFingerprint([REGION_A]), regionFingerprint([{ ...REGION_A, radius: 250 }]));
});

test('item names and counts are not part of the fingerprint', () => {
  // The fingerprint only accepts native-relevant fields, so an item edit that
  // leaves the same stores eligible cannot force a re-registration.
  const withExtras = { ...REGION_A, itemCount: 7, storeName: 'Renamed' } as typeof REGION_A;
  assert.equal(regionFingerprint([REGION_A]), regionFingerprint([withExtras]));
});

// ── Refresh serialization ───────────────────────────────────────────────────

test('two concurrent refreshes run one native cycle', async () => {
  const single = createSingleFlight<string>();
  let runs = 0;
  const op = () => new Promise<string>((resolve) => {
    runs += 1;
    setTimeout(() => resolve('ok'), 20);
  });

  const [a, b] = await Promise.all([single(op), single(op)]);

  assert.equal(runs, 1, 'the second caller must join the in-flight run, not start another');
  assert.equal(a, 'ok');
  assert.equal(b, 'ok', 'both callers receive the same deterministic result');
});

test('a failed refresh clears the in-flight guard', async () => {
  const single = createSingleFlight<string>();
  let runs = 0;
  const failing = () => { runs += 1; return Promise.reject(new Error('boom')); };

  await assert.rejects(() => single(failing), /boom/);
  // A rejected run must not wedge the queue.
  const succeeding = () => { runs += 1; return Promise.resolve('recovered'); };
  assert.equal(await single(succeeding), 'recovered');
  assert.equal(runs, 2, 'the guard released after failure, allowing a fresh run');
});

test('sequential refreshes after completion each run', async () => {
  const single = createSingleFlight<number>();
  let runs = 0;
  const op = () => Promise.resolve(++runs);
  assert.equal(await single(op), 1);
  assert.equal(await single(op), 2, 'the guard must not permanently coalesce');
});

// ── Wiring assertions (native-dependent, asserted against source) ────────────

test('the geofence task persists EXIT and feeds it into the arrival decision', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /await writeLastExitAt\(storeId, now\)/,
    'EXIT must be persisted, not only written to the diagnostics blob');
  assert.match(service, /await readLastExitAt\(\)/,
    'the task must load persisted exit state');
  assert.match(service, /const lastExitAt = seedExitStateFromDiagnostics\(/,
    'and merge in genuine exit evidence recovered from legacy diagnostics');
  const decisionCalls = service.match(/decideStoreArrival\(\{/g) ?? [];
  const exitPasses = service.match(/lastExitAt,/g) ?? [];
  assert.equal(exitPasses.length, decisionCalls.length,
    'every decideStoreArrival call must receive lastExitAt');
});

test('startGeofencing skips identical re-registration and is single-flighted', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /const fingerprint = regionFingerprint\(regions\)/);
  assert.match(service, /registeredRegionFingerprint === fingerprint/,
    'an unchanged region set must short-circuit');
  assert.match(service, /return 'unchanged'/);
  assert.match(service, /geofenceSingleFlight\(\(\) => startGeofencingInner\(stores, items\)\)/,
    'concurrent callers must coalesce onto one run');
});

test('teardown paths clear the fingerprint so re-enabling always re-registers', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  const clears = service.match(/registeredRegionFingerprint: null/g) ?? [];
  assert.ok(clears.length >= 3,
    `stop, zero-eligible teardown and the empty default must all clear it; found ${clears.length}`);
});

test('the new suppression reason is exposed in diagnostics', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /\| 'no_exit_since_last_arrival'/,
    'the reason must be part of the diagnostics union');
  assert.match(service, /lastSuppressionReason: initial\.reason === 'no_exit_since_last_arrival'/,
    'a suppressed duplicate must be recorded with its reason, not just a lastError string');
});

// ── Exit-gate upgrade migration ─────────────────────────────────────────────
//
// Installs predating the exit gate carry a persisted lastArrivalAt but no exit
// history, so the gate would suppress one genuine arrival after updating. A
// per-store marker grandfathers exactly one accepted arrival, then the gate
// applies permanently. Real exit evidence left in old diagnostics is preferred
// over spending that grandfather.

function migrationDecision(overrides: {
  lastArrivalAt?: Record<string, number>;
  lastExitAt?: Record<string, number>;
  exitGateMigrated?: Record<string, boolean>;
  now?: number;
  cooldownMs?: number;
}) {
  return decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores: [ARRIVAL_STORE],
    items: ARRIVAL_ITEMS,
    radiusMetres: 150,
    cooldownMs: overrides.cooldownMs ?? 60_000,
    lastArrivalAt: overrides.lastArrivalAt ?? {},
    lastExitAt: overrides.lastExitAt,
    exitGateMigrated: overrides.exitGateMigrated,
    now: overrides.now ?? 1_700_000_000_000,
  });
}

const UPGRADE_NOW = 1_700_000_000_000;
/** Prior arrival from the old build, no exit history, no marker yet. */
const LEGACY_STATE = {
  lastArrivalAt: { walmart: UPGRADE_NOW - 60 * 60 * 1000 },
  lastExitAt: {},
  exitGateMigrated: {},
};

test('MIGRATION 1: existing install with prior arrival and no marker allows exactly one arrival', () => {
  const decision = migrationDecision({ ...LEGACY_STATE, now: UPGRADE_NOW });
  assert.equal(decision.accepted, true,
    'a legitimate first post-update arrival must not be swallowed');
  assert.equal(decision.storeId, 'walmart');
});

test('MIGRATION 2: the next ENTER without an EXIT is suppressed once the marker exists', () => {
  // The task writes the marker on acceptance, so this is the state immediately after.
  const decision = migrationDecision({
    lastArrivalAt: { walmart: UPGRADE_NOW },
    lastExitAt: {},
    exitGateMigrated: { walmart: true },
    now: UPGRADE_NOW + 10 * 60 * 1000,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'no_exit_since_last_arrival',
    'the grandfather must not be granted repeatedly');
});

test('MIGRATION 3: a real EXIT after migration allows the next ENTER', () => {
  const decision = migrationDecision({
    lastArrivalAt: { walmart: UPGRADE_NOW },
    lastExitAt: { walmart: UPGRADE_NOW + 5 * 60 * 1000 },
    exitGateMigrated: { walmart: true },
    now: UPGRADE_NOW + 10 * 60 * 1000,
  });
  assert.equal(decision.accepted, true);
});

test('MIGRATION 4: a new store with no prior state is unaffected', () => {
  const decision = migrationDecision({
    lastArrivalAt: {},
    lastExitAt: {},
    exitGateMigrated: {},
    now: UPGRADE_NOW,
  });
  assert.equal(decision.accepted, true, 'first arrival at a new store works normally');
});

test('MIGRATION 5: a missing marker never disables duplicate protection permanently', () => {
  // Marker present is the steady state; repeated ENTERs stay suppressed no matter
  // how much time passes, so the gate cannot decay back into the old behaviour.
  for (const elapsed of [10 * 60 * 1000, 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000]) {
    const decision = migrationDecision({
      lastArrivalAt: { walmart: UPGRADE_NOW },
      lastExitAt: {},
      exitGateMigrated: { walmart: true },
      now: UPGRADE_NOW + elapsed,
    });
    assert.equal(decision.reason, 'no_exit_since_last_arrival', `elapsed ${elapsed}ms`);
  }
});

test('MIGRATION 6: migrated state survives a restart', () => {
  const persisted = {
    lastArrivalAt: { walmart: UPGRADE_NOW },
    lastExitAt: {},
    exitGateMigrated: { walmart: true },
  };
  const before = migrationDecision({ ...persisted, now: UPGRADE_NOW + 60_000 });
  const afterRelaunch = migrationDecision({ ...persisted, now: UPGRADE_NOW + 120_000 });
  assert.equal(before.reason, 'no_exit_since_last_arrival');
  assert.equal(afterRelaunch.reason, 'no_exit_since_last_arrival',
    'a relaunch must not re-open the grandfather');
});

test('MIGRATION 7: the grandfather is per-store', () => {
  // walmart already migrated; a different legacy store keeps its own one-shot.
  const decision = decideStoreArrival({
    lat: NYC_NEAR.lat,
    lng: NYC_NEAR.lng,
    stores: [ARRIVAL_STORE],
    items: ARRIVAL_ITEMS,
    radiusMetres: 150,
    cooldownMs: 60_000,
    lastArrivalAt: { walmart: UPGRADE_NOW - 60 * 60 * 1000 },
    lastExitAt: {},
    exitGateMigrated: { someOtherStore: true },
    now: UPGRADE_NOW,
  });
  assert.equal(decision.accepted, true,
    'another store’s marker must not consume this store’s grandfather');
});

test('MIGRATION 8: the grandfather does not bypass cooldown', () => {
  const decision = migrationDecision({
    lastArrivalAt: { walmart: UPGRADE_NOW - 1_000 }, // seconds ago
    lastExitAt: {},
    exitGateMigrated: {},
    now: UPGRADE_NOW,
    cooldownMs: 60_000,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, 'cooldown',
    'migration must not weaken the secondary safeguard');
});

// ── Reusing genuine exit evidence from legacy diagnostics ───────────────────

test('seeding fills gaps from legacy diagnostics lastExitAt', () => {
  const seeded = seedExitStateFromDiagnostics({}, [
    { id: 'walmart', lastExitAt: 12_345 },
    { id: 'aldi', lastExitAt: null },
  ]);
  assert.equal(seeded.walmart, 12_345, 'real exit evidence is recovered');
  assert.equal(seeded.aldi, undefined, 'a wiped/absent value is not invented');
});

test('seeding never overwrites the authoritative persisted key', () => {
  const seeded = seedExitStateFromDiagnostics({ walmart: 999 }, [
    { id: 'walmart', lastExitAt: 12_345 },
  ]);
  assert.equal(seeded.walmart, 999, 'the dedicated key wins once written');
});

test('seeded evidence satisfies the gate without spending the grandfather', () => {
  const seeded = seedExitStateFromDiagnostics({}, [
    { id: 'walmart', lastExitAt: UPGRADE_NOW - 30 * 60 * 1000 },
  ]);
  const decision = migrationDecision({
    lastArrivalAt: { walmart: UPGRADE_NOW - 60 * 60 * 1000 },
    lastExitAt: seeded,
    exitGateMigrated: {}, // grandfather still unused
    now: UPGRADE_NOW,
  });
  assert.equal(decision.accepted, true, 'a genuine recovered exit opens the gate');
});

test('seeding ignores zero and negative timestamps', () => {
  const seeded = seedExitStateFromDiagnostics({}, [
    { id: 'a', lastExitAt: 0 },
    { id: 'b', lastExitAt: -1 },
  ]);
  assert.deepEqual(seeded, {}, 'only positive timestamps count as evidence');
});

test('the task persists the marker on every accepted arrival', () => {
  const service = readFileSync(new URL('../core/services/geofencing.ts', import.meta.url), 'utf8');
  assert.match(service, /await markExitGateMigrated\(decision\.storeId\)/,
    'acceptance must close the grandfather');
  const arrivalWrite = service.indexOf('await writeLastArrivalAt(decision.storeId, Date.now())');
  const markerWrite = service.indexOf('await markExitGateMigrated(decision.storeId)');
  assert.ok(arrivalWrite > -1 && markerWrite > arrivalWrite,
    'the marker is written alongside the accepted arrival');
  assert.match(service, /seedExitStateFromDiagnostics\(/,
    'legacy exit evidence must be recovered before deciding');
});
