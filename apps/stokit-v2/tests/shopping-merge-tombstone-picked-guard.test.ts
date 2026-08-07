import assert from 'node:assert/strict';
import test from 'node:test';

import {
  foldRemoteActiveSession,
  mergeShoppingEntries,
  resolveRemovedEntryIds,
} from '../core/services/shoppingEntrySync';
import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine/machine';
import type { ShoppingEntry } from '../types';

/**
 * Track A merge-layer fix: a locally picked entry must never be removed
 * solely because a peer contributed this entryId to removedEntryIds — that
 * peer may be a stale snapshot taken before the pick happened.
 *
 * Proven mechanism (field replay, OTA 473, trip t_1786062749643): Device A
 * picks items; Device B holds a stale pre-pick copy of the same entries;
 * B's removedEntryIds reach mergeShoppingEntries; the picked entries were
 * dropped by the tombstone filter with no picked check. Fixed at
 * core/services/shoppingEntrySync.ts's mergeShoppingEntries final filter.
 */

function entry(over: Partial<ShoppingEntry>): ShoppingEntry {
  return {
    entryId: 'occ:1', pantryItemId: 'item', stopId: 'stop:1',
    name: 'Tomato', quantity: 1, unit: 'unit', storeId: 'sams', picked: false,
    ...over,
  };
}

test('a stale peer tombstone cannot remove a picked entry', () => {
  const picked = entry({ picked: true, pickedAt: 500, addedAt: 100 });
  const staleTombstoned = entry({ picked: false, addedAt: 100 });
  const merged = mergeShoppingEntries([picked], [staleTombstoned], ['occ:1']);
  assert.equal(merged.length, 1, 'the picked entry must survive the tombstone');
  assert.equal(merged[0].picked, true);
  assert.equal(merged[0].pickedAt, 500);
});

test('both merge directions agree: a picked entry survives a stale peer tombstone', () => {
  const picked = entry({ picked: true, pickedAt: 500, addedAt: 100 });
  const staleTombstoned = entry({ picked: false, addedAt: 100 });
  const fwd = mergeShoppingEntries([picked], [staleTombstoned], ['occ:1']);
  const rev = mergeShoppingEntries([staleTombstoned], [picked], ['occ:1']);
  assert.equal(fwd.length, 1);
  assert.equal(rev.length, 1);
  assert.equal(fwd[0].picked, true);
  assert.equal(rev[0].picked, true);
});

test('unpicked removal still works: a tombstoned never-picked entry is dropped', () => {
  const unpicked = entry({ picked: false });
  const merged = mergeShoppingEntries([unpicked], [], ['occ:1']);
  assert.equal(merged.length, 0);
});

test('an explicit unpick (newer pickedAt=false) still allows the tombstone to apply', () => {
  const stalePicked = entry({ picked: true, pickedAt: 100, addedAt: 100 });
  const laterUnpicked = entry({ picked: false, pickedAt: 900, addedAt: 100 });
  const merged = mergeShoppingEntries([stalePicked], [laterUnpicked], ['occ:1']);
  assert.equal(merged.length, 0, 'a legitimate later unpick lets the peer tombstone remove the entry');
});

test('out-of-stock (never-picked) entries remain removable via tombstone', () => {
  const oos = entry({ picked: false, outOfStock: true, outOfStockAt: 50 });
  const merged = mergeShoppingEntries([oos], [], ['occ:1']);
  assert.equal(merged.length, 0);
});

test('post-trip removal still works: canFoldActiveSessions refuses idle/trip_summary, so this line never applies to a finalized trip', () => {
  const idle = { status: 'idle' as const, tripId: null, startedAt: 0, storeQueue: [], currentIndex: 0, skippedStoreIds: [], entries: [], removedEntryIds: [], receipts: [], completedTrip: null };
  const remote = { ...idle, status: 'shopping_store' as const, tripId: 't1', entries: [entry({ picked: true })] };
  // idle can never fold, so no active session ever survives past finalization
  // to be filtered by this line for a closed trip.
  const folded = foldRemoteActiveSession(idle as any, remote as any);
  assert.equal(folded.status, 'shopping_store', 'a finalized (idle) local session always adopts the incoming session wholesale, bypassing mergeShoppingEntries entirely');
});

test('[field replay] two-device: Device A picks, Device B is stale and removes — picked entries survive to purchasedItems', () => {
  const STORE = 'store_msgkppgg_1z';
  const LOST = ['Tomato', 'Lemon', 'Orange', 'Apple', 'Potato'];
  const KEPT = ['Banana', 'Onion', 'Garlic'];
  const ALL = [...LOST, ...KEPT];

  let A: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1786062749643, shopperId: 'owner',
    entries: ALL.map((n) => ({ pantryItemId: `item_${n}`, name: n, quantity: 1, unit: 'unit', storeId: STORE, picked: false })),
  });
  const B_stale: ShoppingSession = JSON.parse(JSON.stringify(A));

  for (const n of ALL) {
    const e = A.entries.find((x) => x.pantryItemId === `item_${n}`)!;
    A = reduce(A, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: 1786062761114 });
  }

  let B = B_stale;
  for (const n of LOST) {
    const e = B.entries.find((x) => x.pantryItemId === `item_${n}`)!;
    B = reduce(B, { type: 'REMOVE_ENTRY', entryId: e.entryId, now: 1786062965633 });
  }
  assert.equal(B.removedEntryIds.length, LOST.length, 'sanity: B legitimately removed the 5 unpicked-on-B entries');

  const resolved = resolveRemovedEntryIds(A, B);
  const mergedEntries = mergeShoppingEntries(A.entries, B.entries, resolved.removedEntryIds);
  const survivingLost = mergedEntries.filter((e) => LOST.includes(e.name));
  assert.equal(survivingLost.length, LOST.length, 'all 5 picked entries survive the merge now');
  assert.ok(survivingLost.every((e) => e.picked));

  const folded = foldRemoteActiveSession(A, B as any) as ShoppingSession;
  let F = folded;
  F = reduce(F, { type: 'FINISH_STORE', now: 1786063029125 });
  F = reduce(F, { type: 'SAVE_RECEIPT', amount: 6, status: 'logged', now: 1786063029126 });
  F = reduce(F, { type: 'FINISH_TRIP', now: 1786063029127 });
  const purchased = F.completedTrip!.purchasedItems.map((p) => p.name).sort();
  assert.deepEqual(purchased, [...ALL].sort(), 'all 8 items (5 lost + 3 kept) now reach purchasedItems');
});
