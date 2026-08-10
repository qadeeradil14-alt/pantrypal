/**
 * MoveItemsSheet ("Move items to another store" on the Pantry tab) used to
 * call `updateItem(id, { storeId })` directly — bypassing
 * assignShoppingItemToStore, canAssignToStore, protectedByMostRecentClosedTrip,
 * and the shoppingStoreAssignments ledger entirely. That let a completed
 * store's item come back as a ghost shopping need the moment it was "moved",
 * since the ledger and item.storeId silently diverged.
 *
 * Fix: MoveItemsSheet now calls the same canonical, guarded
 * `assignItemsToStore` used by every other reassignment flow (see
 * shopping.tsx's Choose Store bulk-assign call), with no allowRepurchase —
 * matching that call site's behavior exactly.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { protectedByMostRecentClosedTrip } from '../core/services/shoppingDuplicateGuard';
import {
  activeShoppingStoreIds,
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
} from '../core/services/shoppingStoreAssignments';
import type { PantryItem, ShoppingStoreAssignment, Trip } from '../types';

const OLD_STORE = 'moms-organic';
const NEW_STORE = 'trader-joes';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    storeIdsVisited: [OLD_STORE],
    skippedStoreIds: [],
    itemsBought: 0,
    itemsRemaining: 0,
    itemsOutOfStock: 0,
    receiptIds: [],
    totalSpent: 0,
    breakdown: [],
    purchasedItems: [],
    startedAt: 1000,
    completedAt: 2000,
    duration: 1000,
    ...overrides,
  };
}

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'bread',
    name: 'Bread',
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId: null,
    expiryDate: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Mirrors durable-store.ts's canAssignToStore exactly (no active session). */
function canAssignToStore(trips: Trip[], pantryItemId: string, name: string, storeId: string): boolean {
  return !protectedByMostRecentClosedTrip(trips, pantryItemId, name, storeId);
}

/** Mirrors what assignItemsToStore does for one item, with no allowRepurchase. */
function moveItemViaCanonicalPath(
  assignments: ShoppingStoreAssignment[],
  it: PantryItem,
  storeId: string,
  trips: Trip[],
): ShoppingStoreAssignment[] {
  if (!canAssignToStore(trips, it.id, it.name, storeId)) return assignments;
  return assignShoppingItemToStore(assignments, it.id, storeId);
}

// ── M: never-ledgered item, completed trip at the destination store ────────

test('M: moving a never-ledgered item onto the store that just settled it creates no ghost need', () => {
  const bread = item({ id: 'bread', name: 'Bread' });
  const trips = [trip({
    releasedItems: [{ itemId: 'bread', name: 'Bread', storeId: OLD_STORE, price: 0 }],
  })];
  // No prior assignment record at all for this item — exactly the
  // "never went through the guarded path" case that used to resurrect.
  const assignmentsBefore: ShoppingStoreAssignment[] = [];

  const assignmentsAfter = moveItemViaCanonicalPath(assignmentsBefore, bread, OLD_STORE, trips);

  assert.deepEqual(assignmentsAfter, assignmentsBefore, 'guarded move must not create an active ledger entry');
  assert.deepEqual(
    activeShoppingStoreIds(bread, assignmentsAfter, trips),
    [],
    'a guarded item must not appear as a live shopping need at the store that just settled it',
  );
});

test('M: moving a never-ledgered item onto an unrelated store is a legitimate new need', () => {
  const bread = item({ id: 'bread', name: 'Bread' });
  const trips = [trip({
    releasedItems: [{ itemId: 'bread', name: 'Bread', storeId: OLD_STORE, price: 0 }],
  })];
  const assignmentsBefore: ShoppingStoreAssignment[] = [];

  const assignmentsAfter = moveItemViaCanonicalPath(assignmentsBefore, bread, NEW_STORE, trips);

  assert.deepEqual(
    activeShoppingStoreIds(bread, assignmentsAfter, trips),
    [NEW_STORE],
    'a store the most recent trip never touched for this item is a legitimate destination',
  );
});

// ── N: stale deactivated assignment at the old store ───────────────────────

test('N: moving an item off a completed store leaves exactly one active assignment, at the new store', () => {
  const bread = item({ id: 'bread', name: 'Bread' });
  const trips = [trip({
    releasedItems: [{ itemId: 'bread', name: 'Bread', storeId: OLD_STORE, price: 0 }],
  })];
  // Ledger already has a deactivated record for the old (completed) store —
  // e.g. left behind by releaseStoreAssignment at trip close.
  const assignmentsBefore = deactivateShoppingItemStore(
    assignShoppingItemToStore([], bread.id, OLD_STORE, 500),
    bread.id,
    OLD_STORE,
    600,
  );
  assert.equal(assignmentsBefore.find((a) => a.storeId === OLD_STORE)?.active, false);

  const assignmentsAfter = moveItemViaCanonicalPath(assignmentsBefore, bread, NEW_STORE, trips);

  assert.deepEqual(
    activeShoppingStoreIds(bread, assignmentsAfter, trips),
    [NEW_STORE],
    'exactly one active assignment (the new store) — the stale old-store record must stay inactive',
  );
  const oldStoreRecord = assignmentsAfter.find((a) => a.storeId === OLD_STORE);
  assert.equal(oldStoreRecord?.active, false, 'the old store\'s ledger entry must remain deactivated, not resurrected');
});

// ── Wiring: MoveItemsSheet must go through the canonical guarded path ──────

test('MoveItemsSheet routes moves through assignItemsToStore, not a direct storeId write', () => {
  const source = readFileSync(
    join(__dirname, '../components/pantry/MoveItemsSheet.tsx'),
    'utf8',
  );
  assert.match(
    source,
    /assignItemsToStore\(\[\.\.\.selected\], storeId\)/,
    'move() must call the canonical ledger-aware assignItemsToStore helper',
  );
  assert.doesNotMatch(
    source,
    /updateItem\(id,\s*\{\s*storeId\s*\}\)/,
    'move() must no longer bypass the ledger with a direct updateItem({ storeId }) write',
  );
});
