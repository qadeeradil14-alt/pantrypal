import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { commitAtomicShoppingRemoval } from '../core/services/shoppingAtomicRemoval';
import { emptyDurableState } from '../core/repositories/durableRepository';
import type { DurableState, SharedShoppingSession } from '../types';

const durableSource = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
const sessionSource = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
const atomicSource = readFileSync(join(process.cwd(), 'core/services/shoppingAtomicRemoval.ts'), 'utf8');

test('REMOVE_ENTRY delegates deletion and session persistence to one scoped durable action', () => {
  const removeBlock = sessionSource.slice(
    sessionSource.indexOf("if (event.type === 'REMOVE_ENTRY')"),
    sessionSource.indexOf('// Log "picked up"'),
  );
  assert.match(removeBlock, /durable\.removeShoppingEntryAtomically\(/);
  assert.doesNotMatch(removeBlock, /durable\.(deleteItem|tombstoneShoppingOccurrence|updateItem)\(/);
  assert.match(sessionSource, /if \(event\.type !== 'REMOVE_ENTRY'\)[\s\S]*durable\.setActiveSession/);
});

test('atomic removal performs one Zustand update and one persist', () => {
  const action = durableSource.slice(
    durableSource.indexOf('removeShoppingEntryAtomically: ({'),
    durableSource.indexOf('\n\n    addStore:', durableSource.indexOf('removeShoppingEntryAtomically: ({')),
  );
  assert.ok(action.length > 0);
  assert.match(action, /commitAtomicShoppingRemoval\(/);
  assert.equal((atomicSource.match(/\bsetState\(/g) ?? []).length, 1);
  assert.equal((atomicSource.match(/\bpersist\(\);/g) ?? []).length, 1);
  assert.match(atomicSource, /deletedItems/);
  assert.match(atomicSource, /activeSession/);
  assert.match(atomicSource, /shoppingStoreAssignments/);
});

test('nineteen REMOVE_ENTRY operations can request only nineteen durable saves', () => {
  const removeBlock = sessionSource.slice(
    sessionSource.indexOf("if (event.type === 'REMOVE_ENTRY')"),
    sessionSource.indexOf('// Log "picked up"'),
  );
  assert.equal((removeBlock.match(/removeShoppingEntryAtomically/g) ?? []).length, 1);
  assert.doesNotMatch(removeBlock, /setActiveSession/);
});

test('atomic removal performs one runtime save and preserves picked/session/assignment/receipt state', () => {
  const picked = {
    entryId: 'milk@safeway', pantryItemId: 'milk', stopId: 'safeway', name: 'Milk',
    quantity: 1, unit: 'unit' as const, storeId: 'safeway', picked: true, pickedAt: 2,
  };
  const removed = {
    entryId: 'milk@costco', pantryItemId: 'milk', stopId: 'costco', name: 'Milk',
    quantity: 1, unit: 'unit' as const, storeId: 'costco', picked: false,
  };
  const session: SharedShoppingSession = {
    status: 'shopping_store', tripId: 'trip', startedAt: 1,
    storeQueue: ['costco', 'safeway'], currentIndex: 0, skippedStoreIds: [],
    entries: [picked], removedEntryIds: [removed.entryId], removedAt: { [removed.entryId]: 3 },
    receipts: [{ id: 'receipt', tripId: 'trip', storeId: 'costco', amount: 8, status: 'logged', createdAt: 2 }],
    completedTrip: null,
  };
  let current: DurableState = {
    ...emptyDurableState,
    items: [{
      id: 'milk', name: 'Milk', quantity: 1, unit: 'unit', status: 'low',
      storageLocation: 'fridge', storeId: 'costco', expiryDate: null,
      createdAt: 1, updatedAt: 1, statusUpdatedAt: 1, statusRevision: 1,
    }],
    activeSession: { ...session, entries: [removed, picked], removedEntryIds: [], removedAt: {} },
    activeTripId: 'trip',
    shoppingEpoch: 2,
    shoppingStoreAssignments: [
      { id: 'shopping-store:milk:costco', pantryItemId: 'milk', storeId: 'costco', active: true, updatedAt: 1 },
      {
        id: 'shopping-store:milk:safeway', pantryItemId: 'milk', storeId: 'safeway', active: true,
        updatedAt: 1, assignmentBasedOnShoppingEpoch: 2, assignmentBasedOnActiveTripId: 'trip',
      },
    ],
    receipts: session.receipts,
  };
  let saves = 0;
  commitAtomicShoppingRemoval(
    (update) => { current = { ...current, ...update(current) }; },
    () => { saves += 1; },
    {
      nextSession: session,
      removedEntry: removed,
      persistDeletion: true,
      tombstoneEntryIds: [removed.entryId],
      legacyStoreId: 'safeway',
    },
    3,
  );

  assert.equal(saves, 1);
  assert.deepEqual(current.activeSession?.entries, [picked]);
  assert.equal(current.activeSession?.receipts[0]?.id, 'receipt');
  assert.equal(current.receipts[0]?.id, 'receipt');
  assert.equal(current.shoppingStoreAssignments?.length, 2);
  assert.equal(current.shoppingStoreAssignments?.find((assignment) => assignment.storeId === 'safeway')?.active, true);
  assert.deepEqual(current.deletedItems, [{ id: removed.entryId, deletedAt: 3 }]);
});
