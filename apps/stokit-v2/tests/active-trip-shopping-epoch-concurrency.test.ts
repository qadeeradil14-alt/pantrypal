import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import {
  invalidateUnobservedPurchasedAssignments,
  normalizeShoppingEpoch,
  observeActiveTripAssignments,
} from '../core/services/shoppingEpoch';
import {
  assignShoppingItemToStore,
  finalizeShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type {
  DurableState,
  PantryItem,
  Receipt,
  SharedShoppingSession,
  ShoppingStoreAssignment,
  Trip,
} from '../types';

const TRIP_ID = 't_active';
const FUTURE_TRIP_ID = 't_future';
const WALMART_ID = 'store_walmart';
const WASHINGTON_ID = 'store_washington';
const ITEM_IDS = ['cod', 'crab', 'salmon', 'shrimp', 'tuna'];

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
};

const receipt: Receipt = {
  id: 'receipt_active',
  tripId: TRIP_ID,
  storeId: WASHINGTON_ID,
  amount: 74,
  status: 'logged',
  createdAt: 300,
};

const trip: Trip = {
  id: TRIP_ID,
  storeIdsVisited: [WASHINGTON_ID],
  skippedStoreIds: [],
  itemsBought: ITEM_IDS.length,
  itemsRemaining: 0,
  itemsOutOfStock: 0,
  receiptIds: [receipt.id],
  totalSpent: receipt.amount,
  breakdown: [{
    storeId: WASHINGTON_ID,
    itemsBought: ITEM_IDS.length,
    amount: receipt.amount,
    receiptId: receipt.id,
    skipped: false,
  }],
  purchasedItems: ITEM_IDS.map((itemId) => ({
    itemId,
    name: itemId,
    storeId: WASHINGTON_ID,
    price: 0,
  })),
  startedAt: 100,
  completedAt: 300,
  duration: 200,
};

function item(
  id: string,
  storeId: string | null,
  updatedAt: number,
  status: PantryItem['status'] = 'low',
  statusClosedTripId?: string,
): PantryItem {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    quantity: 1,
    unit: 'unit',
    status,
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 1,
    updatedAt,
    statusUpdatedAt: updatedAt,
    statusRevision: statusClosedTripId ? 2 : 1,
    statusClosedTripId,
  };
}

function assignment(
  pantryItemId: string,
  storeId: string,
  updatedAt: number,
  shoppingEpoch?: number,
  activeTripId?: string,
): ShoppingStoreAssignment {
  return {
    id: `shopping-store:${pantryItemId}:${storeId}`,
    pantryItemId,
    storeId,
    active: true,
    updatedAt,
    revision: 1,
    assignmentBasedOnShoppingEpoch: shoppingEpoch,
    assignmentBasedOnActiveTripId: activeTripId,
  };
}

function activeSession(tripId = TRIP_ID): SharedShoppingSession {
  return {
    status: 'shopping_store',
    tripId,
    startedAt: 100,
    storeQueue: [WASHINGTON_ID],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: ITEM_IDS.map((pantryItemId) => ({
      entryId: `${tripId}:${pantryItemId}`,
      pantryItemId,
      stopId: `stop:${tripId}:${WASHINGTON_ID}:1`,
      name: pantryItemId,
      quantity: 1,
      unit: 'unit',
      storeId: WASHINGTON_ID,
      picked: false,
    })),
    receipts: [],
    completedTrip: null,
  };
}

function state(input: Partial<DurableState>): DurableState {
  return {
    items: [],
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs,
    activeSession: null,
    shoppingStoreAssignments: [],
    shoppingEpoch: 0,
    activeTripId: null,
    updatedAt: 0,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [],
    ...input,
  };
}

function deviceAActive(): DurableState {
  const session = activeSession();
  return state({
    items: ITEM_IDS.map((id) => item(id, WASHINGTON_ID, 100)),
    activeSession: session,
    shoppingEpoch: 1,
    activeTripId: TRIP_ID,
    shoppingStoreAssignments: observeActiveTripAssignments(
      ITEM_IDS.map((id) => assignment(id, WASHINGTON_ID, 90)),
      session,
      1,
      100,
    ),
    updatedAt: 100,
  });
}

function staleDeviceB(includeUnrelated = false): DurableState {
  return state({
    items: [
      ...ITEM_IDS.map((id) => item(id, WALMART_ID, 200)),
      ...(includeUnrelated ? [item('coffee', WALMART_ID, 210)] : []),
    ],
    shoppingStoreAssignments: ITEM_IDS.map((id) =>
      assignment(id, WALMART_ID, 200, 0),
    ),
    updatedAt: 220,
  });
}

function completeTrip(active: DurableState): DurableState {
  const epoch = normalizeShoppingEpoch(active.shoppingEpoch);
  const filtered = invalidateUnobservedPurchasedAssignments(
    active.shoppingStoreAssignments,
    trip,
    epoch,
  );
  const finalized = trip.purchasedItems.reduce(
    (current, purchased) => finalizeShoppingItemStore(
      current,
      purchased.itemId,
      purchased.storeId,
      trip.id,
      trip.completedAt,
      { shoppingEpoch: epoch, activeTripId: trip.id },
    ),
    filtered,
  );
  const purchasedIds = new Set(ITEM_IDS);
  const remainingIds = new Set(
    finalized.filter((candidate) => candidate.active).map((candidate) => candidate.pantryItemId),
  );
  return {
    ...active,
    items: active.items.map((candidate) =>
      purchasedIds.has(candidate.id) && !remainingIds.has(candidate.id)
        ? item(candidate.id, null, trip.completedAt, 'stocked', trip.id)
        : candidate,
    ),
    receipts: [receipt],
    trips: [trip],
    activeSession: null,
    activeTripId: null,
    shoppingStoreAssignments: finalized,
    closedTripIds: [{ id: TRIP_ID, deletedAt: trip.completedAt }],
    updatedAt: 300,
  };
}

function walmartPlan(stateValue: DurableState) {
  return shoppingEntryDraftsFromAssignments(
    stateValue.items,
    stateValue.shoppingStoreAssignments,
  ).filter((entry) => entry.storeId === WALMART_ID);
}

test('A/B: stale idle bulk assignment is rejected before completion and cannot rebuild Walmart', () => {
  const mergedBeforeCompletion = mergeDurableSnapshotForPush(deviceAActive(), staleDeviceB());
  assert.deepEqual(
    mergedBeforeCompletion.shoppingStoreAssignments
      ?.filter((candidate) => candidate.storeId === WALMART_ID && candidate.active),
    [],
  );

  const completed = completeTrip(mergedBeforeCompletion);
  assert.deepEqual(walmartPlan(completed), []);
  assert.equal(completed.activeSession, null);
  assert.deepEqual(completed.items.map((candidate) => candidate.status), ITEM_IDS.map(() => 'stocked'));
  assert.deepEqual(completed.items.map((candidate) => candidate.storeId), ITEM_IDS.map(() => null));
  assert.deepEqual(completed.receipts, [receipt]);
  assert.deepEqual(completed.trips, [trip]);
});

test('C: an OTA 459-style stale assignment after completion remains causally blocked', () => {
  const completed = completeTrip(deviceAActive());
  const reconnected = mergeDurableSnapshotForPush(completed, staleDeviceB());
  assert.deepEqual(walmartPlan(reconnected), []);
  assert.deepEqual(
    reconnected.items.map((candidate) => [candidate.status, candidate.storeId]),
    ITEM_IDS.map(() => ['stocked', null]),
  );
});

test('D: unrelated pantry edits still merge during the active trip', () => {
  const merged = mergeDurableSnapshotForPush(deviceAActive(), staleDeviceB(true));
  assert.ok(merged.items.some((candidate) => candidate.id === 'coffee'));
  assert.equal(merged.items.find((candidate) => candidate.id === 'cod')?.storeId, WASHINGTON_ID);
});

test('E: a future re-add is allowed only after observing the completed epoch', () => {
  const completed = completeTrip(deviceAActive());
  const tuna = completed.items.find((candidate) => candidate.id === 'tuna')!;
  const observedLow = {
    ...tuna,
    status: 'low' as const,
    storeId: WALMART_ID,
    updatedAt: 400,
    statusUpdatedAt: 400,
    statusRevision: (tuna.statusRevision ?? 0) + 1,
    statusClosedTripId: undefined,
    statusBasedOnClosedTripId: TRIP_ID,
  };
  const readded = {
    ...completed,
    items: completed.items.map((candidate) => candidate.id === tuna.id ? observedLow : candidate),
    shoppingStoreAssignments: assignShoppingItemToStore(
      completed.shoppingStoreAssignments,
      tuna.id,
      WALMART_ID,
      400,
      { shoppingEpoch: 1, activeTripId: null },
    ),
    updatedAt: 400,
  };
  assert.equal(walmartPlan(readded).length, 1);

  const futureSession = activeSession(FUTURE_TRIP_ID);
  const future = {
    ...readded,
    shoppingEpoch: 2,
    activeTripId: FUTURE_TRIP_ID,
    activeSession: futureSession,
    shoppingStoreAssignments: observeActiveTripAssignments(
      readded.shoppingStoreAssignments,
      futureSession,
      2,
      500,
    ),
  };
  assert.equal(future.shoppingEpoch, 2);
  assert.equal(future.activeTripId, FUTURE_TRIP_ID);
});

test('F: two stale reconnects converge in either order without resurrection', () => {
  const completed = completeTrip(deviceAActive());
  const staleOne = staleDeviceB();
  const staleTwo = { ...staleDeviceB(), updatedAt: 230 };
  const firstOrder = mergeDurableSnapshotForPush(
    mergeDurableSnapshotForPush(completed, staleOne),
    staleTwo,
  );
  const secondOrder = mergeDurableSnapshotForPush(
    mergeDurableSnapshotForPush(completed, staleTwo),
    staleOne,
  );
  assert.deepEqual(walmartPlan(firstOrder), []);
  assert.deepEqual(walmartPlan(secondOrder), []);
  assert.equal(firstOrder.activeSession, null);
  assert.equal(secondOrder.activeSession, null);
});

test('G: epoch and terminal state survive serialization and restart', () => {
  const restarted = JSON.parse(JSON.stringify(completeTrip(deviceAActive()))) as DurableState;
  assert.equal(restarted.shoppingEpoch, 1);
  assert.equal(restarted.activeTripId, null);
  assert.deepEqual(walmartPlan(restarted), []);
  assert.deepEqual(restarted.receipts, [receipt]);
});

test('H: missing and malformed legacy metadata fails safe without invalid ordering', () => {
  const legacy = state({
    items: ITEM_IDS.map((id) => item(id, WALMART_ID, 200)),
    shoppingStoreAssignments: ITEM_IDS.map((id) => assignment(id, WALMART_ID, 200)),
    shoppingEpoch: Number.NaN,
    updatedAt: 200,
  });
  const merged = mergeDurableSnapshotForPush(deviceAActive(), legacy);
  assert.equal(merged.shoppingEpoch, 1);
  assert.ok(Number.isFinite(merged.shoppingEpoch));
  assert.deepEqual(
    merged.shoppingStoreAssignments
      ?.filter((candidate) => candidate.storeId === WALMART_ID && candidate.active),
    [],
  );
});

test('I: a stale device replaying its own exact pre-completion session for an already-closed trip is rejected', () => {
  // Regression guard for the server-side gap fixed in
  // 20260804223558_reject_stale_closed_trip_replay.sql: a device that went
  // offline before the trip completed still has its OWN activeSession /
  // activeTripId / active assignments pointing at TRIP_ID, and its own
  // trips/closedTripIds arrays don't know the trip closed. Remote does.
  // The client merge must not treat this as "starting TRIP_ID fresh" —
  // isCompletedShoppingSession checks the UNION of both sides' history, so
  // remote's completion record alone is sufficient regardless of which
  // side is stale.
  const completedRemote = completeTrip(deviceAActive());
  const staleLocalReplay = deviceAActive(); // still has TRIP_ID active, no knowledge of completion

  const merged = mergeDurableSnapshotForPush(completedRemote, staleLocalReplay);

  assert.equal(merged.activeSession, null);
  assert.equal(merged.activeTripId, null);
  assert.equal(merged.shoppingEpoch, 1, 'replay of the same closed trip must not bump the epoch');
  assert.deepEqual(
    merged.items.map((candidate) => [candidate.status, candidate.storeId]),
    ITEM_IDS.map(() => ['stocked', null]),
    'completion markers survive the stale replay',
  );
  assert.deepEqual(
    merged.shoppingStoreAssignments?.filter((candidate) => candidate.active),
    [],
    'no assignment tied to the closed trip is left active',
  );
  assert.deepEqual(merged.receipts, [receipt], 'receipt history survives the stale replay');
  assert.deepEqual(merged.trips, [trip], 'trip history survives the stale replay');

  // Repeated replay is idempotent.
  const mergedAgain = mergeDurableSnapshotForPush(merged, staleLocalReplay);
  assert.equal(mergedAgain.activeSession, null);
  assert.equal(mergedAgain.activeTripId, null);
  assert.equal(mergedAgain.shoppingEpoch, 1);
  assert.deepEqual(
    mergedAgain.shoppingStoreAssignments?.filter((candidate) => candidate.active),
    [],
  );
});

test('J: a genuinely new future trip id still starts normally after a completed trip', () => {
  const completed = completeTrip(deviceAActive());
  const futureSession = activeSession(FUTURE_TRIP_ID);
  const futureLocal = {
    ...completed,
    activeSession: futureSession,
    shoppingEpoch: 1,
    activeTripId: FUTURE_TRIP_ID,
    updatedAt: 500,
  };
  const merged = mergeDurableSnapshotForPush(completed, futureLocal);
  assert.equal(merged.activeTripId, FUTURE_TRIP_ID);
  assert.equal(merged.activeSession?.tripId, FUTURE_TRIP_ID);
});
