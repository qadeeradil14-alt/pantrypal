/**
 * P0 regression: an item bought (or skipped/released unbought) at a store
 * could be reassigned right back to that same store moments after the trip
 * that closed it finished.
 *
 * Root cause: isAlreadyPurchasedThisTrip / canAssignToStore only consulted
 * activeSession, which goes null (or moves on to the next trip) the instant
 * the trip closes — releaseStoreAssignment had already deactivated the
 * ledger entry, but the item stays shopping-eligible (status stays 'low'),
 * so nothing was left to stop a delayed write (a queued local action, or a
 * stale device's merge) from reactivating that exact deterministic
 * assignment id (`shopping-store:{pantryItemId}:{storeId}`).
 *
 * Fix: Trip now durably records `purchasedItems` (already existed) AND
 * `releasedItems` (new) at commit time. protectedByMostRecentClosedTrip
 * reads the single most-recently-completed Trip for that pairing, so
 * protection survives activeSession going null and self-expires the moment
 * the user finishes another trip — never a permanent block.
 *
 * Also: mergeShoppingStoreAssignments's equal-timestamp tie-break used to let
 * an active record beat a deactivated one; now a deactivation always wins an
 * exact tie, so a stale device racing the close can't resurrect it via merge.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  isAlreadyPurchasedThisTrip,
  protectedByMostRecentClosedTrip,
} from '../core/services/shoppingDuplicateGuard';
import {
  assignShoppingItemToStore,
  mergeShoppingStoreAssignments,
} from '../core/services/shoppingStoreAssignments';
import type { ShoppingStoreAssignment, Trip } from '../types';

const MOMS_ORGANIC = 'moms-organic';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    storeIdsVisited: [MOMS_ORGANIC],
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

/** Mirrors durable-store.ts's canAssignToStore exactly (post-fix). */
function canAssignToStore(
  activeSession: null,
  trips: Trip[],
  pantryItemId: string,
  name: string,
  storeId: string,
  allowRepurchase = false,
): boolean {
  return (
    allowRepurchase
    || (!isAlreadyPurchasedThisTrip(activeSession, pantryItemId, name, storeId)
      && !protectedByMostRecentClosedTrip(trips, pantryItemId, name, storeId))
  );
}

// ── 1. Purchased item ──────────────────────────────────────────────────────

test('a purchased item cannot be reassigned to the same store immediately after trip close', () => {
  const trips = [trip({
    purchasedItems: [{ itemId: 'milk', name: 'Milk', storeId: MOMS_ORGANIC, price: 4.5 }],
  })];

  assert.equal(protectedByMostRecentClosedTrip(trips, 'milk', 'Milk', MOMS_ORGANIC), true);
  assert.equal(canAssignToStore(null, trips, 'milk', 'Milk', MOMS_ORGANIC), false);
});

// ── 2. Skipped/released item ────────────────────────────────────────────────

test('a skipped (released, unbought) item cannot be reassigned to the same store immediately after trip close', () => {
  const trips = [trip({
    releasedItems: [{ itemId: 'bread', name: 'Bread', storeId: MOMS_ORGANIC, price: 0 }],
  })];

  assert.equal(protectedByMostRecentClosedTrip(trips, 'bread', 'Bread', MOMS_ORGANIC), true);
  assert.equal(canAssignToStore(null, trips, 'bread', 'Bread', MOMS_ORGANIC), false);
});

// ── 3. addItem/updateItem name-match cannot reactivate without allowRepurchase ─

test('re-adding by name match alone cannot reactivate a just-released assignment', () => {
  const trips = [trip({
    releasedItems: [{ itemId: 'bread', name: 'Bread', storeId: MOMS_ORGANIC, price: 0 }],
  })];
  // Simulates addItem's existing-item branch matching purely by normalized
  // name (e.g. a receipt-scanned re-add with no pantryItemId link).
  assert.equal(canAssignToStore(null, trips, 'bread', 'bread', MOMS_ORGANIC), false);
  assert.equal(canAssignToStore(null, trips, 'bread', '  BREAD  ', MOMS_ORGANIC), false);
});

// ── 4. allowRepurchase still works ──────────────────────────────────────────

test('allowRepurchase bypasses both the session and post-close trip checks', () => {
  const trips = [trip({
    purchasedItems: [{ itemId: 'milk', name: 'Milk', storeId: MOMS_ORGANIC, price: 4.5 }],
  })];

  assert.equal(canAssignToStore(null, trips, 'milk', 'Milk', MOMS_ORGANIC, true), true);
});

// ── Protection self-expires, never blocks a genuine future need ────────────

test('protection is scoped to only the single most recent trip — an older trip never blocks forever', () => {
  const older = trip({
    id: 'trip-0', completedAt: 1000,
    purchasedItems: [{ itemId: 'milk', name: 'Milk', storeId: MOMS_ORGANIC, price: 4.5 }],
  });
  const newer = trip({ id: 'trip-1', completedAt: 5000, purchasedItems: [], releasedItems: [] });

  assert.equal(
    protectedByMostRecentClosedTrip([older, newer], 'milk', 'Milk', MOMS_ORGANIC),
    false,
    'once a newer trip has closed, the older purchase no longer protects the pairing',
  );
});

test('a different store for the same item is never blocked by a purchase elsewhere', () => {
  const trips = [trip({
    purchasedItems: [{ itemId: 'milk', name: 'Milk', storeId: MOMS_ORGANIC, price: 4.5 }],
  })];

  assert.equal(protectedByMostRecentClosedTrip(trips, 'milk', 'Milk', 'trader-joes'), false);
});

test('no trip history at all is never treated as protected', () => {
  assert.equal(protectedByMostRecentClosedTrip([], 'milk', 'Milk', MOMS_ORGANIC), false);
  assert.equal(protectedByMostRecentClosedTrip(undefined, 'milk', 'Milk', MOMS_ORGANIC), false);
});

// ── 5. mergeShoppingStoreAssignments equal-timestamp tie-break ─────────────

test('a stale equal-timestamp active assignment cannot beat a deactivated one, either merge direction', () => {
  const deactivated: ShoppingStoreAssignment = {
    id: 'shopping-store:milk:moms-organic', pantryItemId: 'milk', storeId: MOMS_ORGANIC,
    active: false, updatedAt: 500,
  };
  const staleActive: ShoppingStoreAssignment = {
    id: 'shopping-store:milk:moms-organic', pantryItemId: 'milk', storeId: MOMS_ORGANIC,
    active: true, updatedAt: 500,
  };

  for (const merged of [
    mergeShoppingStoreAssignments([deactivated], [staleActive]),
    mergeShoppingStoreAssignments([staleActive], [deactivated]),
  ]) {
    assert.equal(merged.length, 1);
    assert.equal(merged[0].active, false, 'deactivation wins the tie regardless of merge direction');
  }
});

test('a genuinely newer active assignment still legitimately beats an older deactivation', () => {
  const deactivated: ShoppingStoreAssignment = {
    id: 'shopping-store:milk:moms-organic', pantryItemId: 'milk', storeId: MOMS_ORGANIC,
    active: false, updatedAt: 500,
  };
  const newerActive: ShoppingStoreAssignment = {
    id: 'shopping-store:milk:moms-organic', pantryItemId: 'milk', storeId: MOMS_ORGANIC,
    active: true, updatedAt: 600,
  };

  const merged = mergeShoppingStoreAssignments([deactivated], [newerActive]);
  assert.equal(merged[0].active, true, 'a real, later reassignment (e.g. an explicit Add again) still wins');
});

// ── 6. Two-device stale pre-close merge does not reactivate after close ────

test('a stale device\'s pre-close active assignment does not reactivate after the shopper closes the trip', () => {
  // Shopper's device: bought milk at Mom's Organic, trip closes, ledger
  // deactivated at t=2000.
  let shopperAssignments = assignShoppingItemToStore([], 'milk', MOMS_ORGANIC, 1000);
  shopperAssignments = shopperAssignments.map((a) => ({ ...a, active: false, updatedAt: 2000 }));

  // A second device never received the trip's activity — its own copy is
  // still the pre-close active assignment from t=1000.
  const staleDeviceAssignments = assignShoppingItemToStore([], 'milk', MOMS_ORGANIC, 1000);

  const merged = mergeShoppingStoreAssignments(shopperAssignments, staleDeviceAssignments);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].active, false, 'the shopper\'s strictly-newer deactivation wins outright');

  // Even if the stale write happened to land at the exact same instant the
  // deactivation did, the tie-break still favors the deactivation.
  const staleAtSameInstant = staleDeviceAssignments.map((a) => ({ ...a, updatedAt: 2000 }));
  const mergedTie = mergeShoppingStoreAssignments(shopperAssignments, staleAtSameInstant);
  assert.equal(mergedTie[0].active, false);
});

// ── Wiring ───────────────────────────────────────────────────────────────

test('session-store records released item/store pairings on the Trip at commit time', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  assert.match(source, /releasedItems: releasedEntries\.map/);
  assert.match(source, /durable\.commitTrip\(\s*\{\s*\n\s*\.\.\.next\.completedTrip,/);
});

test('durable-store consults protectedByMostRecentClosedTrip alongside the session check', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(source, /import \{ isAlreadyPurchasedThisTrip, protectedByMostRecentClosedTrip \} from '\.\.\/core\/services\/shoppingDuplicateGuard'/);
  assert.match(source, /!protectedByMostRecentClosedTrip\(get\(\)\.trips, pantryItemId, name, storeId\)/);
});
