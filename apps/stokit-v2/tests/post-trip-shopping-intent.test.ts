/**
 * Regression suite: the closed trip's items reappearing as fresh shopping
 * needs (the OTA 453 recovery-track field report, proven from two-device
 * SyncDiag exports of trip t_1786229519053).
 *
 * Root cause: post-trip shopping state is RE-DERIVED from pantry eligibility.
 * releaseStoreAssignment deliberately keeps an unbought item at `low`
 * (you still need it) while nulling its store, so the moment the trip closed
 * the derivation reconstructed it as either
 *   - a brand-new "Choose store" / unassigned need, or
 *   - a row under the store the trip had just finished, via
 *     activeShoppingStoreIds' legacy `item.storeId` fallback (which fires for
 *     items that have no ledger record at all).
 *
 * Evidence it was derivation and not sync: the owner's assignment ledger was
 * fully clean at close (clearShoppingEntries logged before/after with 0 flips
 * and 0 active records), the owner REJECTED every stale incoming item merge
 * (negative updatedAt deltas), and the member ACCEPTED the owner's cleared
 * items — i.e. both devices converged correctly and the rows came back anyway.
 *
 * Fix: `releasedByMostRecentClosedTrip(trips, itemId, name)` — item-scoped,
 * store-agnostic — consulted inside the SHARED derivation chokepoint
 * `activeShoppingStoreIds`, so every plan path (plan map, planGroups,
 * startTripAt entries, unassigned bucket) inherits it. An ACTIVE assignment
 * always wins and is never suppressed, which is what makes an explicit re-add
 * restore the item immediately.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  activeShoppingStoreIds,
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import {
  protectedByMostRecentClosedTrip,
  releasedByMostRecentClosedTrip,
} from '../core/services/shoppingDuplicateGuard';
import { shoppingGroups } from '../core/services/shoppingGroups';
import { initialSession } from '../core/shopping-machine';
import type { PantryItem, Trip, TripPurchasedItem, ShoppingStoreAssignment } from '../types';

const A = 'store-a';
const B = 'store-b';

const mk = (id: string, name: string, storeId: string | null, status: PantryItem['status'] = 'low'): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status, storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
});

const pair = (itemId: string, name: string, storeId: string): TripPurchasedItem =>
  ({ itemId, name, storeId, price: 0 });

const trip = (
  id: string,
  completedAt: number,
  purchasedItems: TripPurchasedItem[],
  releasedItems: TripPurchasedItem[],
): Trip => ({
  id,
  storeIdsVisited: [A],
  skippedStoreIds: [],
  itemsBought: purchasedItems.length,
  itemsRemaining: releasedItems.length,
  itemsOutOfStock: 0,
  receiptIds: [],
  totalSpent: 0,
  breakdown: [],
  purchasedItems,
  releasedItems,
  startedAt: completedAt - 1000,
  completedAt,
  duration: 1000,
});

// The field scenario: Bread was queued at store A, never bought, so the trip
// released it. It stays `low` — you still need bread — and its assignment is
// deactivated.
const BREAD = mk('bread', 'Bread', null);
const RELEASED_TRIP = trip('t1', 5000, [], [pair('bread', 'Bread', A)]);
const releasedLedger: ShoppingStoreAssignment[] = [
  { id: `shopping-store:bread:${A}`, pantryItemId: 'bread', storeId: A, active: false, updatedAt: 5000 },
];

// ── 1. Released item is gone from Choose Store / unassigned ────────────────

test('1. an item released by the most recent trip is not a live shopping need', () => {
  assert.deepEqual(
    activeShoppingStoreIds(BREAD, releasedLedger, [RELEASED_TRIP]), [],
    'released bread must not resolve to any store',
  );
  assert.equal(releasedByMostRecentClosedTrip([RELEASED_TRIP], 'bread', 'Bread'), true);
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments([BREAD], releasedLedger, [RELEASED_TRIP]), [],
    'and it rebuilds no plan entry',
  );
});

test('1b. its pantry status is untouched — still low, still needed', () => {
  // The guard is read-only: it takes the item by value and returns a boolean.
  const before = JSON.stringify(BREAD);
  releasedByMostRecentClosedTrip([RELEASED_TRIP], BREAD.id, BREAD.name);
  activeShoppingStoreIds(BREAD, releasedLedger, [RELEASED_TRIP]);
  assert.equal(JSON.stringify(BREAD), before, 'no mutation of the pantry item');
  assert.equal(BREAD.status, 'low', 'pantry restock semantics are unchanged');
});

// ── 2. Legacy item.storeId fallback is suppressed too ──────────────────────

test('2. a released item with a legacy item.storeId and NO ledger record stays out of the completed store', () => {
  // This is the same-store resurrection path: no assignment record at all, so
  // activeShoppingStoreIds used to fall back to item.storeId and render the
  // item under the store the trip had just finished.
  const legacyBread = mk('bread', 'Bread', A);
  assert.deepEqual(
    activeShoppingStoreIds(legacyBread, [], undefined), [A],
    'without trips the legacy fallback is unchanged',
  );
  assert.deepEqual(
    activeShoppingStoreIds(legacyBread, [], [RELEASED_TRIP]), [],
    'THE FIX: the fallback must not resurrect the just-finished store',
  );
  assert.deepEqual(
    shoppingGroups(initialSession, [legacyBread], [], [RELEASED_TRIP]), [],
    'and the idle plan groups render no completed-store section',
  );
});

// ── 3. Purchased items stay absent ─────────────────────────────────────────

test('3. an item purchased on the most recent trip stays absent', () => {
  const milk = mk('milk', 'Milk', A); // still low + legacy storeId = worst case
  const purchasedTrip = trip('t1', 5000, [pair('milk', 'Milk', A)], []);
  assert.equal(releasedByMostRecentClosedTrip([purchasedTrip], 'milk', 'Milk'), true);
  assert.deepEqual(activeShoppingStoreIds(milk, [], [purchasedTrip]), []);
});

// ── 4. Items the trip never touched are unaffected ─────────────────────────

test('4. an unrelated low item is still visible', () => {
  const eggs = mk('eggs', 'Eggs', B);
  assert.equal(releasedByMostRecentClosedTrip([RELEASED_TRIP], 'eggs', 'Eggs'), false);
  assert.deepEqual(
    activeShoppingStoreIds(eggs, [], [RELEASED_TRIP]), [B],
    'an item the closed trip never mentioned keeps its store',
  );
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments([eggs], [], [RELEASED_TRIP]).map((d) => d.storeId), [B],
  );
});

test('4b. an unrelated item with no store is still an unassigned need', () => {
  const oats = mk('oats', 'Oats', null);
  assert.equal(releasedByMostRecentClosedTrip([RELEASED_TRIP], 'oats', 'Oats'), false,
    'so the Shopping screen still lists it under Choose store');
});

// ── 5. Suppression self-expires — older trips must not suppress ────────────

test('5. an item released by an OLDER trip is eligible again once a newer trip closes', () => {
  const olderReleased = trip('t1', 5000, [], [pair('bread', 'Bread', A)]);
  const newerUnrelated = trip('t2', 9000, [pair('eggs', 'Eggs', B)], []);
  const trips = [olderReleased, newerUnrelated];
  assert.equal(
    releasedByMostRecentClosedTrip(trips, 'bread', 'Bread'), false,
    'only the single most recent trip suppresses — protection self-expires',
  );
  assert.deepEqual(
    activeShoppingStoreIds(mk('bread', 'Bread', A), [], trips), [A],
    'bread is a live need again',
  );
});

test('5b. no trips at all suppresses nothing', () => {
  assert.equal(releasedByMostRecentClosedTrip(undefined, 'bread', 'Bread'), false);
  assert.equal(releasedByMostRecentClosedTrip([], 'bread', 'Bread'), false);
  assert.deepEqual(activeShoppingStoreIds(mk('bread', 'Bread', A), [], []), [A]);
});

// ── 6. Explicit re-add restores eligibility immediately ────────────────────

test('6. an explicit re-add (active assignment) restores the item without waiting for another trip', () => {
  // assignShoppingItemToStore is what addItem / assignItemsToStore call once
  // canAssignToStore has cleared the write — which for a just-released pairing
  // requires the user's explicit "Add again" (allowRepurchase) confirmation.
  const reAdded = assignShoppingItemToStore(releasedLedger, 'bread', A, 9000);
  assert.deepEqual(
    activeShoppingStoreIds(BREAD, reAdded, [RELEASED_TRIP]), [A],
    'an ACTIVE assignment is explicit current intent and is never suppressed',
  );
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments([BREAD], reAdded, [RELEASED_TRIP]).map((d) => d.storeId), [A],
  );
});

test('6b. re-adding to a DIFFERENT store also restores it', () => {
  const reAddedElsewhere = assignShoppingItemToStore(releasedLedger, 'bread', B, 9000);
  assert.deepEqual(activeShoppingStoreIds(BREAD, reAddedElsewhere, [RELEASED_TRIP]), [B]);
});

test('6c. deactivating that re-add returns the item to suppressed', () => {
  const reAdded = assignShoppingItemToStore(releasedLedger, 'bread', A, 9000);
  const undone = deactivateShoppingItemStore(reAdded, 'bread', A, 9500);
  assert.deepEqual(activeShoppingStoreIds(BREAD, undone, [RELEASED_TRIP]), []);
});

test('6d. the write-path guard still owns the re-add decision, unchanged', () => {
  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(durable, /Boolean\(allowRepurchase\)/,
    'allowRepurchase remains the explicit user "Add again" bypass');
  assert.match(durable, /protectedByMostRecentClosedTrip\(get\(\)\.trips, pantryItemId, name, storeId\)/,
    'canAssignToStore still consults the store-scoped post-close guard');
  // The store-scoped write guard and the item-scoped read guard are siblings,
  // not replacements for one another.
  assert.equal(protectedByMostRecentClosedTrip([RELEASED_TRIP], 'bread', 'Bread', A), true);
  assert.equal(protectedByMostRecentClosedTrip([RELEASED_TRIP], 'bread', 'Bread', B), false,
    'the write guard stays store-scoped; only the read guard is store-agnostic');
});

// ── 7. Derivation is pure — a re-render cannot change state ────────────────

test('7. repeated derivation (tab/category re-render) is pure and stable', () => {
  const items = [BREAD, mk('eggs', 'Eggs', B)];
  const ledgerBefore = JSON.stringify(releasedLedger);
  const itemsBefore = JSON.stringify(items);
  const first = shoppingEntryDraftsFromAssignments(items, releasedLedger, [RELEASED_TRIP]);
  const second = shoppingEntryDraftsFromAssignments(items, releasedLedger, [RELEASED_TRIP]);
  assert.deepEqual(first, second, 'derivation is deterministic across re-renders');
  assert.equal(JSON.stringify(releasedLedger), ledgerBefore, 'ledger untouched');
  assert.equal(JSON.stringify(items), itemsBefore, 'items untouched');
});

test('7b. no derivation path dispatches or mutates durable/session state', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/shoppingStoreAssignments.ts'), 'utf8');
  assert.doesNotMatch(source, /useDurableStore|useSessionStore|dispatch\(/,
    'the shared derivation layer must stay a pure function of its arguments');
  const guard = readFileSync(join(process.cwd(), 'core/services/shoppingDuplicateGuard.ts'), 'utf8');
  assert.doesNotMatch(guard, /useDurableStore|useSessionStore|dispatch\(/);
});

test('7c. the guard is applied in the shared layer, not only in JSX', () => {
  const shared = readFileSync(join(process.cwd(), 'core/services/shoppingStoreAssignments.ts'), 'utf8');
  assert.match(shared, /releasedByMostRecentClosedTrip\(trips, item\.id, item\.name\)/,
    'activeShoppingStoreIds is the chokepoint every plan path flows through');
  const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  assert.match(screen, /shoppingEntryDraftsFromAssignments\(items, shoppingStoreAssignments, trips\)/);
  assert.match(screen, /shoppingGroups\(session, items, shoppingStoreAssignments, trips\)/);
});

// ── 8. Two-device convergence ──────────────────────────────────────────────

test('8. two devices holding the same converged post-close state show no resurrected rows', () => {
  // Mirrors the real trace: both devices converged on the owner's cleared
  // items and an all-inactive ledger, and BOTH still rendered the rows.
  const ownerItems = [BREAD, mk('eggs', 'Eggs', B)];
  const memberItems = [BREAD, mk('eggs', 'Eggs', B)];
  const ownerPlan = shoppingEntryDraftsFromAssignments(ownerItems, releasedLedger, [RELEASED_TRIP]);
  const memberPlan = shoppingEntryDraftsFromAssignments(memberItems, releasedLedger, [RELEASED_TRIP]);
  assert.deepEqual(ownerPlan, memberPlan, 'both devices derive an identical plan');
  assert.deepEqual(
    ownerPlan.map((d) => `${d.pantryItemId}@${d.storeId}`), ['eggs@store-b'],
    'only the untouched item survives; the released one is gone on both',
  );
});

test('8b. the member device, which never ran trip close locally, suppresses identically', () => {
  // The member only ever received the closed Trip record via sync — no local
  // clearShoppingEntries / releaseStoreAssignment ran on it. The guard reads
  // that synced Trip, so it reaches the same answer without local mutations.
  const memberLedgerNeverCleared: ShoppingStoreAssignment[] = [];
  assert.deepEqual(
    activeShoppingStoreIds(mk('bread', 'Bread', A), memberLedgerNeverCleared, [RELEASED_TRIP]), [],
    'a device that never processed the close still refuses to resurrect the row',
  );
});
