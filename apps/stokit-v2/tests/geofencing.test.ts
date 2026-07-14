import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  arrivalItemCount,
  arrivalItemNames,
  decideStoreArrival,
  geofenceableStores,
  haversineMetres,
  AMBIGUITY_MARGIN_M,
  type StoreCandidate,
} from '../core/services/geofencingLogic';
import type { PantryItem, Store } from '../types';

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
    item('aldi', 'stocked'),    // normal assigned item still counts
    item('aldi', 'purchased'),  // picked up — must NOT count
    item('other', 'low'),
  ];
  // low + expiring + stocked = 3; purchased excluded; 'other' store excluded.
  assert.equal(arrivalItemCount(items, 'aldi'), 3);
});

// ── Eligibility: any active assigned item, not only low/expiring ──────────────
// Product rule: a store is eligible for arrival reminders when it has GPS
// coordinates AND at least one assigned item that is still needed (not
// purchased). Low/expiring is pantry intelligence, NOT a geofence requirement.

test('a normal (stocked) assigned item makes a GPS store eligible', () => {
  const stores = [store('seven-eleven', 1, 1)];
  const items = [item('seven-eleven', 'stocked')]; // e.g. manually added "ice cream"
  assert.deepEqual(
    geofenceableStores(stores, 20, items).map(({ id }) => id),
    ['seven-eleven'],
    'A manually assigned stocked item must still register the store',
  );
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

test('a GPS store with no assigned active items is ignored', () => {
  const stores = [store('costco', 1, 1)];
  const items: PantryItem[] = []; // coordinates present, but nothing assigned to it
  assert.equal(
    geofenceableStores(stores, 20, items).length,
    0,
    'A store with coordinates but no assigned active items must never be registered',
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
  assert.match(screen, /startGeofencing\(stores, nextItems\)/);
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
  const addItemBody = store.slice(store.indexOf('addItem: (input) => {'), store.indexOf('updateItem: (id, patch) => {'));

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
    'an ineligible store must keep its original skippedReason (no coordinates / invalid lat-lng / no assigned active items), not be overwritten',
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

  assert.match(service, /no assigned active items/);
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
  // Both decideStoreArrival calls (entry + dwell) must use the acceptance radius,
  // not the tight region radius, or a boundary Enter would early-return.
  const usages = service.match(/radiusMetres: ARRIVAL_RADIUS_M,/g) ?? [];
  assert.equal(usages.length, 2, 'both entry and dwell decisions must use ARRIVAL_RADIUS_M');
  assert.doesNotMatch(service, /radiusMetres: GEOFENCE_RADIUS_M,/,
    'no decision may gate on the tight region radius (would drop genuine arrivals)');
});

// ② Store-specific notification with item names.
test('arrivalItemNames returns only the matched store active items, never an aggregate', () => {
  const items = [
    item('target', 'low'),       // name === 'low'
    item('target', 'expiring'),  // name === 'expiring'
    item('target', 'stocked'),   // manually-assigned, still active
    item('target', 'purchased'), // picked up — excluded
    item('other', 'low'),        // different store — excluded
  ];
  const names = arrivalItemNames(items, 'target');
  assert.deepEqual(names, ['low', 'expiring', 'stocked'],
    'names must be store-scoped, exclude purchased, and never include other stores');
});

test('arrivalItemNames length always matches arrivalItemCount for the same store', () => {
  const items = [
    item('aldi', 'low'),
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
  assert.match(screen, /startTripAt\(arrivalStoreId\)/, 'must reuse startTripAt — no duplicate trip engine');
  assert.match(screen, /session\.status !== 'idle'/, 'must not hijack an in-progress trip');
  assert.match(screen, /plan\.has\(arrivalStoreId\)/, 'must not start an empty trip when the store has no shoppable items');
  assert.match(screen, /arrivalHandledRef/, 'auto-start must be one-shot');
});
