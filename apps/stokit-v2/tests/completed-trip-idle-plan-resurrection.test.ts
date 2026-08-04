import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
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

const TRIP_ID = 't_washington';
const STORE_ID = 'store_washington';
const ITEM_IDS = ['chicken', 'cod', 'tuna'];

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
};

function item(
  id: string,
  status: PantryItem['status'],
  storeId: string | null,
  stamp: number,
  statusRevision?: number,
  statusClosedTripId?: string,
  statusBasedOnClosedTripId?: string,
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
    updatedAt: stamp,
    statusUpdatedAt: stamp,
    statusRevision,
    statusClosedTripId,
    statusBasedOnClosedTripId,
  };
}

function assignments(
  active: boolean,
  stamp: number,
  revision?: number,
  closedTripId?: string,
  basedOnClosedTripId?: string,
): ShoppingStoreAssignment[] {
  return ITEM_IDS.map((pantryItemId) => ({
    id: `shopping-store:${pantryItemId}:${STORE_ID}`,
    pantryItemId,
    storeId: STORE_ID,
    active,
    updatedAt: stamp,
    revision,
    closedTripId,
    basedOnClosedTripId,
  }));
}

function staleSession(): SharedShoppingSession {
  return {
    status: 'shopping_store',
    tripId: TRIP_ID,
    startedAt: 10,
    storeQueue: [STORE_ID],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: ITEM_IDS.map((pantryItemId) => ({
      entryId: pantryItemId,
      pantryItemId,
      stopId: `stop:${TRIP_ID}:${STORE_ID}:1`,
      name: pantryItemId,
      quantity: 1,
      unit: 'unit',
      storeId: STORE_ID,
      picked: false,
    })),
    receipts: [],
    completedTrip: null,
  };
}

const receipt: Receipt = {
  id: 'receipt_washington',
  tripId: TRIP_ID,
  storeId: STORE_ID,
  amount: 74.21,
  status: 'logged',
  createdAt: 200,
};

const trip: Trip = {
  id: TRIP_ID,
  storeIdsVisited: [STORE_ID],
  skippedStoreIds: [],
  itemsBought: 3,
  itemsRemaining: 0,
  itemsOutOfStock: 0,
  receiptIds: [receipt.id],
  totalSpent: receipt.amount,
  breakdown: [{ storeId: STORE_ID, itemsBought: 3, amount: receipt.amount, receiptId: receipt.id, skipped: false }],
  purchasedItems: ITEM_IDS.map((itemId) => ({ itemId, name: itemId, storeId: STORE_ID, price: 0 })),
  startedAt: 10,
  completedAt: 200,
  duration: 190,
};

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
    updatedAt: 0,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [],
    ...input,
  };
}

function ota458MergeItems(remote: PantryItem[], local: PantryItem[]): PantryItem[] {
  const byId = new Map<string, PantryItem>();
  for (const candidate of [...remote, ...local]) {
    const existing = byId.get(candidate.id);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }
    const base = candidate.updatedAt > existing.updatedAt ? candidate : existing;
    const existingStatusAt = existing.statusUpdatedAt;
    const incomingStatusAt = candidate.statusUpdatedAt;
    const statusWinner = incomingStatusAt === existingStatusAt
      ? (candidate.updatedAt > existing.updatedAt ? candidate : existing)
      : (incomingStatusAt ?? -Infinity) > (existingStatusAt ?? -Infinity)
        ? candidate
        : existing;
    byId.set(candidate.id, {
      ...base,
      status: statusWinner.status,
      storeId: statusWinner.storeId,
      statusUpdatedAt: statusWinner.statusUpdatedAt,
    });
  }
  return [...byId.values()];
}

function ota458MergeAssignments(
  remote: ShoppingStoreAssignment[],
  local: ShoppingStoreAssignment[],
): ShoppingStoreAssignment[] {
  const byId = new Map<string, ShoppingStoreAssignment>();
  for (const assignment of [...remote, ...local]) {
    const existing = byId.get(assignment.id);
    if (
      !existing ||
      assignment.updatedAt > existing.updatedAt ||
      (assignment.updatedAt === existing.updatedAt && assignment.active && !existing.active)
    ) byId.set(assignment.id, assignment);
  }
  return [...byId.values()];
}

test('a stale device with misleading newer clocks cannot rebuild a completed trip as Ready to shop', () => {
  const completed = state({
    items: ITEM_IDS.map((id) => item(id, 'stocked', null, 200, 2, TRIP_ID)),
    receipts: [receipt],
    trips: [trip],
    shoppingStoreAssignments: assignments(false, 200, 2, TRIP_ID),
    closedTripIds: [{ id: TRIP_ID, deletedAt: 200 }],
    updatedAt: 300,
  });
  const staleDevice = state({
    items: [
      ...ITEM_IDS.map((id) => item(id, 'low', STORE_ID, 900, 999)),
      item('unrelated', 'low', null, 999),
    ],
    activeSession: staleSession(),
    shoppingStoreAssignments: assignments(true, 900, 999),
    updatedAt: 999,
  });

  const afterFirstReconnect = mergeDurableSnapshotForPush(completed, staleDevice);
  const afterSecondReconnect = mergeDurableSnapshotForPush(afterFirstReconnect, {
    ...staleDevice,
    updatedAt: 1000,
  });
  const washingtonPlan = shoppingEntryDraftsFromAssignments(
    afterSecondReconnect.items,
    afterSecondReconnect.shoppingStoreAssignments,
  ).filter((entry) => entry.storeId === STORE_ID);

  assert.equal(afterSecondReconnect.activeSession, null);
  assert.deepEqual(washingtonPlan, []);
  assert.deepEqual(
    ITEM_IDS.map((id) => afterSecondReconnect.items.find((candidate) => candidate.id === id)?.status),
    ['stocked', 'stocked', 'stocked'],
  );
  assert.deepEqual(afterSecondReconnect.receipts, [receipt]);
  assert.deepEqual(afterSecondReconnect.trips, [trip]);
  assert.ok(afterSecondReconnect.items.some((candidate) => candidate.id === 'unrelated'));
});

test('OTA 459 receiving an OTA 458 snapshot preserves completion across serialization and restart', () => {
  const completed = state({
    items: ITEM_IDS.map((id) => item(id, 'stocked', null, 200, 2, TRIP_ID)),
    receipts: [receipt],
    trips: [trip],
    shoppingStoreAssignments: assignments(false, 200, 2, TRIP_ID),
    closedTripIds: [{ id: TRIP_ID, deletedAt: 200 }],
    updatedAt: 300,
  });
  const ota458 = state({
    items: ITEM_IDS.map((id) => item(id, 'low', STORE_ID, 900)),
    activeSession: staleSession(),
    shoppingStoreAssignments: assignments(true, 900),
    updatedAt: 900,
  });

  const merged = mergeDurableSnapshotForPush(completed, ota458);
  const restarted = JSON.parse(JSON.stringify(merged)) as DurableState;
  const afterLoginSync = mergeDurableSnapshotForPush(restarted, ota458);
  const plan = shoppingEntryDraftsFromAssignments(
    afterLoginSync.items,
    afterLoginSync.shoppingStoreAssignments,
  );
  assert.equal(afterLoginSync.activeSession, null);
  assert.equal(plan.some((entry) => entry.storeId === STORE_ID), false);
  assert.deepEqual(afterLoginSync.receipts, [receipt]);
});

test('OTA 458 produces the stale payload that the database guard must sanitize', () => {
  const completedItems = ITEM_IDS.map((id) => item(id, 'stocked', null, 200, 2, TRIP_ID));
  const completedAssignments = assignments(false, 200, 2, TRIP_ID);
  const ota458Items = ITEM_IDS.map((id) => item(id, 'low', STORE_ID, 900));
  const ota458Assignments = assignments(true, 900);

  const writtenItems = ota458MergeItems(completedItems, ota458Items);
  const writtenAssignments = ota458MergeAssignments(completedAssignments, ota458Assignments);
  const plan = shoppingEntryDraftsFromAssignments(writtenItems, writtenAssignments);

  assert.equal(plan.length, 3);
  assert.ok(writtenItems.every((candidate) => candidate.statusClosedTripId === undefined));
  assert.ok(writtenAssignments.every((assignment) => assignment.closedTripId === undefined));
});

test('two stale devices reconnecting in either order stay unable to restore the completed plan', () => {
  const completed = state({
    items: ITEM_IDS.map((id) => item(id, 'stocked', null, 200, 2, TRIP_ID)),
    receipts: [receipt],
    trips: [trip],
    shoppingStoreAssignments: assignments(false, 200, 2, TRIP_ID),
    closedTripIds: [{ id: TRIP_ID, deletedAt: 200 }],
    updatedAt: 300,
  });
  const phone = state({
    items: ITEM_IDS.map((id) => item(id, 'low', STORE_ID, 800)),
    activeSession: staleSession(),
    shoppingStoreAssignments: assignments(true, 800),
    updatedAt: 800,
  });
  const ipad = state({
    items: [...ITEM_IDS.map((id) => item(id, 'low', STORE_ID, 900)), item('new', 'low', null, 901)],
    activeSession: staleSession(),
    shoppingStoreAssignments: assignments(true, 900),
    updatedAt: 901,
  });
  for (const order of [[phone, ipad], [ipad, phone]]) {
    const merged = order.reduce(mergeDurableSnapshotForPush, completed);
    const plan = shoppingEntryDraftsFromAssignments(merged.items, merged.shoppingStoreAssignments);
    assert.equal(merged.activeSession, null);
    assert.equal(plan.some((entry) => entry.storeId === STORE_ID), false);
    assert.ok(merged.items.some((candidate) => candidate.id === 'new'));
  }
});

test('terminal assignment finalization is idempotent and a later explicit re-add advances revision', () => {
  const finalized = finalizeShoppingItemStore([], 'tuna', STORE_ID, TRIP_ID, 200);
  const duplicate = finalizeShoppingItemStore(finalized, 'tuna', STORE_ID, TRIP_ID, 201);
  assert.deepEqual(duplicate, finalized);
  assert.equal(finalized[0].active, false);
  assert.equal(finalized[0].revision, 1);
  assert.equal(finalized[0].closedTripId, TRIP_ID);

  const readded = assignShoppingItemToStore(finalized, 'tuna', STORE_ID, 300);
  assert.equal(readded[0].active, true);
  assert.equal(readded[0].revision, 2);
  assert.equal(readded[0].closedTripId, undefined);
  assert.equal(readded[0].basedOnClosedTripId, TRIP_ID);

  const futureFinalized = finalizeShoppingItemStore(readded, 'tuna', STORE_ID, 't_future', 400);
  assert.equal(futureFinalized[0].active, false);
  assert.equal(futureFinalized[0].revision, 3);
  assert.equal(futureFinalized[0].closedTripId, 't_future');
  assert.equal(futureFinalized[0].basedOnClosedTripId, TRIP_ID);
});

test('a genuine later need and future trip at Washington use a newer causal revision', () => {
  const completed = state({
    items: [item('tuna', 'stocked', null, 200, 2, TRIP_ID)],
    receipts: [receipt],
    trips: [trip],
    shoppingStoreAssignments: assignments(false, 200, 2, TRIP_ID).filter((entry) => entry.pantryItemId === 'tuna'),
    closedTripIds: [{ id: TRIP_ID, deletedAt: 200 }],
    updatedAt: 300,
  });
  const futureTunaAssignment = assignShoppingItemToStore(
    completed.shoppingStoreAssignments,
    'tuna',
    STORE_ID,
    301,
  );
  const future = state({
    items: [
      item('tuna', 'low', STORE_ID, 301, 3, undefined, TRIP_ID),
      item('salmon', 'low', STORE_ID, 301, 1),
    ],
    shoppingStoreAssignments: [
      ...futureTunaAssignment,
      {
        id: `shopping-store:salmon:${STORE_ID}`,
        pantryItemId: 'salmon',
        storeId: STORE_ID,
        active: true,
        updatedAt: 301,
        revision: 1,
      },
    ],
    updatedAt: 301,
  });

  const merged = mergeDurableSnapshotForPush(completed, future);
  const plan = shoppingEntryDraftsFromAssignments(merged.items, merged.shoppingStoreAssignments);
  assert.deepEqual(plan.map((entry) => entry.pantryItemId).sort(), ['salmon', 'tuna']);
  assert.equal(merged.activeSession, null);
  assert.deepEqual(merged.receipts, [receipt]);
});
