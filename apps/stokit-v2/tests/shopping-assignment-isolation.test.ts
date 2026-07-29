import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  currentStoreEntries,
  initialSession,
  reduce,
} from '../core/shopping-machine';
import {
  activeShoppingStoreIds,
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  mergeShoppingStoreAssignments,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type {
  PantryItem,
  ShoppingStoreAssignment,
} from '../types';

const item = (id: string, name: string, storeId: string | null): PantryItem => ({
  id,
  name,
  quantity: 1,
  unit: 'unit',
  status: 'low',
  storageLocation: 'pantry',
  storeId,
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
});

const pairs = (assignments: ShoppingStoreAssignment[]) =>
  assignments
    .filter((assignment) => assignment.active)
    .map((assignment) => `${assignment.pantryItemId}@${assignment.storeId}`)
    .sort();

test('a stale legacy store is not copied after an occurrence ledger exists', () => {
  const items = [
    item('apple', 'Apple', 'safeway'),
    item('banana', 'Banana', 'safeway'),
  ];
  let assignments = assignShoppingItemToStore([], 'apple', 'costco', 10);
  assignments = assignShoppingItemToStore(assignments, 'banana', 'costco', 11);

  assert.deepEqual(
    assignments.map(({ id, pantryItemId, storeId }) => ({
      id,
      pantryItemId,
      storeId,
    })),
    [
      {
        id: 'shopping-store:apple:costco',
        pantryItemId: 'apple',
        storeId: 'costco',
      },
      {
        id: 'shopping-store:banana:costco',
        pantryItemId: 'banana',
        storeId: 'costco',
      },
    ],
  );
  assert.deepEqual(pairs(assignments), [
    'apple@costco',
    'banana@costco',
  ]);

  const afterOpeningSafeway = assignments;
  assert.strictEqual(afterOpeningSafeway, assignments);
  assert.deepEqual(pairs(afterOpeningSafeway), [
    'apple@costco',
    'banana@costco',
  ]);

  assignments = assignShoppingItemToStore(
    assignments,
    items[0].id,
    'safeway',
    30,
  );
  assert.deepEqual(pairs(assignments), [
    'apple@costco',
    'apple@safeway',
    'banana@costco',
  ]);
});

test('START_TRIP consumes the exact three-occurrence ledger and advances Costco to Safeway', () => {
  const items = [
    item('apple', 'Apple', 'safeway'),
    item('banana', 'Banana', 'costco'),
  ];
  let assignments = assignShoppingItemToStore([], 'apple', 'costco', 10);
  assignments = assignShoppingItemToStore(assignments, 'banana', 'costco', 11);
  assignments = assignShoppingItemToStore(assignments, 'apple', 'safeway', 12);

  const persisted = JSON.parse(JSON.stringify(assignments)) as ShoppingStoreAssignment[];
  const drafts = shoppingEntryDraftsFromAssignments(items, persisted);
  assert.deepEqual(
    drafts.map((entry) => `${entry.pantryItemId}@${entry.storeId}`).sort(),
    ['apple@costco', 'apple@safeway', 'banana@costco'],
  );

  let session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: drafts,
    now: 100,
    shopperId: 'owner',
  });
  assert.equal(session.entries.length, 3);
  assert.deepEqual(
    currentStoreEntries(session).map((entry) => entry.name).sort(),
    ['Apple', 'Banana'],
  );

  session = reduce(session, { type: 'FINISH_STORE', now: 110 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 120 });
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });

  assert.equal(session.storeQueue[session.currentIndex], 'safeway');
  assert.deepEqual(
    currentStoreEntries(session).map((entry) => entry.name),
    ['Apple'],
  );
});

test('owner/member reconciliation preserves the exact explicit ledger', () => {
  let owner = assignShoppingItemToStore([], 'apple', 'costco', 10);
  owner = assignShoppingItemToStore(owner, 'banana', 'costco', 11);
  const member = assignShoppingItemToStore(owner, 'apple', 'safeway', 20);

  const ownerAfterReconnect = mergeShoppingStoreAssignments(owner, member);
  const memberAfterReconnect = mergeShoppingStoreAssignments(member, ownerAfterReconnect);

  assert.deepEqual(pairs(ownerAfterReconnect), [
    'apple@costco',
    'apple@safeway',
    'banana@costco',
  ]);
  assert.deepEqual(pairs(memberAfterReconnect), pairs(ownerAfterReconnect));
});

test('completed occurrences are tombstoned without removing a sibling store', () => {
  const apple = item('apple', 'Apple', 'safeway');
  let assignments = assignShoppingItemToStore([], 'apple', 'costco', 10);
  assignments = assignShoppingItemToStore(assignments, 'apple', 'safeway', 11);

  assignments = deactivateShoppingItemStore(
    assignments,
    'apple',
    'costco',
    20,
  );
  assert.deepEqual(activeShoppingStoreIds(apple, assignments), ['safeway']);

  assignments = deactivateShoppingItemStore(
    assignments,
    'apple',
    'safeway',
    21,
  );
  assert.deepEqual(
    activeShoppingStoreIds(apple, assignments),
    [],
    'inactive ledger records prevent PantryItem.storeId from resurrecting Safeway',
  );
});

test('Shopping start does not manufacture store assignments', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('const startTripAt = async');
  const startTrip = source.slice(
    start,
    source.indexOf('\n  };', start) + 5,
  );

  assert.doesNotMatch(startTrip, /updateItem\(.*storeId/s);
  assert.doesNotMatch(startTrip, /nextItems/);
  assert.match(
    startTrip,
    /shoppingEntryDraftsFromAssignments\(\s*items,\s*shoppingStoreAssignments/s,
  );
});

test('assignment write paths record action source and before/after ledgers', () => {
  const source = readFileSync(
    new URL('../store/durable-store.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /syncDiag\('shopping_assignment_mutation'/);
  assert.doesNotMatch(source, /assignShoppingItemToStorePreservingLegacy/);
  assert.match(source, /assignItemToStore:[^]*assignShoppingItemToStore\(/);
  assert.match(source, /assignItemsToStore:[^]*assignShoppingItemToStore\(/);
  assert.match(source, /source:[^;]*'clearShoppingEntries'[^;]*'resetShoppingList'/s);
  assert.match(source, /before:\s*snapshot\(before\)/);
  assert.match(source, /after:\s*snapshot\(after\)/);
  assert.match(source, /\{\s*id,\s*pantryItemId,\s*storeId:\s*assignmentStoreId,\s*active\s*\}/s);
  assert.match(source, /clearShoppingEntries:[^]*deactivateShoppingItemStore/);
  assert.match(source, /resetShoppingList:[^]*deactivateShoppingItemStores/);
});
