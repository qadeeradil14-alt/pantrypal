import assert from 'node:assert/strict';
import test from 'node:test';

import {
  releaseUnpurchasedCompletedTripAssignments,
} from '../core/services/shoppingEpoch';
import {
  finalizeShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type { PantryItem, ShoppingStoreAssignment, Trip } from '../types';

const COSTCO = 'costco';
const SAFEWAY = 'safeway';
const TARGET = 'target';
const TRIP_ID = 'trip-production-repro';
const EPOCH = 10;

const purchasedPairs = [
  ...Array.from({ length: 2 }, (_, index) => [`costco-purchased-${index}`, COSTCO] as const),
  ...Array.from({ length: 8 }, (_, index) => [`safeway-purchased-${index}`, SAFEWAY] as const),
];

const missingSessionPairs = [
  ...Array.from({ length: 36 }, (_, index) => [`costco-missing-${index}`, COSTCO] as const),
  ...Array.from({ length: 32 }, (_, index) => [`safeway-missing-${index}`, SAFEWAY] as const),
];

const trip: Trip = {
  id: TRIP_ID,
  storeIdsVisited: [COSTCO, SAFEWAY],
  skippedStoreIds: [],
  itemsBought: purchasedPairs.length,
  itemsRemaining: 0,
  itemsOutOfStock: 0,
  receiptIds: ['receipt-costco', 'receipt-safeway'],
  totalSpent: 99,
  breakdown: [],
  purchasedItems: purchasedPairs.map(([itemId, storeId]) => ({
    itemId,
    name: itemId,
    storeId,
    price: 0,
  })),
  startedAt: 100,
  completedAt: 200,
  duration: 100,
};

function assignment(
  pantryItemId: string,
  storeId: string,
  overrides: Partial<ShoppingStoreAssignment> = {},
): ShoppingStoreAssignment {
  return {
    id: `shopping-store:${pantryItemId}:${storeId}`,
    pantryItemId,
    storeId,
    active: true,
    updatedAt: 100,
    revision: 4,
    assignmentBasedOnShoppingEpoch: EPOCH,
    assignmentBasedOnActiveTripId: TRIP_ID,
    ...overrides,
  };
}

function item(id: string, storeId: string | null): PantryItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 1,
    updatedAt: 100,
    statusUpdatedAt: 100,
    statusRevision: 4,
  };
}

function finalize(assignments: ShoppingStoreAssignment[]): ShoppingStoreAssignment[] {
  return trip.purchasedItems.reduce(
    (current, purchased) => finalizeShoppingItemStore(
      current,
      purchased.itemId,
      purchased.storeId,
      trip.id,
      trip.completedAt,
      { shoppingEpoch: EPOCH, activeTripId: trip.id },
    ),
    releaseUnpurchasedCompletedTripAssignments(assignments, trip, EPOCH),
  );
}

test('production 78-pair shape closes all 68 missing session entries without inventing purchases', () => {
  const assignments = [
    ...purchasedPairs.map(([itemId, storeId]) => assignment(itemId, storeId)),
    ...missingSessionPairs.map(([itemId, storeId]) => assignment(itemId, storeId)),
  ];
  const completed = finalize(assignments);

  assert.equal(assignments.length, 78);
  assert.equal(trip.purchasedItems.length, 10);
  assert.equal(missingSessionPairs.length, 68);
  assert.equal(
    completed.filter((candidate) => candidate.active && [COSTCO, SAFEWAY].includes(candidate.storeId)).length,
    0,
  );
  assert.ok(
    completed
      .filter((candidate) => missingSessionPairs.some(([itemId, storeId]) =>
        candidate.pantryItemId === itemId && candidate.storeId === storeId,
      ))
      .every((candidate) => !candidate.active && candidate.closedTripId === undefined),
  );
  assert.ok(
    completed
      .filter((candidate) => purchasedPairs.some(([itemId, storeId]) =>
        candidate.pantryItemId === itemId && candidate.storeId === storeId,
      ))
      .every((candidate) => !candidate.active && candidate.closedTripId === TRIP_ID),
  );
});

test('duplicate store assignments release independently while another-trip, epoch, and unvisited-store assignments survive', () => {
  const assignments = [
    assignment('duplicate', COSTCO),
    assignment('duplicate', SAFEWAY),
    assignment('other-trip', COSTCO, { assignmentBasedOnActiveTripId: 'other-trip' }),
    assignment('other-epoch', SAFEWAY, { assignmentBasedOnShoppingEpoch: EPOCH + 1 }),
    assignment('unvisited', TARGET),
    assignment('causal-readd', COSTCO, {
      assignmentBasedOnActiveTripId: undefined,
      basedOnClosedTripId: TRIP_ID,
      revision: 6,
    }),
  ];
  const completed = finalize(assignments);

  assert.deepEqual(
    completed.filter((candidate) => candidate.active).map((candidate) => candidate.id).sort(),
    [
      'shopping-store:other-epoch:safeway',
      'shopping-store:other-trip:costco',
      'shopping-store:unvisited:target',
      'shopping-store:causal-readd:costco',
    ].sort(),
  );
});

test('released unpurchased items stay low but are no longer visible in Home or Shopping', () => {
  const assignments = finalize([
    assignment('missing', COSTCO),
    assignment('outside', TARGET, { assignmentBasedOnActiveTripId: 'other-trip' }),
  ]);
  const items = [item('missing', null), item('outside', TARGET)];

  assert.equal(items.find((candidate) => candidate.id === 'missing')?.status, 'low');
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments(items, assignments).map((candidate) =>
      `${candidate.pantryItemId}@${candidate.storeId}`,
    ),
    ['outside@target'],
  );
});
