import assert from 'node:assert/strict';
import test from 'node:test';

import {
  currentStopId,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import type {
  DurableState,
  PantryItem,
  ShoppingEntryDraft,
} from '../types';

const kabulItems = ['Cod', 'Crab', 'Lobster', 'Salmon', 'Shrimp', 'Tuna'];

function draft(name: string, storeId: string): ShoppingEntryDraft {
  return {
    pantryItemId: name.toLowerCase(),
    name,
    quantity: 1,
    unit: 'unit',
    storeId,
    picked: false,
  };
}

function item(name: string, storeId: string): PantryItem {
  return {
    id: name.toLowerCase(),
    name,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storeId,
    storageLocation: 'pantry',
    expiryDate: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function startTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    shopperId: 'owner',
    now: 100,
    entries: [
      ...kabulItems.map((name) => draft(name, 'kabul')),
      draft('Milk', 'sams'),
    ],
  });
}

function completeCurrentStore(session: ShoppingSession, now: number): ShoppingSession {
  const picked = session.entries
    .filter((entry) => entry.stopId === currentStopId(session))
    .reduce(
      (next, entry, index) =>
        reduce(next, {
          type: 'SET_PICK',
          entryId: entry.entryId,
          picked: true,
          now: now + index,
        }),
      session,
    );
  const receiptPrompt = reduce(picked, {
    type: 'FINISH_STORE',
    stopId: currentStopId(picked)!,
    now: now + 10,
  });
  return reduce(receiptPrompt, {
    type: 'SAVE_RECEIPT',
    amount: 10,
    status: 'logged',
    imageUri: null,
    now: now + 20,
  });
}

function snapshot(
  activeSession: ShoppingSession | null,
  terminal: ShoppingSession | null,
  updatedAt: number,
): DurableState {
  return {
    items: [
      ...kabulItems.map((name) => item(name, 'kabul')),
      item('Chicken', 'kabul'),
      item('Milk', 'sams'),
    ],
    stores: [],
    priceHistory: [],
    receipts: terminal?.receipts ?? [],
    trips: terminal?.completedTrip ? [terminal.completedTrip] : [],
    activity: [],
    prefs: {
      householdName: 'Home',
      defaultUnit: 'unit',
      expiringWindowDays: 3,
      weeklyBudget: 0,
    },
    activeSession,
    shoppingStoreAssignments: [],
    updatedAt,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: terminal?.completedTrip
      ? [{ id: terminal.completedTrip.id, deletedAt: terminal.completedTrip.completedAt }]
      : [],
  };
}

test('bulk assignment to a completed store stays planning-only and cannot append a phantom stop', () => {
  const started = startTrip();
  const kabulComplete = completeCurrentStore(started, 200);
  let shoppingSams = reduce(kabulComplete, { type: 'CONTINUE_TRIP' });
  shoppingSams = reduce(shoppingSams, { type: 'ADVANCE_STORE' });

  const beforeEntryIds = shoppingSams.entries.map((entry) => entry.entryId);
  const reassigned = [
    draft('Chicken', 'kabul'),
    ...kabulItems.map((name) => draft(name, 'kabul')),
  ];
  const afterBulkAssignment = reassigned.reduce(
    (session, entry, index) =>
      reduce(session, {
        type: 'ADD_ENTRY',
        entry,
        now: 300 + index,
      }),
    shoppingSams,
  );

  assert.deepEqual(afterBulkAssignment.storeQueue, ['kabul', 'sams']);
  assert.deepEqual(
    afterBulkAssignment.entries.map((entry) => entry.entryId),
    beforeEntryIds,
  );
  const converged = foldRemoteActiveSession(
    shoppingSams,
    afterBulkAssignment,
  ) as ShoppingSession;
  assert.deepEqual(converged.storeQueue, ['kabul', 'sams']);
  assert.deepEqual(
    converged.entries.map((entry) => entry.entryId),
    beforeEntryIds,
  );

  const samsComplete = completeCurrentStore(converged, 400);
  const terminal = reduce(samsComplete, { type: 'FINISH_TRIP', now: 500 });
  assert.equal(terminal.status, 'trip_summary');
  assert.deepEqual(terminal.storeQueue, ['kabul', 'sams']);

  const merged = mergeDurableSnapshotForPush(
    snapshot(null, terminal, 600),
    snapshot(afterBulkAssignment, null, 700),
  );
  assert.equal(merged.activeSession, null);
  assert.deepEqual(merged.trips.map((trip) => trip.id), [started.tripId]);
});
