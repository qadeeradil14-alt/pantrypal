import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialSession,
  reduce,
} from '../core/shopping-machine';
import { shoppingGroups } from '../core/services/shoppingGroups';
import {
  assignShoppingItemToStore,
  mergeShoppingStoreAssignments,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type {
  PantryItem,
  ShoppingStoreAssignment,
} from '../types';

const item = (id: string, name: string): PantryItem => ({
  id,
  name,
  quantity: 1,
  unit: 'unit',
  status: 'low',
  storageLocation: 'pantry',
  storeId: null,
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
});

test('owner/member Pantry assignments merge without collapsing item/store occurrences', () => {
  const owner = [
    { id: 'apple', storeId: 'costco' },
    { id: 'banana', storeId: 'costco' },
  ].reduce(
    (assignments, value, index) =>
      assignShoppingItemToStore(
        assignments,
        value.id,
        value.storeId,
        20 + index,
      ),
    [] as ShoppingStoreAssignment[],
  );
  const member = [
    { id: 'apple', storeId: 'safeway' },
    { id: 'banana', storeId: 'safeway' },
  ].reduce(
    (assignments, value, index) =>
      assignShoppingItemToStore(
        assignments,
        value.id,
        value.storeId,
        30 + index,
      ),
    [] as ShoppingStoreAssignment[],
  );

  const merged = mergeShoppingStoreAssignments(owner, member);
  assert.equal(merged.length, 4);
  assert.deepEqual(
    new Set(merged.map((assignment) => `${assignment.pantryItemId}:${assignment.storeId}`)),
    new Set([
      'apple:costco',
      'banana:costco',
      'apple:safeway',
      'banana:safeway',
    ]),
  );
});

test('Pantry/Home keeps Apple and Banana at Costco and Safeway as four session occurrences', () => {
  let items = [
    item('apple', 'Apple'),
    item('banana', 'Banana'),
  ];
  let persistedAssignments: ShoppingStoreAssignment[] = [];

  persistedAssignments = assignShoppingItemToStore(
    persistedAssignments,
    items[0].id,
    'costco',
    10,
  );
  items = items.map((value) => value.id === 'apple' ? { ...value, storeId: 'costco' } : value);
  persistedAssignments = assignShoppingItemToStore(
    persistedAssignments,
    items[1].id,
    'costco',
    11,
  );
  items = items.map((value) => value.id === 'banana' ? { ...value, storeId: 'costco' } : value);
  persistedAssignments = assignShoppingItemToStore(
    persistedAssignments,
    items[0].id,
    'safeway',
    12,
  );
  items = items.map((value) => value.id === 'apple' ? { ...value, storeId: 'safeway' } : value);
  persistedAssignments = assignShoppingItemToStore(
    persistedAssignments,
    items[1].id,
    'safeway',
    13,
  );
  items = items.map((value) => value.id === 'banana' ? { ...value, storeId: 'safeway' } : value);

  assert.deepEqual(
    items.map(({ id, storeId }) => ({ id, storeId })),
    [
      { id: 'apple', storeId: 'safeway' },
      { id: 'banana', storeId: 'safeway' },
    ],
    'legacy PantryItem.storeId still has one value and is not the occurrence source',
  );

  assert.deepEqual(
    persistedAssignments.map(({ pantryItemId, storeId }) => ({
      pantryItemId,
      storeId,
    })),
    [
      { pantryItemId: 'apple', storeId: 'costco' },
      { pantryItemId: 'banana', storeId: 'costco' },
      { pantryItemId: 'apple', storeId: 'safeway' },
      { pantryItemId: 'banana', storeId: 'safeway' },
    ],
  );

  const planningGroups = shoppingGroups(
    initialSession,
    items,
    persistedAssignments,
  );
  assert.equal(
    planningGroups.reduce((count, group) => count + group.items.length, 0),
    4,
    'Shopping planning view must read the occurrence ledger before START_TRIP',
  );

  const drafts = shoppingEntryDraftsFromAssignments(
    items,
    persistedAssignments,
  );
  const session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: drafts,
    now: 100,
    shopperId: 'owner',
  });

  assert.equal(session.entries.length, 4);
  assert.equal(new Set(session.entries.map((entry) => entry.entryId)).size, 4);
  assert.deepEqual(
    session.entries.map(({ pantryItemId, storeId }) => ({
      pantryItemId,
      storeId,
    })),
    [
      { pantryItemId: 'apple', storeId: 'costco' },
      { pantryItemId: 'apple', storeId: 'safeway' },
      { pantryItemId: 'banana', storeId: 'costco' },
      { pantryItemId: 'banana', storeId: 'safeway' },
    ],
  );

  const stopByStore = new Map(
    session.entries.map((entry) => [entry.storeId, entry.stopId]),
  );
  assert.equal(stopByStore.size, 2);
  assert.ok(stopByStore.get('costco'));
  assert.ok(stopByStore.get('safeway'));
  assert.notEqual(stopByStore.get('costco'), stopByStore.get('safeway'));
  for (const entry of session.entries) {
    assert.equal(entry.stopId, stopByStore.get(entry.storeId));
  }
});
