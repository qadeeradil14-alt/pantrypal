import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../app/(tabs)/settings.tsx', import.meta.url), 'utf8');
const about = readFileSync(new URL('../app/settings/about.tsx', import.meta.url), 'utf8');
const storeArrivalAlerts = readFileSync(new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url), 'utf8');
const stores = readFileSync(new URL('../app/(tabs)/stores.tsx', import.meta.url), 'utf8');
const subScreenHeader = readFileSync(new URL('../components/shared/SubScreenHeader.tsx', import.meta.url), 'utf8');

test('Home routes avatars to Household and gear to Settings', () => {
  assert.match(home, /<MemberAvatars members=\{members\} onPress=\{\(\) => router\.push\('\/household'\)\} \/>/);
  assert.match(home, /router\.push\('\/settings'\)/);
  assert.doesNotMatch(home, /OTA_SEQ|expo-updates|syncPill/);
});

test('Settings routes Household & roles to the canonical Household screen', () => {
  assert.match(settings, /label: 'Household & roles', route: '\/household'/);
});

test('subscreens go back when possible and fall back to Settings', () => {
  assert.match(subScreenHeader, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/settings'\)/);
});

test('version and OTA information live under About', () => {
  assert.match(about, /OTA_SEQ/);
  assert.match(about, /title="About"/);
});

test('Store Arrival Alerts fix-location actions route to the Stores tab', () => {
  assert.match(storeArrivalAlerts, /pathname: '\/\(tabs\)\/stores'/);
  assert.match(storeArrivalAlerts, /fixLocationStoreId/);
  assert.match(storeArrivalAlerts, /fixLocationRequest: String\(Date\.now\(\)\)/);
  assert.match(stores, /useGlobalSearchParams/);
  assert.match(stores, /handledFixLocationRef\.current === fixLocationRequest/);
  assert.match(stores, /setLocationRecoveryStore\(store\)/);
  assert.match(stores, /setAddOpen\(true\)/);
});

test('Store Arrival Alerts distinguishes missing coordinates from missing shopping items', () => {
  assert.match(storeArrivalAlerts, /if \(value && gpsStores\.length === 0\)/);
  assert.match(storeArrivalAlerts, /if \(value && monitorableStores\.length === 0\)/);
  assert.match(storeArrivalAlerts, /No shopping items assigned/);
  assert.match(storeArrivalAlerts, /pathname: '\/\(tabs\)\/shopping'/);
  assert.match(storeArrivalAlerts, /text: 'Add item'/);
});
