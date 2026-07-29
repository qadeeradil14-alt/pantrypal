import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  foldRemoteActiveSession,
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

test('server pantry truth resets stale completion when an item moves to another store', () => {
  const session = reconcileShoppingSession(
    active([entry({ picked: true, pickedAt: 10, outOfStock: false })]),
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].storeId, 'sams');
  assert.equal(session.entries[0].picked, false);
  assert.equal('pickedAt' in session.entries[0], false);
  assert.equal('outOfStock' in session.entries[0], false);
});

test('remote entry metadata wins over stale local metadata while completion remains sticky', () => {
  const merged = mergeShoppingEntries(
    [entry({ name: 'banana', quantity: 1, storeId: 'sams', picked: true })],
    [entry({ name: 'Banana', quantity: 4, storeId: 'sams', picked: false })],
    [],
  );

  assert.deepEqual(merged[0], {
    itemId: 'banana',
    name: 'Banana',
    quantity: 4,
    unit: 'unit',
    storeId: 'sams',
    picked: true,
  });
});

test('a newer shopping occurrence wins store and completion state in both merge directions', () => {
  const purchasedAtFirstStore = entry({
    storeId: 'sams',
    picked: true,
    pickedAt: 110,
    addedAt: 100,
  });
  const readdedAtNextStore = entry({
    storeId: 'target',
    picked: false,
    addedAt: 200,
  });

  for (const merged of [
    mergeShoppingEntries([purchasedAtFirstStore], [readdedAtNextStore], []),
    mergeShoppingEntries([readdedAtNextStore], [purchasedAtFirstStore], []),
  ]) {
    assert.equal(merged[0].storeId, 'target');
    assert.equal(merged[0].addedAt, 200);
    assert.equal(merged[0].picked, false);
    assert.equal('pickedAt' in merged[0], false);
  }
});

test('a newer shopping occurrence clears stale out-of-stock state in both merge directions', () => {
  const unavailableAtFirstStore = entry({
    storeId: 'sams',
    picked: false,
    outOfStock: true,
    outOfStockAt: 110,
    addedAt: 100,
  });
  const readdedAtNextStore = entry({
    storeId: 'target',
    picked: false,
    addedAt: 200,
  });

  for (const merged of [
    mergeShoppingEntries([unavailableAtFirstStore], [readdedAtNextStore], []),
    mergeShoppingEntries([readdedAtNextStore], [unavailableAtFirstStore], []),
  ]) {
    assert.equal(merged[0].storeId, 'target');
    assert.equal(Boolean(merged[0].outOfStock), false);
    assert.equal('outOfStockAt' in merged[0], false);
  }
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

test('same-trip folding preserves a collaborator reopening a finished store', () => {
  const shopper = {
    ...active([
      entry({ itemId: 'eggs', storeId: 'sams', picked: true }),
      entry({ itemId: 'milk', storeId: 'target', picked: false }),
    ]),
    currentIndex: 1,
  };
  const collaborator = reduce(shopper, {
    type: 'ADD_ENTRY',
    now: 10,
    entry: entry({ itemId: 'banana', storeId: 'sams', picked: false }),
  });

  const merged = foldRemoteActiveSession(collaborator, shopper);

  assert.deepEqual(merged.storeQueue, ['sams', 'target', 'sams']);
  assert.equal(merged.entries.some((value) => value.itemId === 'banana'), true);
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

test('active ADD_ENTRY resets stale completion when moving an item to a new store', () => {
  const next = reduce(active([entry({ picked: true, pickedAt: 10 })]), {
    type: 'ADD_ENTRY',
    entry: entry({ name: 'BANANA', quantity: 6, storeId: 'sams' }),
  });

  assert.equal(next.entries.length, 1);
  assert.deepEqual(next.entries[0], {
    itemId: 'banana',
    name: 'BANANA',
    quantity: 6,
    unit: 'unit',
    storeId: 'sams',
    picked: false,
  });
});

test('reconciliation resets completion from a store that the trip already finished', () => {
  const session = reconcileShoppingSession(
    {
      ...active([entry({ storeId: 'sams', picked: true, pickedAt: 10 })]),
      currentIndex: 1,
    },
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].picked, false);
  assert.equal('pickedAt' in session.entries[0], false);
  assert.equal('outOfStock' in session.entries[0], false);
});

test('ADD_ENTRY resets a same-store entry after that store was already finished', () => {
  const next = reduce(
    {
      ...active([entry({ storeId: 'sams', picked: true, pickedAt: 10 })]),
      currentIndex: 1,
    },
    {
      type: 'ADD_ENTRY',
      entry: entry({ storeId: 'sams' }),
    },
  );

  assert.equal(next.entries[0].picked, false);
  assert.equal('pickedAt' in next.entries[0], false);
  assert.equal('outOfStock' in next.entries[0], false);
});

test('merge removes meaningless outOfStock false keys without timestamps', () => {
  const merged = mergeShoppingEntries(
    [entry({ outOfStock: false })],
    [entry({ outOfStock: false })],
    [],
  );

  assert.equal('outOfStock' in merged[0], false);
});
