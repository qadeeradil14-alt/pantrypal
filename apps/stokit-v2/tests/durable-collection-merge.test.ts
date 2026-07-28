import assert from 'node:assert/strict';
import test from 'node:test';

import type { DurableState, SharedShoppingSession } from '../types';
import { mergeDurableSnapshotForPush, hasLocalSyncContribution } from '../core/services/mergeDurableSnapshot';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';

const state = (patch: Partial<DurableState> = {}): DurableState => ({
  items: [],
  stores: [],
  priceHistory: [],
  receipts: [],
  trips: [],
  activity: [],
  prefs: {
    householdName: 'Home',
    defaultUnit: 'unit',
    expiringWindowDays: 3,
    weeklyBudget: 200,
  },
  activeSession: null,
  updatedAt: 1,
  deletedItems: [],
  deletedStores: [],
  deletedTrips: [],
  deletedReceipts: [],
  closedTripIds: [],
  prefsUpdatedAt: {},
  ...patch,
});

test('concurrent records from every durable collection survive one snapshot merge', () => {
  const remote = state({
    stores: [{ id: 'remote-store', name: 'Remote', createdAt: 10, updatedAt: 10 }],
    priceHistory: [{ id: 'remote-price', itemId: 'i', itemName: 'Milk', storeId: 'remote-store', price: 2, paidAt: 10 }],
    receipts: [{ id: 'remote-receipt', tripId: 'remote-trip', storeId: 'remote-store', amount: 2, status: 'logged', createdAt: 10, updatedAt: 10 }],
    trips: [{ id: 'remote-trip', storeIdsVisited: ['remote-store'], skippedStoreIds: [], itemsBought: 1, itemsRemaining: 0, itemsOutOfStock: 0, receiptIds: ['remote-receipt'], totalSpent: 2, breakdown: [], purchasedItems: [], startedAt: 1, completedAt: 10, duration: 9 }],
    activity: [{ id: 'remote-activity', type: 'store_added', message: 'Remote', createdAt: 10 }],
    updatedAt: 10,
  });
  const local = state({
    stores: [{ id: 'local-store', name: 'Local', createdAt: 20, updatedAt: 20 }],
    priceHistory: [{ id: 'local-price', itemId: 'i', itemName: 'Milk', storeId: 'local-store', price: 3, paidAt: 20 }],
    receipts: [{ id: 'local-receipt', tripId: 'local-trip', storeId: 'local-store', amount: 3, status: 'logged', createdAt: 20, updatedAt: 20 }],
    trips: [{ id: 'local-trip', storeIdsVisited: ['local-store'], skippedStoreIds: [], itemsBought: 1, itemsRemaining: 0, itemsOutOfStock: 0, receiptIds: ['local-receipt'], totalSpent: 3, breakdown: [], purchasedItems: [], startedAt: 11, completedAt: 20, duration: 9 }],
    activity: [{ id: 'local-activity', type: 'store_added', message: 'Local', createdAt: 20 }],
    updatedAt: 20,
  });

  const merged = mergeDurableSnapshotForPush(remote, local);
  assert.deepEqual(merged.stores.map((entry) => entry.id).sort(), ['local-store', 'remote-store']);
  assert.deepEqual(merged.priceHistory.map((entry) => entry.id).sort(), ['local-price', 'remote-price']);
  assert.deepEqual(merged.receipts.map((entry) => entry.id).sort(), ['local-receipt', 'remote-receipt']);
  assert.deepEqual(merged.trips.map((entry) => entry.id).sort(), ['local-trip', 'remote-trip']);
  assert.deepEqual(merged.activity.map((entry) => entry.id).sort(), ['local-activity', 'remote-activity']);
});

test('store, trip and receipt tombstones defeat stale copies', () => {
  const timestamp = Date.now();
  const remote = state({
    stores: [{ id: 'store', name: 'Old', createdAt: timestamp - 10, updatedAt: timestamp - 10 }],
    receipts: [{ id: 'receipt', tripId: 'trip', storeId: 'store', amount: 2, status: 'logged', createdAt: timestamp - 10 }],
    trips: [{ id: 'trip', storeIdsVisited: ['store'], skippedStoreIds: [], itemsBought: 1, itemsRemaining: 0, itemsOutOfStock: 0, receiptIds: ['receipt'], totalSpent: 2, breakdown: [], purchasedItems: [], startedAt: timestamp - 20, completedAt: timestamp - 10, duration: 10 }],
  });
  const local = state({
    deletedStores: [{ id: 'store', deletedAt: timestamp }],
    deletedTrips: [{ id: 'trip', deletedAt: timestamp }],
    deletedReceipts: [{ id: 'receipt', deletedAt: timestamp }],
    updatedAt: timestamp,
  });
  const merged = mergeDurableSnapshotForPush(remote, local);
  assert.deepEqual(merged.stores, []);
  assert.deepEqual(merged.trips, []);
  assert.deepEqual(merged.receipts, []);
});

test('preference fields merge independently', () => {
  const remote = state({
    prefs: { householdName: 'Family', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 200 },
    prefsUpdatedAt: { householdName: 10 },
    updatedAt: 10,
  });
  const local = state({
    prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 500 },
    prefsUpdatedAt: { weeklyBudget: 20 },
    updatedAt: 20,
  });
  const merged = mergeDurableSnapshotForPush(remote, local);
  assert.equal(merged.prefs.householdName, 'Family');
  assert.equal(merged.prefs.weeklyBudget, 500);
});

test('non-item durable changes count as a local sync contribution', () => {
  const remote = state({ updatedAt: 10 });
  const local = state({
    stores: [{ id: 'store', name: 'Kabul Halal', createdAt: 11, updatedAt: 11 }],
    updatedAt: 10,
  });
  assert.equal(hasLocalSyncContribution(remote, local), true);
});

test('a newer unskip defeats a stale skipped-store copy', () => {
  const base: SharedShoppingSession = {
    status: 'next_store_ready',
    tripId: 'trip',
    startedAt: 1,
    storeQueue: ['a', 'b'],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: [],
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  };
  const stale: SharedShoppingSession = { ...base, skippedStoreIds: ['b'], skippedAt: { b: 10 } };
  const unskipped: SharedShoppingSession = { ...base, unskippedAt: { b: 20 } };
  assert.deepEqual(foldRemoteActiveSession(stale, unskipped).skippedStoreIds, []);
});

test('a stamped re-add defeats a legacy untimestamped tombstone', () => {
  const base: SharedShoppingSession = {
    status: 'shopping_store',
    tripId: 'trip',
    startedAt: 1,
    storeQueue: ['store'],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: [],
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  };
  const stale: SharedShoppingSession = { ...base, removedItemIds: ['item'] };
  const readded: SharedShoppingSession = {
    ...base,
    entries: [{ itemId: 'item', name: 'Milk', quantity: 1, unit: 'unit' as const, storeId: 'store', picked: false, addedAt: 20 }],
  };
  const merged = foldRemoteActiveSession(stale, readded);
  assert.equal(merged.entries.some((entry) => entry.itemId === 'item'), true);
  assert.deepEqual(merged.removedItemIds, []);
});
