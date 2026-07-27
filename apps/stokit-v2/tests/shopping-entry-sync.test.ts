import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mergeShoppingEntries,
  reconcileShoppingSession,
  shoppingEntryEventForItem,
} from '../core/services/shoppingEntrySync';
import { initialSession, reduce, type ShoppingSession } from '../core/shopping-machine';
import type { PantryItem, ShoppingEntry } from '../types';

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

test('server pantry truth repairs a stale active-trip store without dropping progress', () => {
  const session = reconcileShoppingSession(
    active([entry({ picked: true })]),
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].storeId, 'sams');
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

test('valid names, capitalization, emoji metadata, and quantity survive reconciliation', () => {
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

  assert.deepEqual(reconciled.map(({ itemId, name, quantity }) => ({ itemId, name, quantity })), [
    { itemId: 'apple', name: 'Apple', quantity: 1 },
    { itemId: 'banana', name: 'Banana', quantity: 1 },
    { itemId: 'orange', name: 'Orange', quantity: 1 },
    { itemId: 'milk', name: '🥛 Milk', quantity: 3 },
    { itemId: 'green-apple', name: 'Green Apple', quantity: 1 },
  ]);
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

  // `now` is a wall-clock stamp (used to let a re-add beat an older removal
  // tombstone), so assert its presence separately from the fixed shape.
  const { now, ...rest } = event as { now?: number } & Record<string, unknown>;
  assert.equal(typeof now, 'number');
  assert.deepEqual(rest, {
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

test('local delete or non-shopping status removes the active entry', () => {
  for (const event of [
    shoppingEntryEventForItem(active(), null, 'banana'),
    shoppingEntryEventForItem(active(), item({ status: 'stocked' }), 'banana'),
  ]) {
    const { now, ...rest } = event as { now?: number } & Record<string, unknown>;
    assert.equal(typeof now, 'number', 'removals are stamped so a later re-add can win');
    assert.deepEqual(rest, { type: 'REMOVE_ENTRY', itemId: 'banana' });
  }
});

test('active ADD_ENTRY refreshes metadata and store without duplicating the item', () => {
  const next = reduce(active([entry({ picked: true })]), {
    type: 'ADD_ENTRY',
    entry: entry({ name: 'BANANA', quantity: 6, storeId: 'sams' }),
  });

  assert.equal(next.entries.length, 1);
  assert.deepEqual(next.entries[0], entry({ name: 'BANANA', quantity: 6, storeId: 'sams', picked: true }));
});
