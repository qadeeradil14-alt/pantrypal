import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { arrivalItemCount, geofenceableStores } from '../core/services/geofencingLogic';
import type { PantryItem, Store } from '../types';

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

test('arrival reminders count only low and expiring items for the entered store', () => {
  const items = [
    item('aldi', 'low'),
    item('aldi', 'expiring'),
    item('aldi', 'stocked'),
    item('other', 'low'),
  ];
  assert.equal(arrivalItemCount(items, 'aldi'), 2);
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
