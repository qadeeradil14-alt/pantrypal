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
  const merged: Omit<ShoppingEntry, 'stopId'> & { stopId?: string } = {
    entryId: 'banana',
    pantryItemId: 'banana',
    name: 'Banana',
    quantity: 1,
    unit: 'unit',
    storeId: 'target',
    picked: false,
    outOfStock: false,
    ...overrides,
  };
  return {
    ...merged,
    stopId: overrides.stopId ?? `stop:trip-1:${merged.storeId}:1`,
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

test('pantry metadata refresh does not reassign or reset an existing occurrence', () => {
  const session = reconcileShoppingSession(
    active([entry({ picked: true, pickedAt: 10, outOfStock: false })]),
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].storeId, 'target');
  assert.equal(session.entries[0].picked, true);
  assert.equal(session.entries[0].pickedAt, 10);
  assert.equal('outOfStock' in session.entries[0], false);
});

test('remote entry metadata wins over stale local metadata while completion remains sticky', () => {
  const merged = mergeShoppingEntries(
    [entry({ name: 'banana', quantity: 1, storeId: 'sams', picked: true })],
    [entry({ name: 'Banana', quantity: 4, storeId: 'sams', picked: false })],
    [],
  );

  assert.deepEqual(merged[0], {
    entryId: 'banana',
    pantryItemId: 'banana',
    stopId: 'stop:trip-1:sams:1',
    name: 'Banana',
    quantity: 4,
    unit: 'unit',
    storeId: 'sams',
    picked: true,
  });
});

test('a newer version of one occurrence wins metadata and completion state in both merge directions', () => {
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

test('a newer version of one occurrence clears stale out-of-stock state in both merge directions', () => {
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
    entryId: value.id,
    pantryItemId: value.id,
    name: value.name.toLowerCase(),
    quantity: 1,
    storeId: value.storeId!,
  }));

  const reconciled = reconcileShoppingSession(active(entries), items).entries;

  assert.deepEqual(reconciled.map(({ pantryItemId, name, quantity }) => ({ pantryItemId, name, quantity })), [
    { pantryItemId: 'apple', name: 'Apple', quantity: 1 },
    { pantryItemId: 'banana', name: 'Banana', quantity: 1 },
    { pantryItemId: 'orange', name: 'Orange', quantity: 1 },
    { pantryItemId: 'milk', name: '🥛 Milk', quantity: 3 },
    { pantryItemId: 'green-apple', name: 'Green Apple', quantity: 1 },
  ]);
});

test('same product name with distinct item IDs is not collapsed by trip reconciliation', () => {
  const reconciled = reconcileShoppingSession(
    active([
      entry({ entryId: 'apple-sams', pantryItemId: 'apple-sams', name: 'Apple', storeId: 'sams' }),
      entry({ entryId: 'apple-target', pantryItemId: 'apple-target', name: 'apple', storeId: 'target' }),
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
    { ...active([]), removedEntryIds: ['occ:trip-1:stop:trip-1:target:1:orange'] },
    [
      item({ id: 'banana', name: 'Banana', storeId: 'sams' }),
      item({ id: 'orange', name: 'Orange', storeId: 'target' }),
    ],
  );

  assert.deepEqual(reconciled.entries.map((value) => value.pantryItemId), ['banana']);
  assert.equal(reconciled.storeQueue.includes('sams'), true);
});

test('same-trip folding preserves a collaborator reopening a finished store', () => {
  const shopper = {
    ...active([
      entry({ entryId: 'eggs', pantryItemId: 'eggs', storeId: 'sams', picked: true }),
      entry({ entryId: 'milk', pantryItemId: 'milk', storeId: 'target', picked: false }),
    ]),
    currentIndex: 1,
  };
  const collaborator = reduce(shopper, {
    type: 'ADD_ENTRY',
    now: 10,
    entry: { pantryItemId: 'banana', name: 'Banana', quantity: 1, unit: 'unit', storeId: 'sams', picked: false },
  });

  const merged = foldRemoteActiveSession(collaborator, shopper);

  assert.deepEqual(merged.storeQueue, ['sams', 'target', 'sams']);
  assert.equal(merged.entries.some((value) => value.pantryItemId === 'banana'), true);
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
      pantryItemId: 'banana',
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
    assert.deepEqual(rest, { type: 'REMOVE_ENTRY', entryId: 'banana' });
  }
});

test('active ADD_ENTRY creates a sibling occurrence instead of moving the old one', () => {
  const next = reduce(active([entry({ picked: true, pickedAt: 10 })]), {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'banana', name: 'BANANA', quantity: 6, unit: 'unit', storeId: 'sams', picked: false },
  });

  assert.equal(next.entries.length, 2);
  assert.equal(next.entries.find((value) => value.storeId === 'target')?.picked, true);
  assert.equal(next.entries.find((value) => value.storeId === 'sams')?.picked, false);
});

test('reconciliation preserves completion from a store that the trip already finished', () => {
  const session = reconcileShoppingSession(
    {
      ...active([entry({ storeId: 'sams', picked: true, pickedAt: 10 })]),
      currentIndex: 1,
    },
    [item({ storeId: 'sams' })],
  );

  assert.equal(session.entries[0].picked, true);
  assert.equal(session.entries[0].pickedAt, 10);
  assert.equal('outOfStock' in session.entries[0], false);
});

test('ADD_ENTRY creates a new stop occurrence after that store was already finished', () => {
  const next = reduce(
    {
      ...active([entry({ storeId: 'sams', picked: true, pickedAt: 10 })]),
      currentIndex: 1,
    },
    {
      type: 'ADD_ENTRY',
      entry: { pantryItemId: 'banana', name: 'Banana', quantity: 1, unit: 'unit', storeId: 'sams', picked: false },
    },
  );

  assert.equal(next.entries.length, 2);
  assert.equal(next.entries[0].picked, true);
  assert.equal(next.entries[1].picked, false);
  assert.notEqual(next.entries[0].stopId, next.entries[1].stopId);
});

test('merge removes meaningless outOfStock false keys without timestamps', () => {
  const merged = mergeShoppingEntries(
    [entry({ outOfStock: false })],
    [entry({ outOfStock: false })],
    [],
  );

  assert.equal('outOfStock' in merged[0], false);
});

// ── Eligibility-lag regression ────────────────────────────────────────────
// A remote session entry must not be pruned by reconcile solely because this
// device's own copy of the pantry item hasn't (yet) caught up to shopping
// eligibility — only a genuine local transition that postdates the entry may
// prune it.

test('a merged-in remote entry survives reconcile when the local item has no tracked status transition yet', () => {
  const reconciled = reconcileShoppingSession(
    active([entry({ addedAt: 500 })]),
    [item({ status: 'stocked', storeId: null })], // never explicitly transitioned locally
  );

  assert.equal(reconciled.entries.length, 1, 'entry must survive — no evidence of a genuine local restock');
});

test('a merged-in remote entry survives reconcile when the local ineligibility predates the entry', () => {
  const reconciled = reconcileShoppingSession(
    active([entry({ addedAt: 1000 })]),
    [item({ status: 'stocked', storeId: null, statusUpdatedAt: 200 })], // stocked before this entry existed
  );

  assert.equal(reconciled.entries.length, 1, 'a stale local transition from before the entry existed must not prune it');
});

test('a genuine local restock after the entry existed still prunes it', () => {
  const reconciled = reconcileShoppingSession(
    active([entry({ addedAt: 100 })]),
    [item({ status: 'stocked', storeId: null, statusUpdatedAt: 500 })], // restocked after the entry was added
  );

  assert.equal(reconciled.entries.length, 0, 'a real local restock that postdates the entry must still prune it');
});

test('legacy entries without addedAt keep the original always-prune-when-ineligible behavior', () => {
  const reconciled = reconcileShoppingSession(
    active([entry({ addedAt: undefined })]),
    [item({ status: 'stocked', storeId: null })],
  );

  assert.equal(reconciled.entries.length, 0, 'no addedAt to order against — legacy semantics are unchanged');
});
