import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import { nextShoppingStatusRevision } from '../core/services/shoppingEpoch';
import { assignShoppingItemToStore, shoppingEntryDraftsFromAssignments } from '../core/services/shoppingStoreAssignments';
import type { DurableState, PantryItem, ShoppingStoreAssignment, Trip } from '../types';

const TRIP_ID = 'trip-complete';
const WALMART = 'store-walmart';
const ITEM_IDS = ['apple', 'banana', 'orange'];

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
};

const trip: Trip = {
  id: TRIP_ID,
  storeIdsVisited: [WALMART],
  skippedStoreIds: [],
  itemsBought: ITEM_IDS.length,
  itemsRemaining: 0,
  itemsOutOfStock: 0,
  receiptIds: [],
  totalSpent: 0,
  breakdown: [],
  purchasedItems: ITEM_IDS.map((itemId) => ({ itemId, name: itemId, storeId: WALMART, price: 0 })),
  startedAt: 100,
  completedAt: 200,
  duration: 100,
};

function completedState(): DurableState {
  const items: PantryItem[] = ITEM_IDS.map((id) => ({
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status: 'stocked',
    storageLocation: 'fridge',
    storeId: null,
    expiryDate: null,
    createdAt: 1,
    updatedAt: 200,
    statusUpdatedAt: 200,
    statusRevision: 2,
    statusClosedTripId: TRIP_ID,
  }));
  const shoppingStoreAssignments: ShoppingStoreAssignment[] = ITEM_IDS.map((pantryItemId) => ({
    id: `shopping-store:${pantryItemId}:${WALMART}`,
    pantryItemId,
    storeId: WALMART,
    active: false,
    updatedAt: 200,
    revision: 2,
    closedTripId: TRIP_ID,
    assignmentBasedOnShoppingEpoch: 4,
    assignmentBasedOnActiveTripId: TRIP_ID,
  }));
  return {
    items,
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [trip],
    activity: [],
    prefs,
    activeSession: null,
    shoppingEpoch: 4,
    activeTripId: null,
    shoppingStoreAssignments,
    updatedAt: 200,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [{ id: TRIP_ID, deletedAt: 200 }],
  };
}

function intentionallyReadd(
  completed: DurableState,
  itemMarkersPresent: boolean,
  tripHistoryPresent = true,
): DurableState {
  const observed = {
    ...completed,
    items: itemMarkersPresent
      ? completed.items
      : completed.items.map(({ statusClosedTripId: _statusClosedTripId, ...item }) => item),
    trips: tripHistoryPresent ? completed.trips : [],
  };
  const markedLowItems = observed.items.map((item) => ({
    ...item,
    status: 'low' as const,
    updatedAt: 300,
    statusUpdatedAt: 300,
    ...nextShoppingStatusRevision(item, observed),
  }));
  const markedLow = { ...observed, items: markedLowItems, updatedAt: 300 };
  const assignedItems = markedLow.items.map((item) => ({
    ...item,
    storeId: WALMART,
    updatedAt: 400,
    statusUpdatedAt: 400,
    ...nextShoppingStatusRevision(item, markedLow),
  }));
  const assignments = assignedItems.reduce(
    (current, item) => assignShoppingItemToStore(
      current,
      item.id,
      WALMART,
      400,
      { shoppingEpoch: 4, activeTripId: null },
    ),
    markedLow.shoppingStoreAssignments ?? [],
  );
  return {
    ...markedLow,
    items: assignedItems,
    shoppingStoreAssignments: assignments,
    updatedAt: 400,
  };
}

function assertLegitimateReadd(state: DurableState) {
  assert.deepEqual(state.items.map((item) => item.status), ITEM_IDS.map(() => 'low'));
  assert.deepEqual(state.items.map((item) => item.statusClosedTripId), ITEM_IDS.map(() => undefined));
  assert.deepEqual(state.items.map((item) => item.statusBasedOnClosedTripId), ITEM_IDS.map(() => TRIP_ID));
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments(state.items, state.shoppingStoreAssignments).map((entry) => entry.pantryItemId).sort(),
    [...ITEM_IDS].sort(),
  );
}

test('completed items intentionally marked low and bulk-assigned offline survive both merge orders', () => {
  const completed = completedState();
  const offlineReadd = intentionallyReadd(completed, true);

  assertLegitimateReadd(mergeDurableSnapshotForPush(completed, offlineReadd));
  assertLegitimateReadd(mergeDurableSnapshotForPush(offlineReadd, completed));
});

test('ordinary re-add recovers causality from observed trip history when the item marker is missing', () => {
  const completed = completedState();
  const offlineReadd = intentionallyReadd(completed, false);

  assertLegitimateReadd(mergeDurableSnapshotForPush(completed, offlineReadd));
  assertLegitimateReadd(mergeDurableSnapshotForPush(offlineReadd, completed));
});

test('ordinary re-add recovers causality from a closed assignment when trip history is unavailable', () => {
  const completed = completedState();
  const offlineReadd = intentionallyReadd(completed, false, false);

  assertLegitimateReadd(mergeDurableSnapshotForPush(completed, offlineReadd));
  assertLegitimateReadd(mergeDurableSnapshotForPush(offlineReadd, completed));
});

test('an item with no observed completion evidence does not receive a causal marker', () => {
  const completed = completedState();
  const item = completed.items[0];
  const unknown = {
    ...completed,
    items: [],
    trips: [],
    shoppingStoreAssignments: [],
  };
  const { statusClosedTripId: _statusClosedTripId, statusBasedOnClosedTripId: _statusBasedOnClosedTripId, ...unstamped } = item;

  assert.equal(nextShoppingStatusRevision(unstamped, unknown).statusBasedOnClosedTripId, undefined);
});

test('unstamped stale replay remains rejected in both merge orders', () => {
  const completed = completedState();
  const staleReplay: DurableState = {
    ...completed,
    items: completed.items.map(({ statusClosedTripId: _statusClosedTripId, ...item }) => ({
      ...item,
      status: 'low',
      storeId: WALMART,
      updatedAt: 500,
      statusUpdatedAt: 500,
    })),
    shoppingStoreAssignments: ITEM_IDS.map((pantryItemId) => ({
      id: `shopping-store:${pantryItemId}:${WALMART}`,
      pantryItemId,
      storeId: WALMART,
      active: true,
      updatedAt: 500,
      revision: 1,
      assignmentBasedOnShoppingEpoch: 3,
    })),
    trips: [],
    updatedAt: 500,
  };

  for (const merged of [
    mergeDurableSnapshotForPush(completed, staleReplay),
    mergeDurableSnapshotForPush(staleReplay, completed),
  ]) {
    assert.deepEqual(merged.items.map((item) => item.status), ITEM_IDS.map(() => 'stocked'));
    assert.deepEqual(shoppingEntryDraftsFromAssignments(merged.items, merged.shoppingStoreAssignments), []);
  }
});
