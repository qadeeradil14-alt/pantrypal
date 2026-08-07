import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import type { DurableState, PantryItem, SharedShoppingSession, Trip } from '../types';

const item = (id: string, status: PantryItem['status'], storeId: string | null, updatedAt: number): PantryItem => ({
  id, name: id, quantity: 1, unit: 'unit', status, storeId, storageLocation: 'pantry', expiryDate: null,
  createdAt: 1, updatedAt,
});

const session = (): SharedShoppingSession => ({
  status: 'shopping_store', tripId: 'fair-price-trip', startedAt: 1, storeQueue: ['fair-price'],
  currentIndex: 0, skippedStoreIds: [], removedEntryIds: [], receipts: [], completedTrip: null,
  entries: ['banana', 'cod', 'salmon'].map((pantryItemId) => ({
    entryId: pantryItemId,
    pantryItemId,
    stopId: 'stop:fair-price-trip:fair-price:1',
    name: pantryItemId,
    quantity: 1,
    unit: 'unit',
    storeId: 'fair-price',
    picked: false,
  })),
});

const completedTrip: Trip = {
  id: 'fair-price-trip', storeIdsVisited: ['fair-price'], skippedStoreIds: [], itemsBought: 2,
  itemsRemaining: 1, itemsOutOfStock: 0, receiptIds: ['receipt'], totalSpent: 2,
  breakdown: [], purchasedItems: [], startedAt: 1, completedAt: 2, duration: 1,
};

const state = (items: PantryItem[], activeSession: SharedShoppingSession | null, trips: Trip[], updatedAt: number): DurableState => ({
  items, stores: [], priceHistory: [], receipts: [], trips, activity: [],
  prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 0 },
  activeSession, updatedAt, deletedItems: [],
});

test('completed Fair Price receipt cannot be overwritten by a stale device and rebuild the queue', () => {
  const completed = state(
    ['banana', 'cod', 'salmon'].map((id) => item(id, 'stocked', null, 20)),
    null,
    [completedTrip],
    200,
  );
  const stale = state(
    ['banana', 'cod', 'salmon'].map((id) => item(id, 'low', 'fair-price', 10)),
    session(),
    [],
    100,
  );

  const merged = mergeDurableSnapshotForPush(completed, stale);

  assert.equal(merged.activeSession, null);
  assert.deepEqual(merged.items.map(({ status, storeId }) => ({ status, storeId })), [
    { status: 'stocked', storeId: null },
    { status: 'stocked', storeId: null },
    { status: 'stocked', storeId: null },
  ]);
});

test('a newer stale active session cannot masquerade as a reopen after remote completion', () => {
  const remoteCompleted = state(
    ['banana', 'cod', 'salmon'].map((id) => item(id, 'stocked', null, 20)),
    null,
    [completedTrip],
    200,
  );
  const locallyReopened = state(
    ['banana', 'cod', 'salmon'].map((id) => item(id, 'stocked', null, 20)),
    session(),
    [],
    201,
  );

  const merged = mergeDurableSnapshotForPush(remoteCompleted, locallyReopened);

  assert.equal(merged.activeSession, null);
  assert.deepEqual(merged.trips, [completedTrip]);
});

test('a newer unrelated item snapshot cannot suppress a valid active trip', () => {
  const activeTrip = state(
    ['banana'].map((id) => item(id, 'low', 'fair-price', 20)),
    session(),
    [],
    100,
  );
  const newerWithoutSession = state(
    ['banana', 'mango'].map((id) => item(id, 'low', 'fair-price', 30)),
    null,
    [],
    200,
  );

  const merged = mergeDurableSnapshotForPush(activeTrip, newerWithoutSession);

  assert.equal(merged.activeSession?.tripId, 'fair-price-trip');
  assert.deepEqual(merged.items.map((value) => value.id).sort(), ['banana', 'mango']);
});

test('snapshot writes use compare-and-set instead of unconditional upsert', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  // The CAS write now lives in performHouseholdPushAttempt (the household
  // push coordinator's single-attempt worker); pushLocalState itself only
  // enqueues onto the coordinator.
  const push = source.slice(source.indexOf('async function performHouseholdPushAttempt'), source.indexOf('export async function pullFromSupabase'));

  assert.match(push, /mergeDurableSnapshotForPush\(remote, localSnapshot\)/);
  assert.match(push, /\.eq\('updated_at', remoteUpdatedAt\)/);
  assert.doesNotMatch(push, /\.upsert\(/);
});
