import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { arrivalItemCount, decideStoreArrival, geofenceableStores } from '../core/services/geofencingLogic';
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
  assert.deepEqual(geofenceableStores(stores, 1).map(({ id }) => id), ['zero']);
});

test('geofencing prioritizes stores with qualifying assigned items before applying limits', () => {
  const stores = [store('first', 1, 1), store('second', 2, 2), store('walmart', 3, 3)];
  const items = [item('walmart', 'low')];

  assert.deepEqual(
    geofenceableStores(stores, 2, items).map(({ id }) => id),
    ['walmart', 'first'],
  );
});

test('arrival reminders count only low and expiring items for the entered store', () => {
  const items = [
    item('aldi', 'low'),
    item('aldi', 'expiring'),
    item('aldi', 'stocked'),
    item('other', 'low'),
  ];
  assert.equal(arrivalItemCount(items, 'aldi'), 2);
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

test('decideStoreArrival rejects a store with no assigned items', () => {
  const stores = [store('walmart', NYC.lat, NYC.lng)];
  const items = [item('walmart', 'stocked')];

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
