import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mergeShoppingEntries,
  reconcileShoppingSession,
  shoppingEntryEventForItem,
} from '../core/services/shoppingEntrySync';
import { initialSession, reduce, type ShoppingSession } from '../core/shopping-machine';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
  syncStateDigest,
} from '../core/services/replicaSync';
import type { DurableState, PantryItem, ShoppingEntry } from '../types';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'banana',
    name: 'Banana',
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'fridge',
    storeId: 'sams',
    expiryDate: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function entry(overrides: Partial<ShoppingEntry> = {}): ShoppingEntry {
  return {
    itemId: 'banana',
    name: 'Banana',
    quantity: 1,
    unit: 'unit',
    storeId: 'target',
    picked: false,
    outOfStock: false,
    ...overrides,
  };
}

function active(entries: ShoppingEntry[] = [entry()]): ShoppingSession {
  return {
    ...initialSession,
    status: 'shopping_store',
    tripId: 'trip-1',
    startedAt: 1,
    storeQueue: ['sams', 'target'],
    currentIndex: 0,
    entries,
  };
}

function durable(activeSession: ShoppingSession, items: PantryItem[] = [item()]): DurableState {
  return {
    items,
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
    activeSession,
    updatedAt: 1,
  };
}

test('active-trip store and picked progress remain stable when pantry metadata changes', () => {
  const session = reconcileShoppingSession(
    active([entry({ picked: true })]),
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].storeId, 'target');
  assert.equal(session.entries[0].picked, true);
});

test('remote entry metadata wins over stale local metadata while completion remains sticky', () => {
  const merged = mergeShoppingEntries(
    [entry({ name: 'banana', quantity: 1, storeId: 'target', picked: true })],
    [entry({ name: 'Banana', quantity: 4, storeId: 'sams', picked: false })],
    [],
  );

  assert.deepEqual(merged[0], entry({ name: 'Banana', quantity: 4, storeId: 'sams', picked: true }));
});

test('active-trip names, capitalization, emoji metadata, and quantity survive reconciliation', () => {
  const items = [
    item({ id: 'apple', name: 'Apple' }),
    item({ id: 'banana', name: 'Banana' }),
    item({ id: 'orange', name: 'Orange' }),
    item({ id: 'milk', name: '🥛 Milk', quantity: 3 }),
    item({ id: 'green-apple', name: 'Green Apple' }),
  ];
  const entries = items.map((value) => entry({
    itemId: value.id,
    name: value.name.toLowerCase(),
    quantity: 1,
    storeId: value.storeId!,
  }));

  const reconciled = reconcileShoppingSession(active(entries), items).entries;

  assert.deepEqual(reconciled.map(({ itemId, name, quantity }) => ({ itemId, name, quantity })), entries.map(
    ({ itemId, name, quantity }) => ({ itemId, name, quantity }),
  ));
});

test('low and expiring pantry status changes do not remove active-trip entries', () => {
  for (const status of ['low', 'expiring'] as const) {
    const session = reconcileShoppingSession(
      active([]),
      [item({ status, quantity: 4, storeId: 'target' })],
    );
    const reconciled = reconcileShoppingSession(
      session,
      [item({ status: 'stocked', quantity: 1, storeId: 'sams' })],
    );

    assert.equal(reconciled.tripId, 'trip-1');
    assert.deepEqual(reconciled.entries, session.entries, `${status} entry must remain stable`);
  }
});

test('picked entry remains after its pantry status changes', () => {
  const session = active([entry({ picked: true, quantity: 3 })]);
  const reconciled = reconcileShoppingSession(session, [item({ status: 'stocked' })]);

  assert.deepEqual(reconciled.entries, session.entries);
  assert.equal(reconciled.entries[0].picked, true);
});

test('unpicked entry remains after its pantry status changes', () => {
  const session = active([entry({ picked: false, quantity: 2 })]);
  const reconciled = reconcileShoppingSession(session, [item({ status: 'stocked' })]);

  assert.deepEqual(reconciled.entries, session.entries);
  assert.equal(reconciled.entries[0].picked, false);
});

test('same product name with distinct item IDs is not collapsed by trip reconciliation', () => {
  const reconciled = reconcileShoppingSession(
    active([
      entry({ itemId: 'apple-sams', name: 'Apple', storeId: 'sams' }),
      entry({ itemId: 'apple-target', name: 'apple', storeId: 'target' }),
    ]),
    [
      item({ id: 'apple-sams', name: 'Apple', storeId: 'sams' }),
      item({ id: 'apple-target', name: 'apple', storeId: 'target' }),
    ],
  );

  assert.equal(reconciled.entries.length, 2);
});

test('server reconciliation restores a missing valid item without reviving a tombstone', () => {
  const reconciled = reconcileShoppingSession(
    { ...active([]), removedItemIds: ['orange'] },
    [
      item({ id: 'banana', name: 'Banana', storeId: 'sams' }),
      item({ id: 'orange', name: 'Orange', storeId: 'target' }),
    ],
  );

  assert.deepEqual(reconciled.entries.map((value) => value.itemId), ['banana']);
  assert.equal(reconciled.storeQueue.includes('sams'), true);
});

test('local add, edit, quantity, and store moves generate one active-session upsert', () => {
  const event = shoppingEntryEventForItem(active(), item({ name: 'Green Apple', quantity: 5, storeId: 'sams' }), 'banana');

  assert.deepEqual(event, {
    type: 'ADD_ENTRY',
    entry: {
      itemId: 'banana',
      name: 'Green Apple',
      quantity: 5,
      unit: 'unit',
      storeId: 'sams',
      picked: false,
    },
  });
});

test('explicit removal records a tombstone while a pantry status change does not', () => {
  const remove = shoppingEntryEventForItem(active(), null, 'banana');
  assert.deepEqual(remove, { type: 'REMOVE_ENTRY', itemId: 'banana' });
  assert.equal(shoppingEntryEventForItem(active(), item({ status: 'stocked' }), 'banana'), null);

  const removed = reduce(active(), remove!);
  assert.equal(removed.entries.length, 0);
  assert.deepEqual(removed.removedItemIds, ['banana']);
});

test('active ADD_ENTRY refreshes metadata and store without duplicating the item', () => {
  const next = reduce(active([entry({ picked: true })]), {
    type: 'ADD_ENTRY',
    entry: entry({ name: 'BANANA', quantity: 6, storeId: 'sams' }),
  });

  assert.equal(next.entries.length, 1);
  assert.deepEqual(next.entries[0], entry({ name: 'BANANA', quantity: 6, storeId: 'sams', picked: true }));
});

test('force-close and reopen preserves entries after pantry status changes', () => {
  const session = active([entry({ picked: true, quantity: 4, storeId: 'target' })]);
  const reconciled = reconcileShoppingSession(session, [item({ status: 'stocked', quantity: 1, storeId: 'sams' })]);
  const reopened = JSON.parse(JSON.stringify(durable(reconciled, [item({ status: 'stocked' })]))) as DurableState;

  assert.equal(reopened.activeSession?.tripId, 'trip-1');
  assert.deepEqual(reopened.activeSession?.entries, session.entries);
});

test('two devices converge without losing an entry whose pantry status changed', () => {
  const base = initializeReplicaState(durable(active()), 'seed');
  const iphone = recordLocalMutation(base, {
    ...base,
    items: [item({ status: 'stocked', updatedAt: 3 })],
    activeSession: reconcileShoppingSession(base.activeSession!, [item({ status: 'stocked', updatedAt: 3 })]),
    updatedAt: 3,
  }, 'iphone', 'item.status');
  const ipad = initializeReplicaState(base, 'ipad');
  const iphoneFirst = mergeReplicaStates([iphone, ipad], 'iphone');
  const ipadFirst = mergeReplicaStates([ipad, iphone], 'ipad');

  assert.equal(syncStateDigest(iphoneFirst), syncStateDigest(ipadFirst));
  assert.deepEqual(iphoneFirst.activeSession?.entries, active().entries);
});

test('offline reconnect preserves status-changed entries and picked progress', () => {
  const base = initializeReplicaState(durable(active()), 'seed');
  const offline = JSON.parse(JSON.stringify(recordLocalMutation(base, {
    ...base,
    items: [item({ status: 'stocked', updatedAt: 4 })],
    activeSession: reconcileShoppingSession(base.activeSession!, [item({ status: 'stocked', updatedAt: 4 })]),
    updatedAt: 4,
  }, 'offline', 'item.status'))) as DurableState;
  const onlineSession = reduce(active(), { type: 'SET_PICK', itemId: 'banana', picked: true });
  const online = recordLocalMutation(initializeReplicaState(base, 'online'), {
    ...base,
    activeSession: onlineSession,
    updatedAt: 5,
  }, 'online', 'shopping.SET_PICK');
  const merged = mergeReplicaStates([offline, online], 'offline');

  assert.equal(merged.activeSession?.entries.length, 1);
  assert.equal(merged.activeSession?.entries[0].picked, true);
});

test('stale realtime state cannot resurrect an explicitly removed entry', () => {
  const base = initializeReplicaState(durable(active()), 'seed');
  const removedSession = reduce(active(), { type: 'REMOVE_ENTRY', itemId: 'banana' });
  const removed = recordLocalMutation(base, { ...base, activeSession: removedSession, updatedAt: 3 }, 'iphone', 'shopping.REMOVE_ENTRY');
  const stale = initializeReplicaState(base, 'ipad');
  const merged = mergeReplicaStates([stale, removed], 'ipad');

  assert.equal(merged.activeSession?.entries.some((value) => value.itemId === 'banana'), false);
  assert.deepEqual(merged.activeSession?.removedItemIds, ['banana']);
});
