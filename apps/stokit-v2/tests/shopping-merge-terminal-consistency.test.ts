import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import {
  assignShoppingItemToStore,
  reconcileAssignmentsWithItemTerminalState,
} from '../core/services/shoppingStoreAssignments';
import type {
  DurableState,
  PantryItem,
  ShoppingStoreAssignment,
} from '../types';

// Regression suite for the merge-inconsistency bug: mergePantryItems
// (resolveStatusFields) and mergeShoppingStoreAssignments independently
// resolve "is this item's terminal (closed-trip) state legitimately
// overridden" using different fields (item.statusClosedTripId/
// statusBasedOnClosedTripId vs assignment.closedTripId/basedOnClosedTripId),
// and could disagree — producing an item that's `stocked` with an ACTIVE
// assignment, or `low` with its matching assignment stuck inactive.
//
// Reproduced case: Device A completes a trip that closes item "apple".
// Device B, offline and unaware of that trip, marks apple "low" again via
// the ordinary UI (no future-re-add causal stamp) and bulk-assigns it to a
// store. Both devices reconnect. Every merge must land on ONE consistent
// decision for apple: either fully closed (stocked, no active assignment)
// or fully reopened (low, active assignment) — never a mix.

const WALMART = 'store_walmart';

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
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
    shoppingEpoch: 1,
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

/** Device A: apple was just closed out by trip "trip-a". */
function deviceAClosedApple(): DurableState {
  const item: PantryItem = {
    id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'stocked',
    storageLocation: 'fridge', storeId: null, expiryDate: null,
    createdAt: 1, updatedAt: 500, statusUpdatedAt: 500, statusRevision: 10,
    statusClosedTripId: 'trip-a',
  };
  const assignment: ShoppingStoreAssignment = {
    id: `shopping-store:apple:${WALMART}`, pantryItemId: 'apple', storeId: WALMART,
    active: false, updatedAt: 500, revision: 5, closedTripId: 'trip-a',
  };
  return state({
    items: [item],
    shoppingStoreAssignments: [assignment],
    trips: [{
      id: 'trip-a', storeIdsVisited: [WALMART], skippedStoreIds: [],
      itemsBought: 1, itemsRemaining: 0, itemsOutOfStock: 0, receiptIds: [],
      totalSpent: 0, breakdown: [], purchasedItems: [{ itemId: 'apple', name: 'Apple', storeId: WALMART, price: 0 }],
      startedAt: 400, completedAt: 500, duration: 100,
    }],
    closedTripIds: [{ id: 'trip-a', deletedAt: 500 }],
    updatedAt: 500,
  });
}

/**
 * Device B: it HAD synced trip-a's closure before going offline (its own
 * local copy of the Walmart assignment already carries closedTripId
 * 'trip-a', same as device A's). While offline, the user marks apple low
 * again via the ordinary UI (setItemStatus — no statusBasedOnClosedTripId
 * stamp; only a dedicated future-re-add flow sets that) and bulk-assigns it
 * to Walmart via assignShoppingItemToStore, whose carry-forward
 * (`basedOnClosedTripId: existing?.closedTripId ?? existing?.basedOnClosedTripId`)
 * automatically stamps the new assignment with 'trip-a' — for free, with no
 * re-add ceremony — purely because that's what its OWN prior local copy of
 * this exact assignment id already had.
 */
function deviceBReopensAppleOffline(): DurableState {
  const item: PantryItem = {
    id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'low',
    storageLocation: 'fridge', storeId: WALMART, expiryDate: null,
    createdAt: 1, updatedAt: 900, statusUpdatedAt: 900, statusRevision: 1,
  };
  const priorSyncedAssignment: ShoppingStoreAssignment = {
    id: `shopping-store:apple:${WALMART}`, pantryItemId: 'apple', storeId: WALMART,
    active: false, updatedAt: 500, revision: 5, closedTripId: 'trip-a',
  };
  const assignment = assignShoppingItemToStore(
    [priorSyncedAssignment], 'apple', WALMART, 900,
    { shoppingEpoch: 1, activeTripId: null },
  )[0];
  return state({
    items: [item],
    shoppingStoreAssignments: [assignment],
    updatedAt: 900,
  });
}

function assertConsistent(merged: DurableState, label: string) {
  const apple = merged.items.find((i) => i.id === 'apple')!;
  const activeAssignments = (merged.shoppingStoreAssignments ?? [])
    .filter((a) => a.pantryItemId === 'apple' && a.active);

  assert.ok(apple, `${label}: apple must exist`);

  if (apple.statusClosedTripId) {
    assert.equal(apple.status, 'stocked', `${label}: a closed item must be stocked`);
    assert.deepEqual(activeAssignments, [], `${label}: never stocked + active assignment`);
  } else {
    // Not terminal — if the item points at a store, that exact assignment
    // must not be the one left wrongly inactive.
    if ((apple.status === 'low' || apple.status === 'expiring') && apple.storeId) {
      const matching = (merged.shoppingStoreAssignments ?? []).find(
        (a) => a.pantryItemId === 'apple' && a.storeId === apple.storeId,
      );
      if (matching) {
        assert.equal(matching.active, true, `${label}: never low + inactive matching assignment`);
      }
    }
  }
}

test('merge order A-then-B: apple never ends up mixed', () => {
  const merged = mergeDurableSnapshotForPush(deviceAClosedApple(), deviceBReopensAppleOffline());
  assertConsistent(merged, 'A-then-B');
});

test('merge order B-then-A: apple never ends up mixed', () => {
  const merged = mergeDurableSnapshotForPush(deviceBReopensAppleOffline(), deviceAClosedApple());
  assertConsistent(merged, 'B-then-A');
});

test('the item merge (not the assignment merge) is authoritative: apple stays closed', () => {
  // deviceAClosedApple's item has the higher statusRevision-independent
  // terminal claim; deviceB's plain low-flip carries no matching
  // statusBasedOnClosedTripId, so resolveStatusFields must keep the item
  // terminal — and the assignment must follow it into inactive.
  const merged = mergeDurableSnapshotForPush(deviceAClosedApple(), deviceBReopensAppleOffline());
  const apple = merged.items.find((i) => i.id === 'apple')!;
  assert.equal(apple.status, 'stocked');
  assert.equal(apple.statusClosedTripId, 'trip-a');
  assert.deepEqual(
    merged.shoppingStoreAssignments?.filter((a) => a.pantryItemId === 'apple' && a.active),
    [],
  );
});

test('a legitimate future re-add (matching statusBasedOnClosedTripId) still activates the assignment', () => {
  // The exact opposite case must keep working: a device that DID observe
  // trip-a and performs a proper causal re-add must still end up low with
  // an active assignment — this fix must not block legitimate re-adds.
  const closed = deviceAClosedApple();
  const priorSyncedAssignment: ShoppingStoreAssignment = {
    id: `shopping-store:apple:${WALMART}`, pantryItemId: 'apple', storeId: WALMART,
    active: false, updatedAt: 500, revision: 5, closedTripId: 'trip-a',
  };
  const legitimateReadd = state({
    items: [{
      id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'low',
      storageLocation: 'fridge', storeId: WALMART, expiryDate: null,
      createdAt: 1, updatedAt: 900, statusUpdatedAt: 900, statusRevision: 11,
      statusBasedOnClosedTripId: 'trip-a',
    }],
    shoppingStoreAssignments: assignShoppingItemToStore(
      [priorSyncedAssignment], 'apple', WALMART, 900,
      { shoppingEpoch: 1, activeTripId: null },
    ),
    updatedAt: 900,
  });

  const merged = mergeDurableSnapshotForPush(closed, legitimateReadd);
  const apple = merged.items.find((i) => i.id === 'apple')!;
  assert.equal(apple.status, 'low');
  assert.equal(apple.storeId, WALMART);
  assert.deepEqual(
    merged.shoppingStoreAssignments?.filter((a) => a.pantryItemId === 'apple' && a.active).map((a) => a.storeId),
    [WALMART],
  );
});

test('reconcileAssignmentsWithItemTerminalState: deactivates an active assignment for a terminal item', () => {
  const items: PantryItem[] = [{
    id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'stocked',
    storageLocation: 'fridge', storeId: null, expiryDate: null,
    createdAt: 1, updatedAt: 1, statusClosedTripId: 'trip-a',
  }];
  const assignments: ShoppingStoreAssignment[] = [{
    id: 'a1', pantryItemId: 'apple', storeId: WALMART, active: true, updatedAt: 1, revision: 1,
  }];
  const result = reconcileAssignmentsWithItemTerminalState(assignments, items, 100);
  assert.equal(result[0].active, false);
  assert.equal(result[0].closedTripId, 'trip-a');
});

test('reconcileAssignmentsWithItemTerminalState: reactivates the matching assignment for a reopened item', () => {
  const items: PantryItem[] = [{
    id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'low',
    storageLocation: 'fridge', storeId: WALMART, expiryDate: null,
    createdAt: 1, updatedAt: 1,
  }];
  const assignments: ShoppingStoreAssignment[] = [{
    id: 'a1', pantryItemId: 'apple', storeId: WALMART, active: false, updatedAt: 1, revision: 1,
    closedTripId: 'trip-a',
  }];
  const result = reconcileAssignmentsWithItemTerminalState(assignments, items, 100);
  assert.equal(result[0].active, true);
  assert.equal(result[0].closedTripId, undefined);
});

test('reconcileAssignmentsWithItemTerminalState: leaves unrelated (item, store) pairs alone', () => {
  const items: PantryItem[] = [{
    id: 'apple', name: 'Apple', quantity: 1, unit: 'unit', status: 'low',
    storageLocation: 'fridge', storeId: WALMART, expiryDate: null,
    createdAt: 1, updatedAt: 1,
  }];
  // An inactive, closed assignment for apple at a DIFFERENT store than the
  // item currently points to — must not be touched.
  const assignments: ShoppingStoreAssignment[] = [{
    id: 'a1', pantryItemId: 'apple', storeId: 'store_old', active: false, updatedAt: 1, revision: 1,
    closedTripId: 'trip-a',
  }];
  const result = reconcileAssignmentsWithItemTerminalState(assignments, items, 100);
  assert.deepEqual(result, assignments);
});
