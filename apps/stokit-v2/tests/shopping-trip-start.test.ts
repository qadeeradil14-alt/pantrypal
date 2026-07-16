import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resetShoppingTripStartGuard,
  startShoppingTripOnce,
} from '../core/services/shoppingTripStart';

const pendingEffects = () => new Promise<void>((resolve) => setImmediate(resolve));

const usedTripIds: string[] = [];

afterEach(() => {
  usedTripIds.splice(0).forEach(resetShoppingTripStartGuard);
});

test('successful trip start triggers one household alert', async () => {
  const tripId = 'trip-success';
  usedTripIds.push(tripId);
  let starts = 0;
  let alerts = 0;

  const started = startShoppingTripOnce({
    tripId,
    startTrip: () => { starts += 1; },
    notifyHousehold: async () => { alerts += 1; },
  });

  assert.equal(started, true);
  assert.equal(starts, 1);
  await pendingEffects();
  assert.equal(alerts, 1);
});

test('notification failure does not prevent trip start', async () => {
  const tripId = 'trip-notification-failure';
  usedTripIds.push(tripId);
  let starts = 0;

  const started = startShoppingTripOnce({
    tripId,
    startTrip: () => { starts += 1; },
    notifyHousehold: async () => { throw new Error('push unavailable'); },
  });

  assert.equal(started, true);
  assert.equal(starts, 1);
  await pendingEffects();
  assert.equal(starts, 1);
});

test('duplicate trip-start invocation does not send duplicate alerts', async () => {
  const tripId = 'trip-duplicate';
  usedTripIds.push(tripId);
  let starts = 0;
  let alerts = 0;
  const options = {
    tripId,
    startTrip: () => { starts += 1; },
    notifyHousehold: async () => { alerts += 1; },
  };

  assert.equal(startShoppingTripOnce(options), true);
  assert.equal(startShoppingTripOnce(options), false);
  await pendingEffects();

  assert.equal(starts, 1);
  assert.equal(alerts, 1);
});

test('trip-start paths stay silent while Notify Family remains explicit', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /if \(tripStartIdRef\.current\) return;/);
  assert.match(source, /startTripAt\(entries\[0\]\[0\]\)/);
  assert.match(source, /startTripAt\(storeId\)/);
  assert.match(source, /startTripAt\(arrivalStoreId\);/);
  assert.doesNotMatch(source, /startTripAt\([^\n]+, true\)/);
});
