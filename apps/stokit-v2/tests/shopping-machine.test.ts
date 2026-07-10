import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reduce,
  initialSession,
  currentStoreId,
  currentStoreEntries,
  pendingStoreIds,
  type ShoppingSession,
} from '../core/shopping-machine';
import type { ShoppingEntry } from '../types';

function entry(itemId: string, storeId: string): ShoppingEntry {
  return { itemId, name: `Item ${itemId}`, quantity: 1, unit: 'unit', storeId, picked: false };
}

const TWO_STORE_ENTRIES: ShoppingEntry[] = [
  entry('milk', 'aldi'), entry('eggs', 'aldi'), entry('oil', 'target'),
];

function startTrip(): ShoppingSession {
  return reduce(initialSession, { type: 'START_TRIP', entries: TWO_STORE_ENTRIES, now: 1000 });
}

// ── Existing tests (updated for store_summary step) ───────────────────────────

test('START_TRIP groups items by store and starts at first store', () => {
  const s = startTrip();
  assert.equal(s.status, 'shopping_store');
  assert.deepEqual(s.storeQueue, ['aldi', 'target']);
  assert.equal(s.currentIndex, 0);
  assert.equal(currentStoreId(s), 'aldi');
  assert.equal(currentStoreEntries(s).length, 2);
  assert.equal(s.tripId, 't_1000');
});

test('START_TRIP dedupes duplicate items', () => {
  const dupes = [...TWO_STORE_ENTRIES, entry('milk', 'aldi'), entry('milk', 'target')];
  const s = reduce(initialSession, { type: 'START_TRIP', entries: dupes, now: 1 });
  assert.equal(s.entries.filter((e) => e.itemId === 'milk').length, 1);
  assert.equal(s.entries.length, 3);
});

test('START_TRIP with no entries stays idle', () => {
  assert.equal(reduce(initialSession, { type: 'START_TRIP', entries: [], now: 1 }).status, 'idle');
});

test('a store with zero items never enters the queue', () => {
  const s = reduce(initialSession, { type: 'START_TRIP', entries: [entry('oil', 'target')], now: 1 });
  assert.deepEqual(s.storeQueue, ['target']);
});

test('TOGGLE_PICK only affects matching item', () => {
  let s = startTrip();
  s = reduce(s, { type: 'TOGGLE_PICK', itemId: 'milk' });
  assert.equal(s.entries.find((e) => e.itemId === 'milk')?.picked, true);
  assert.equal(s.entries.find((e) => e.itemId === 'eggs')?.picked, false);
});

test('full multi-store flow: shop→receipt→summary→next→shop→summary→trip', () => {
  let s = startTrip();

  // Store 1 (aldi)
  s = reduce(s, { type: 'SET_PICK', itemId: 'milk', picked: true });
  s = reduce(s, { type: 'SET_PICK', itemId: 'eggs', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  assert.equal(s.status, 'receipt_prompt');

  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 42.5, status: 'logged', now: 2100 });
  assert.equal(s.status, 'store_summary');         // ← per-store summary
  assert.equal(s.receipts[0].storeId, 'aldi');

  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });  // ← user taps Continue
  assert.equal(s.status, 'continue_prompt');
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  assert.equal(s.status, 'next_store_ready');       // ← pick next store

  s = reduce(s, { type: 'ADVANCE_STORE' });         // ← legacy / first pending
  assert.equal(s.status, 'shopping_store');
  assert.equal(currentStoreId(s), 'target');

  // Store 2 (target)
  s = reduce(s, { type: 'SET_PICK', itemId: 'oil', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 3000 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 10, status: 'logged', now: 3100 });
  assert.equal(s.status, 'store_summary');

  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  assert.equal(s.status, 'continue_prompt');
  s = reduce(s, { type: 'FINISH_TRIP', now: 3200 });
  assert.equal(s.status, 'trip_summary');           // ← no more pending → final

  const trip = s.completedTrip!;
  assert.deepEqual(trip.storeIdsVisited, ['aldi', 'target']);
  assert.equal(trip.itemsBought, 3);
  assert.equal(trip.totalSpent, 52.5);
  assert.equal(trip.breakdown.length, 2);
  assert.equal(trip.breakdown[0].itemsBought, 2);
  assert.equal(trip.breakdown[1].itemsBought, 1);
  assert.equal(trip.skippedStoreIds.length, 0);
  // Every picked item must show up in the trip record even though none of
  // them had a per-item price logged (only a per-store receipt total).
  assert.equal(trip.purchasedItems.length, 3);
  assert.deepEqual(trip.purchasedItems.map((i) => i.itemId).sort(), ['eggs', 'milk', 'oil']);
  assert.ok(trip.purchasedItems.every((i) => i.price === 0));
});

test('skipping a receipt advances exactly like saving (never blocks)', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2100 });
  assert.equal(s.status, 'store_summary');
  assert.equal(s.receipts[0].status, 'skipped');

  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  s = reduce(s, { type: 'SET_PICK', itemId: 'oil', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 3000 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 20, status: 'logged', now: 3100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  assert.equal(s.status, 'continue_prompt');
  s = reduce(s, { type: 'FINISH_TRIP', now: 3200 });
  assert.equal(s.status, 'trip_summary');
  assert.equal(s.completedTrip!.totalSpent, 20);
});

test('receipt state is not cleared before trip summary', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 5, status: 'logged', now: 2100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  assert.equal(s.receipts.length, 1, 'receipt survives store advance');
});

test('END_TRIP returns clean session for second trip', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  s = reduce(s, { type: 'FINISH_STORE', now: 3000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  assert.equal(s.status, 'continue_prompt');
  s = reduce(s, { type: 'FINISH_TRIP', now: 3200 });
  assert.equal(s.status, 'trip_summary');

  const cleaned = reduce(s, { type: 'END_TRIP' });
  assert.deepEqual(cleaned, initialSession);
  const s2 = reduce(cleaned, { type: 'START_TRIP', entries: TWO_STORE_ENTRIES, now: 5000 });
  assert.equal(s2.status, 'shopping_store');
  assert.equal(s2.tripId, 't_5000');
});

test('events are ignored in wrong states', () => {
  assert.equal(reduce(initialSession, { type: 'FINISH_STORE', now: 1 }).status, 'idle');
  const shopping = startTrip();
  assert.equal(reduce(shopping, { type: 'SAVE_RECEIPT', amount: 1, status: 'logged', now: 1 }).status, 'shopping_store');
  assert.equal(reduce(shopping, { type: 'ADVANCE_STORE' }).status, 'shopping_store');
});

// ── New tests ─────────────────────────────────────────────────────────────────

test('CHOOSE_NEXT_STORE lets user pick any pending store out of order', () => {
  const entries = [entry('a', 'aldi'), entry('b', 'target'), entry('c', 'walmart')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries, now: 1 });
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  assert.equal(s.status, 'next_store_ready');

  // Pick walmart instead of target (out of order)
  s = reduce(s, { type: 'CHOOSE_NEXT_STORE', storeId: 'walmart' });
  assert.equal(s.status, 'shopping_store');
  assert.equal(currentStoreId(s), 'walmart');
  assert.deepEqual(pendingStoreIds(s), ['target']); // target still pending
});

test('SKIP_STORE removes a pending store and keeps others in next_store_ready', () => {
  const entries = [entry('a', 'aldi'), entry('b', 'target'), entry('c', 'walmart')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries, now: 1 });
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });

  s = reduce(s, { type: 'SKIP_STORE', storeId: 'target', now: 4 });
  assert.equal(s.status, 'next_store_ready');
  assert.deepEqual(pendingStoreIds(s), ['walmart']);
  assert.deepEqual(s.skippedStoreIds, ['target']);
});

test('SKIP_STORE with last pending store goes straight to trip_summary', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });

  s = reduce(s, { type: 'SKIP_STORE', storeId: 'target', now: 4 });
  assert.equal(s.status, 'trip_summary');
  assert.ok(s.completedTrip);
  assert.deepEqual(s.completedTrip!.skippedStoreIds, ['target']);
  assert.equal(s.completedTrip!.breakdown.find((b) => b.storeId === 'target')?.skipped, true);
});

test('FINISH_TRIP_EARLY marks all pending as skipped and builds final summary', () => {
  const entries = [entry('a', 'aldi'), entry('b', 'target'), entry('c', 'walmart')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries, now: 1000 });
  s = reduce(s, { type: 'SET_PICK', itemId: 'a', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 30, status: 'logged', now: 2100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });

  s = reduce(s, { type: 'FINISH_TRIP_EARLY', now: 3000 });
  assert.equal(s.status, 'trip_summary');
  const trip = s.completedTrip!;
  assert.equal(trip.totalSpent, 30);
  assert.equal(trip.itemsBought, 1);
  assert.equal(trip.skippedStoreIds.sort().join(','), 'target,walmart');
  assert.equal(trip.storeIdsVisited.length, 1);
  assert.equal(trip.breakdown.filter((b) => b.skipped).length, 2);
});

test('pendingStoreIds excludes skipped stores', () => {
  const entries = [entry('a', 'aldi'), entry('b', 'target'), entry('c', 'walmart')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries, now: 1 });
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'SKIP_STORE', storeId: 'target', now: 4 });
  assert.deepEqual(pendingStoreIds(s), ['walmart']);
});

test('every completed store waits for an explicit continue-or-finish decision', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  assert.equal(s.status, 'continue_prompt');

  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  s = reduce(s, { type: 'FINISH_STORE', now: 4 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 5 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  assert.equal(s.status, 'continue_prompt');
  assert.equal(s.completedTrip, null);
});

test('FINISH_TRIP explicitly completes the full trip from the continuation prompt', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'FINISH_TRIP', now: 4 });

  assert.equal(s.status, 'trip_summary');
  assert.ok(s.completedTrip);
  assert.deepEqual(s.completedTrip!.skippedStoreIds, ['target']);
});

test('store summary directly supports continue and finish decisions', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  assert.equal(s.status, 'store_summary');

  const continued = reduce(s, { type: 'CONTINUE_TRIP' });
  assert.equal(continued.status, 'next_store_ready');

  const finished = reduce(s, { type: 'FINISH_TRIP', now: 4 });
  assert.equal(finished.status, 'trip_summary');
});

test('START_MANUAL_STORE continues the same trip with an unplanned empty store visit', () => {
  const oneStoreEntries = [entry('milk', 'aldi')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries: oneStoreEntries, now: 1 });
  const tripId = s.tripId;
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'trader-joes' });

  assert.equal(s.status, 'shopping_store');
  assert.equal(s.tripId, tripId);
  assert.equal(currentStoreId(s), 'trader-joes');
  assert.equal(currentStoreEntries(s).length, 0);
  assert.deepEqual(s.storeQueue, ['aldi', 'trader-joes']);
});

test('START_MANUAL_STORE cannot revisit a store already in the active trip', () => {
  let s = startTrip();
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });

  const unchanged = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'aldi' });
  assert.equal(unchanged, s);
});

test('START_MANUAL_STORE inserts mid-queue without stranding an already-planned store', () => {
  // Two planned stores: aldi, target. Finish aldi, then add an unplanned
  // store ("whole-foods") instead of continuing straight to target.
  let s = startTrip(); // storeQueue = ['aldi', 'target'], currentIndex = 0
  s = reduce(s, { type: 'FINISH_STORE', now: 2 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 3 });
  assert.equal(s.status, 'store_summary');

  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'whole-foods' });
  assert.equal(s.status, 'shopping_store');
  assert.equal(currentStoreId(s), 'whole-foods');
  assert.deepEqual(s.storeQueue, ['aldi', 'whole-foods', 'target']);
  // 'target' must still be pending — not stranded behind currentIndex.
  assert.deepEqual(pendingStoreIds(s), ['target']);

  s = reduce(s, { type: 'FINISH_STORE', now: 4 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 5 });
  assert.equal(s.status, 'store_summary');

  const continued = reduce(s, { type: 'CONTINUE_TRIP' });
  assert.equal(continued.status, 'next_store_ready');
  assert.deepEqual(pendingStoreIds(continued), ['target']);

  const advanced = reduce(continued, { type: 'ADVANCE_STORE' });
  assert.equal(currentStoreId(advanced), 'target');

  let finalSession = reduce(advanced, { type: 'FINISH_STORE', now: 6 });
  finalSession = reduce(finalSession, { type: 'SKIP_RECEIPT', now: 7 });
  const finished = reduce(finalSession, { type: 'FINISH_TRIP', now: 8 });
  assert.equal(finished.status, 'trip_summary');
  // target was actually visited, not auto-skipped by the FINISH_TRIP gap.
  assert.equal(finished.skippedStoreIds.includes('target'), false);
  assert.deepEqual(finished.completedTrip?.storeIdsVisited, ['aldi', 'whole-foods', 'target']);
});

// ── ADD_ENTRY ("+ Add more" during an active trip) ─────────────────────────────

test('ADD_ENTRY adds a brand-new item straight to the current store', () => {
  let s = startTrip(); // currently shopping 'aldi'
  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('bread', 'aldi') });
  assert.equal(currentStoreEntries(s).some((e) => e.itemId === 'bread'), true);
  assert.equal(entriesForStoreCount(s, 'aldi'), 3);
});

test('ADD_ENTRY is a true no-op for an item already in the current store', () => {
  let s = startTrip(); // 'milk' already in aldi
  const before = s;
  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('milk', 'aldi') });
  assert.equal(s, before);
  assert.equal(entriesForStoreCount(s, 'aldi'), 2);
});

test('ADD_ENTRY re-homes an item already planned for a different store to the current one', () => {
  // 'oil' starts out tied to target (stop 2), user is actively shopping aldi (stop 1)
  // and taps "+ Add more" -> selects oil. It must move into aldi's list immediately,
  // not be dropped, and must not leave a stray entry behind for target.
  let s = startTrip();
  assert.equal(currentStoreId(s), 'aldi');
  assert.equal(entriesForStoreCount(s, 'target'), 1); // oil, pre-planned

  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('oil', 'aldi') });

  assert.equal(currentStoreEntries(s).some((e) => e.itemId === 'oil'), true, 'oil now in current store list');
  assert.equal(entriesForStoreCount(s, 'target'), 0, 'no leftover entry remains for target');
  assert.equal(s.entries.filter((e) => e.itemId === 'oil').length, 1, 'exactly one entry for the item, not two');

  // Pick it, finish the whole trip, and confirm it's accounted for at aldi, not target.
  s = reduce(s, { type: 'SET_PICK', itemId: 'milk', picked: true });
  s = reduce(s, { type: 'SET_PICK', itemId: 'oil', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2100 });
  s = reduce(s, { type: 'ACKNOWLEDGE_SUMMARY' });
  s = reduce(s, { type: 'FINISH_TRIP', now: 2200 }); // target never visited -> becomes skipped

  assert.equal(s.status, 'trip_summary');
  const trip = s.completedTrip!;
  assert.equal(trip.itemsBought, 2, 'milk + oil both counted as bought at aldi');
  assert.equal(trip.breakdown.find((b) => b.storeId === 'aldi')?.itemsBought, 2);
  assert.equal(trip.breakdown.find((b) => b.storeId === 'target')?.itemsBought, 0, 'target has nothing left to buy');
});

function entriesForStoreCount(s: ShoppingSession, storeId: string): number {
  return s.entries.filter((e) => e.storeId === storeId).length;
}

// ── REMOVE_ENTRY (delete an item added by mistake mid-trip) ────────────────────

test('REMOVE_ENTRY removes the item and tombstones its id', () => {
  let s = startTrip(); // currently shopping 'aldi'
  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('bread', 'aldi') });
  assert.equal(entriesForStoreCount(s, 'aldi'), 3);

  s = reduce(s, { type: 'REMOVE_ENTRY', itemId: 'bread' });

  assert.equal(s.entries.some((e) => e.itemId === 'bread'), false, 'item is gone from entries');
  assert.equal(entriesForStoreCount(s, 'aldi'), 2);
  assert.deepEqual(s.removedItemIds, ['bread']);
});

test('REMOVE_ENTRY is a no-op outside shopping_store', () => {
  const before = initialSession;
  const after = reduce(before, { type: 'REMOVE_ENTRY', itemId: 'milk' });
  assert.equal(after, before);
});

test('REMOVE_ENTRY is a no-op for an id not present in entries', () => {
  let s = startTrip();
  const before = s;
  s = reduce(s, { type: 'REMOVE_ENTRY', itemId: 'nonexistent' });
  assert.equal(s, before, 'must return the same reference when nothing changes');
});

test('ADD_ENTRY un-tombstones an item previously removed', () => {
  let s = startTrip();
  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('bread', 'aldi') });
  s = reduce(s, { type: 'REMOVE_ENTRY', itemId: 'bread' });
  assert.deepEqual(s.removedItemIds, ['bread']);

  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('bread', 'aldi') });

  assert.equal(s.entries.some((e) => e.itemId === 'bread'), true, 'item is back in entries');
  assert.deepEqual(s.removedItemIds, [], 're-adding clears the tombstone');
});

test('removing an item does not affect other entries or store queue', () => {
  let s = startTrip();
  s = reduce(s, { type: 'REMOVE_ENTRY', itemId: 'milk' });
  assert.equal(entriesForStoreCount(s, 'aldi'), 1, 'eggs remains');
  assert.deepEqual(s.storeQueue, ['aldi', 'target'], 'store queue unaffected by item removal');
});

// ── Regression: lingering items after store completion ────────────────────────
// store_summary must carry picked entries so the session-store side-effect
// can immediately mark those items stocked in the durable store — rather than
// waiting until trip_summary. Without this, items showed as "low" even after
// the user had picked them off the shelf.

test('store_summary entries retain picked=true for the completed store', () => {
  let s = startTrip();
  s = reduce(s, { type: 'SET_PICK', itemId: 'milk', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2100 });

  assert.equal(s.status, 'store_summary');
  const aldiEntries = s.entries.filter((e) => e.storeId === 'aldi');
  assert.equal(aldiEntries.find((e) => e.itemId === 'milk')?.picked, true,  'picked item must be picked=true at store_summary');
  assert.equal(aldiEntries.find((e) => e.itemId === 'eggs')?.picked, false, 'unpicked item stays picked=false');
});

test('picked items at store_summary are in completedTrip.purchasedItems after FINISH_TRIP', () => {
  let s = startTrip();
  s = reduce(s, { type: 'SET_PICK', itemId: 'milk', picked: true });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2100 });
  // Finish trip directly from store_summary (single-stop equivalent)
  s = reduce(s, { type: 'FINISH_TRIP', now: 2200 });

  assert.equal(s.status, 'trip_summary');
  const purchased = s.completedTrip!.purchasedItems.map((i) => i.itemId);
  assert.ok(purchased.includes('milk'), 'picked item appears in purchasedItems');
  assert.ok(!purchased.includes('eggs'), 'unpicked item is not in purchasedItems');
});
