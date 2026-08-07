/**
 * P0 regression: a household member's device would fold in the owner's full
 * shopping session (union via mergeShoppingEntries/foldRemoteActiveSession),
 * then reconcileShoppingSession immediately pruned every merged-in entry
 * whose backing pantry item wasn't YET locally shopping-eligible (status
 * low/expiring + storeId) — even though the item's own statusUpdatedAt gave
 * no evidence it ever genuinely became ineligible. The member's local render
 * and its next CAS push both collapsed to a strict subset of the owner's
 * list, and every CAS-conflict retry rebuilt the same shrunk snapshot,
 * because nothing in the retry loop corrected the eligibility gate.
 *
 * Fix: reconcileShoppingSession only prunes an active/pending entry for
 * ineligibility when the item's statusUpdatedAt demonstrably postdates the
 * entry's addedAt (a genuine local restock/removal after the entry existed).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import { reconcileShoppingSession } from '../core/services/shoppingEntrySync';
import type { DurableState, PantryItem, SharedShoppingSession } from '../types';

const T = 1_786_131_896_309; // trip start, matches the field evidence's tripId timestamp

const entry = (pantryItemId: string, storeId: string, addedAt: number) => ({
  entryId: `occ:t${T}:stop:t${T}:${storeId}:1:${pantryItemId}`,
  pantryItemId,
  stopId: `stop:t${T}:${storeId}:1`,
  name: pantryItemId,
  quantity: 1,
  unit: 'unit' as const,
  storeId,
  picked: false,
  addedAt,
});

// Owner's device marked these items shopping-eligible (status low + storeId)
// at trip-start time, but the member's local copy has no statusUpdatedAt at
// all — it just hasn't heard about the transition through any tracked path.
const pantryItem = (id: string, eligible: boolean): PantryItem => ({
  id, name: id, quantity: 1, unit: 'unit', storageLocation: 'pantry',
  status: eligible ? 'low' : 'stocked',
  storeId: eligible ? 'store-a' : null,
  expiryDate: null, createdAt: 1, updatedAt: 1,
} as PantryItem);

function session(entries: ReturnType<typeof entry>[]): SharedShoppingSession {
  return {
    status: 'shopping_store', tripId: `t${T}`, startedAt: T, storeQueue: ['store-a'],
    currentIndex: 0, skippedStoreIds: [], removedEntryIds: [], receipts: [], completedTrip: null,
    entries,
  } as SharedShoppingSession;
}

function state(activeSession: SharedShoppingSession | null, items: PantryItem[], updatedAt: number): DurableState {
  return {
    items, stores: [], priceHistory: [], receipts: [], trips: [], activity: [],
    prefs: {} as DurableState['prefs'], activeSession, updatedAt, deletedItems: [], closedTripIds: [],
  };
}

const ALL_FOUR = ['a', 'b', 'c', 'd'];

test('owner adds N items mid-trip — member reaches the full union after one pull/fold cycle', () => {
  const owner = state(
    session(ALL_FOUR.map((id) => entry(id, 'store-a', T))),
    ALL_FOUR.map((id) => pantryItem(id, true)),
    T + 5000,
  );
  // Member's local copy: only knew about 'a' before the trip; its own
  // pantry items for b/c/d haven't been marked eligible on this device yet.
  const member = state(
    session([entry('a', 'store-a', T)]),
    [pantryItem('a', true), pantryItem('b', false), pantryItem('c', false), pantryItem('d', false)],
    T + 1000,
  );

  const merged = mergeDurableSnapshotForPush(owner, member);

  assert.deepEqual(
    (merged.activeSession?.entries ?? []).map((e) => e.pantryItemId).sort(),
    ALL_FOUR,
    'one fold cycle must reach the full union, not a subset',
  );
});

test('CAS conflict retries converge to the union and never shrink across repeated cycles', () => {
  const owner = state(
    session(ALL_FOUR.map((id) => entry(id, 'store-a', T))),
    ALL_FOUR.map((id) => pantryItem(id, true)),
    T + 5000,
  );
  const memberLocal = state(
    session([entry('a', 'store-a', T)]),
    [pantryItem('a', true), pantryItem('b', false), pantryItem('c', false), pantryItem('d', false)],
    T + 1000,
  );

  // Simulate several CAS-conflict retry rounds: each round re-pulls the same
  // owner state and re-merges against the member's (unchanged) local state,
  // exactly as performHouseholdPushAttempt does on every CAS_CONFLICT retry.
  let previousCount = 0;
  for (let round = 0; round < 5; round += 1) {
    const merged = mergeDurableSnapshotForPush(owner, memberLocal);
    const count = merged.activeSession?.entries.length ?? 0;
    assert.ok(count >= previousCount, `round ${round}: entry count must never shrink (was ${previousCount}, now ${count})`);
    assert.equal(count, 4, `round ${round}: must converge to the full union immediately, not just monotonically`);
    previousCount = count;
  }
});

test('reconcileShoppingSession alone: a fresh union does not get re-collapsed by a second reconcile pass', () => {
  const merged = mergeDurableSnapshotForPush(
    state(session(ALL_FOUR.map((id) => entry(id, 'store-a', T))), ALL_FOUR.map((id) => pantryItem(id, true)), T + 5000),
    state(session([entry('a', 'store-a', T)]), [pantryItem('a', true), pantryItem('b', false), pantryItem('c', false), pantryItem('d', false)], T + 1000),
  );

  // Running reconcile again (as the next pull cycle would) against the same
  // still-lagging local items must be a no-op, not a further shrink.
  const reReconciled = reconcileShoppingSession(merged.activeSession!, merged.items);
  assert.deepEqual(reReconciled.entries.map((e) => e.pantryItemId).sort(), ALL_FOUR);
});
