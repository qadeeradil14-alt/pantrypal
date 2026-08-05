import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  mergeDurableSnapshotForPush,
  reconcileServerSnapshotAfterPush,
} from '../core/services/mergeDurableSnapshot';
import type { DurableState, PantryItem, ShoppingStoreAssignment } from '../types';

const TRIP_ID = 't_1785895371678';
const WALMART = 'store_ms9m4vsv_1';
const MILK = 'item_ms4oeaub_1';
const CHEESE = 'item_ms4xrdj7_k';

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
};

function state(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  updatedAt: number,
): DurableState {
  return {
    items,
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs,
    activeSession: null,
    shoppingEpoch: 6,
    activeTripId: null,
    shoppingStoreAssignments: assignments,
    updatedAt,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [{ id: TRIP_ID, deletedAt: 100 }],
    prefsUpdatedAt: {},
  };
}

function item(
  id: string,
  name: string,
  revision: number,
  terminal: boolean,
  marker: string | null | undefined = TRIP_ID,
): PantryItem {
  return {
    id,
    name,
    quantity: 1,
    unit: 'unit',
    status: terminal ? 'stocked' : 'low',
    storageLocation: 'fridge',
    storeId: terminal ? null : WALMART,
    expiryDate: null,
    createdAt: 1,
    updatedAt: terminal ? 100 : 200,
    statusUpdatedAt: terminal ? 100 : 200,
    statusRevision: revision,
    statusClosedTripId: terminal ? TRIP_ID : undefined,
    statusBasedOnClosedTripId: terminal ? undefined : marker ?? undefined,
  };
}

function assignment(
  id: string,
  revision: number,
  terminal: boolean,
  marker: string | null | undefined = TRIP_ID,
): ShoppingStoreAssignment {
  return {
    id: `shopping-store:${id}:${WALMART}`,
    pantryItemId: id,
    storeId: WALMART,
    active: !terminal,
    updatedAt: terminal ? 100 : 200,
    revision,
    closedTripId: terminal ? TRIP_ID : undefined,
    basedOnClosedTripId: terminal ? undefined : marker ?? undefined,
    assignmentBasedOnShoppingEpoch: 6,
  };
}

function pair(
  id: string,
  name: string,
  remoteRevision: number,
  localRevision: number,
  remoteAssignmentRevision: number,
  localAssignmentRevision: number,
  marker: string | null | undefined = TRIP_ID,
) {
  return {
    remote: state(
      [item(id, name, remoteRevision, true)],
      [assignment(id, remoteAssignmentRevision, true)],
      100,
    ),
    local: state(
      [item(id, name, localRevision, false, marker)],
      [assignment(id, localAssignmentRevision, false, marker)],
      200,
    ),
  };
}

function result(state: DurableState, id: string) {
  const mergedItem = state.items.find((candidate) => candidate.id === id)!;
  const mergedAssignment = (state.shoppingStoreAssignments ?? []).find(
    (candidate) => candidate.pantryItemId === id && candidate.storeId === WALMART,
  )!;
  return {
    status: mergedItem.status,
    storeId: mergedItem.storeId,
    statusRevision: mergedItem.statusRevision,
    statusClosedTripId: mergedItem.statusClosedTripId,
    statusBasedOnClosedTripId: mergedItem.statusBasedOnClosedTripId,
    assignmentActive: mergedAssignment.active,
    assignmentRevision: mergedAssignment.revision,
    assignmentClosedTripId: mergedAssignment.closedTripId,
    assignmentBasedOnClosedTripId: mergedAssignment.basedOnClosedTripId,
  };
}

test('Milk equal-revision causal re-add rebases 17 to 18 and stays active at Walmart', () => {
  const { remote, local } = pair(MILK, 'Milk', 17, 17, 12, 13);
  assert.deepEqual(result(mergeDurableSnapshotForPush(remote, local), MILK), {
    status: 'low',
    storeId: WALMART,
    statusRevision: 18,
    statusClosedTripId: undefined,
    statusBasedOnClosedTripId: TRIP_ID,
    assignmentActive: true,
    assignmentRevision: 13,
    assignmentClosedTripId: undefined,
    assignmentBasedOnClosedTripId: TRIP_ID,
  });
});

test('Cheese equal-revision causal re-add rebases 17 to 18', () => {
  const { remote, local } = pair(CHEESE, 'Cheese', 17, 17, 9, 10);
  assert.equal(result(mergeDurableSnapshotForPush(remote, local), CHEESE).statusRevision, 18);
});

test('both merge orders produce identical rebased Milk and Cheese results', () => {
  for (const [id, name, assignmentRevision] of [
    [MILK, 'Milk', 12],
    [CHEESE, 'Cheese', 9],
  ] as const) {
    const { remote, local } = pair(id, name, 17, 17, assignmentRevision, assignmentRevision + 1);
    assert.deepEqual(
      result(mergeDurableSnapshotForPush(remote, local), id),
      result(mergeDurableSnapshotForPush(local, remote), id),
    );
  }
});

test('CAS retry against an equal terminal revision stays rebased to 18', () => {
  const { remote, local } = pair(MILK, 'Milk', 17, 17, 12, 13);
  const first = mergeDurableSnapshotForPush(remote, local);
  const retryRemote = { ...remote, updatedAt: 300 };
  assert.equal(result(mergeDurableSnapshotForPush(retryRemote, first), MILK).statusRevision, 18);
});

test('CAS retry against a higher terminal revision rebases to max plus one', () => {
  const { remote, local } = pair(MILK, 'Milk', 20, 17, 12, 13);
  assert.equal(result(mergeDurableSnapshotForPush(remote, local), MILK).statusRevision, 21);
});

test('missing or wrong causal markers remain terminal', () => {
  for (const marker of [null, 'wrong-trip']) {
    const { remote, local } = pair(MILK, 'Milk', 17, 17, 12, 13, marker);
    const merged = result(mergeDurableSnapshotForPush(remote, local), MILK);
    assert.equal(merged.status, 'stocked');
    assert.equal(merged.statusClosedTripId, TRIP_ID);
    assert.equal(merged.assignmentActive, false);
  }
});

test('equal assignment revision rebases only for a causally valid successor', () => {
  const valid = pair(MILK, 'Milk', 17, 18, 13, 13);
  assert.equal(
    result(mergeDurableSnapshotForPush(valid.remote, valid.local), MILK).assignmentRevision,
    14,
  );

  const invalid = pair(MILK, 'Milk', 17, 18, 13, 13, 'wrong-trip');
  const merged = result(mergeDurableSnapshotForPush(invalid.remote, invalid.local), MILK);
  assert.equal(merged.assignmentActive, false);
  assert.equal(merged.assignmentRevision, 13);
});

test('higher terminal assignment revision rebases to max plus one in both merge orders', () => {
  const { remote, local } = pair(MILK, 'Milk', 17, 18, 15, 13);
  const remoteLocal = result(mergeDurableSnapshotForPush(remote, local), MILK);
  const localRemote = result(mergeDurableSnapshotForPush(local, remote), MILK);

  assert.equal(remoteLocal.assignmentRevision, 16);
  assert.deepEqual(localRemote, remoteLocal);
});

test('returned trigger-sanitized state replaces unchanged submitted local state', () => {
  const submitted = pair(MILK, 'Milk', 17, 18, 12, 13).local;
  const stored = pair(MILK, 'Milk', 17, 18, 12, 13).remote;
  const reconciled = reconcileServerSnapshotAfterPush(stored, submitted, submitted);

  assert.equal(reconciled.hasPostSubmissionChanges, false);
  assert.deepEqual(result(reconciled.state, MILK), result(stored, MILK));
});

test('a mutation created after submission is replayed once without restoring sanitized fields', () => {
  const submitted = pair(MILK, 'Milk', 17, 18, 12, 13).local;
  const stored = pair(MILK, 'Milk', 17, 18, 12, 13).remote;
  const latest = {
    ...submitted,
    items: submitted.items.map((candidate) => ({
      ...candidate,
      quantity: 2,
      updatedAt: 300,
    })),
    updatedAt: 300,
  };
  const reconciled = reconcileServerSnapshotAfterPush(stored, submitted, latest);
  const mergedItem = reconciled.state.items.find((candidate) => candidate.id === MILK)!;

  assert.equal(reconciled.hasPostSubmissionChanges, true);
  assert.equal(mergedItem.quantity, 2);
  assert.equal(mergedItem.status, 'stocked');
  assert.equal(mergedItem.statusClosedTripId, TRIP_ID);

  const settled = reconcileServerSnapshotAfterPush(
    reconciled.state,
    reconciled.state,
    reconciled.state,
  );
  assert.equal(settled.hasPostSubmissionChanges, false);
  assert.deepEqual(settled.state, reconciled.state);
});

test('server truth remains authoritative after durable serialization and restart', () => {
  const submitted = pair(CHEESE, 'Cheese', 17, 18, 9, 10).local;
  const stored = pair(CHEESE, 'Cheese', 17, 18, 9, 10).remote;
  const reconciled = reconcileServerSnapshotAfterPush(stored, submitted, submitted).state;
  const restarted = JSON.parse(JSON.stringify(reconciled)) as DurableState;

  assert.deepEqual(result(restarted, CHEESE), result(stored, CHEESE));
});

const syncSource = fs.readFileSync(
  path.join(__dirname, '../core/services/syncEngine.ts'),
  'utf8',
);
const durableStoreSource = fs.readFileSync(
  path.join(__dirname, '../store/durable-store.ts'),
  'utf8',
);

test('CAS update returns the trigger-sanitized state', () => {
  const attemptSource = syncSource.slice(
    syncSource.indexOf('async function performHouseholdPushAttempt'),
    syncSource.indexOf('function preserveLocalReceiptUris'),
  );
  assert.match(
    attemptSource,
    /\.update\(\{ state: encodeShoppingState\(snapshot\), updated_at: writeAt \}\)[\s\S]*?\.select\('state, updated_at'\)/,
  );
});

test('successful push installs returned server state before marking its echo', () => {
  const installSource = syncSource.slice(
    syncSource.indexOf('async function installSuccessfulPush'),
    syncSource.indexOf('const householdPushCoordinator'),
  );
  const installIndex = installSource.indexOf('replaceWithServerSnapshot');
  const markIndex = installSource.indexOf('markPushed');
  assert.ok(installIndex > 0);
  assert.ok(markIndex > installIndex);
});

test('push success no longer reinstalls the submitted pre-trigger snapshot', () => {
  const pushSource = syncSource.slice(
    syncSource.indexOf('export async function pushLocalState'),
    syncSource.indexOf('export async function pullFromSupabase'),
  );
  assert.doesNotMatch(pushSource, /mergeDurableSnapshotForPush\(snapshot, postPushLocal\)/);
});

test('authoritative server replacement is durably saved before push completion', () => {
  assert.match(durableStoreSource, /replaceWithServerSnapshot:[\s\S]*await saveDurable/);
});
