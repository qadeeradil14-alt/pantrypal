import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hasValidStoreCoordinates, storeBackfillQuery } from '../core/services/storeCoordinates';

const addStoreSheet = readFileSync(new URL('../components/stores/AddStoreSheet.tsx', import.meta.url), 'utf8');
const durableStore = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
const storesScreen = readFileSync(new URL('../app/(tabs)/stores.tsx', import.meta.url), 'utf8');

test('accepts finite coordinates inside the world bounds', () => {
  assert.equal(hasValidStoreCoordinates(38.8462, -77.3064), true);
});

test('rejects missing, non-finite, and out-of-range provider coordinates', () => {
  assert.equal(hasValidStoreCoordinates(undefined, -77.3064), false);
  assert.equal(hasValidStoreCoordinates(Number.NaN, -77.3064), false);
  assert.equal(hasValidStoreCoordinates(38.8462, Number.POSITIVE_INFINITY), false);
  assert.equal(hasValidStoreCoordinates(91, -77.3064), false);
  assert.equal(hasValidStoreCoordinates(38.8462, -181), false);
});

test('uses the saved store name and address for one legacy backfill lookup', () => {
  assert.equal(
    storeBackfillQuery({ name: 'Walmart Food Center', address: '123 Main St, Fairfax, VA' }),
    'Walmart Food Center, 123 Main St, Fairfax, VA',
  );
});

test('rejects incomplete saves and offers legacy location recovery', () => {
  assert.match(addStoreSheet, /if \(!hasValidStoreCoordinates\(input\.lat, input\.lng\)\)/);
  assert.match(durableStore, /Stores require valid latitude and longitude before they can be saved/);
  assert.match(storesScreen, /const backfill = await geocodeLocation\(query\)/);
  assert.match(storesScreen, /text: 'Update location'/);
});
