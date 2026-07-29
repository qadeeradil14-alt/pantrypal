/**
 * P0 regression: entries a collaborator added for an upcoming store were
 * discarded on push while the shopper was between stores.
 *
 * Root cause: OTA 413 removed the "both sides must be `shopping_store`" gate
 * from foldRemoteActiveSession (the PULL path) but left the identical gate in
 * mergeActiveSession (the PUSH path, core/services/mergeDurableSnapshot.ts).
 * The shopper legitimately walks shopping_store → receipt_prompt →
 * store_summary → next_store_ready when moving from Store A to Store B, so
 * during that whole window the push refused to merge and the shopper's session
 * won wholesale — dropping every Store B entry the collaborator had added.
 * The pull path then restored them locally on the collaborator's device only,
 * producing permanent divergence and ping-pong sync.
 *
 * Fix: both paths now go through the single shared predicate
 * canFoldActiveSessions, and mergeActiveSession delegates the actual entry /
 * storeQueue / tombstone union to foldRemoteActiveSession so the two can never
 * diverge again.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import { foldRemoteActiveSession, canFoldActiveSessions } from '../core/services/shoppingEntrySync';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import type { DurableState, PantryItem } from '../types';

const T = 1_700_000_000_000;

const entry = (itemId: string, storeId: string) => ({
  itemId, name: itemId, quantity: 1, unit: 'unit' as const, storeId, picked: false,
});

const pantryItem = (id: string, storeId: string): PantryItem => ({
  id, name: id, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 2,
} as PantryItem);

const PANTRY = [
  pantryItem('hammer', 'hardware'), pantryItem('nails', 'hardware'),
  pantryItem('beans', 'canned'), pantryItem('soup', 'canned'),
];

function state(session: ShoppingSession | null, updatedAt: number, items = PANTRY): DurableState {
  return {
    items, stores: [], priceHistory: [], receipts: [], trips: [], activity: [],
    prefs: {} as DurableState['prefs'], activeSession: session, updatedAt,
    deletedItems: [], closedTripIds: [],
  };
}

/** Shopper starts a trip at Store A (Hardware). */
function shopperTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP', now: T, shopperId: 'nargis',
    entries: [entry('hammer', 'hardware'), entry('nails', 'hardware')],
  });
}

/** Collaborator, on the same trip, adds two items for Store B (Canned Foods). */
function collaboratorAddsStoreB(base: ShoppingSession): ShoppingSession {
  let s = reduce(base, { type: 'ADD_ENTRY', entry: entry('beans', 'canned') });
  s = reduce(s, { type: 'ADD_ENTRY', entry: entry('soup', 'canned') });
  return s;
}

const ids = (s: ShoppingSession | null) => (s?.entries ?? []).map((e) => e.itemId).sort();

// Every status the shopper passes through between Store A and Store B.
const TRANSITION_STATUSES: Array<[string, (s: ShoppingSession) => ShoppingSession]> = [
  ['receipt_prompt', (s) => reduce(s, { type: 'FINISH_STORE', now: T + 15 })],
  ['store_summary', (s) => reduce(reduce(s, { type: 'FINISH_STORE', now: T + 15 }), { type: 'SKIP_RECEIPT', now: T + 16 })],
];

for (const [label, advance] of TRANSITION_STATUSES) {
  test(`[fixed] Store B entries survive the push while the shopper is in ${label}`, () => {
    const base = shopperTrip();
    const collaborator = collaboratorAddsStoreB(base);
    const shopper = advance(base);
    assert.equal(shopper.status, label, 'sanity: shopper really is mid-transition');
    assert.notEqual(shopper.status, collaborator.status, 'sanity: the two sides disagree on status');
    assert.equal(shopper.tripId, collaborator.tripId, 'sanity: same trip');

    // Shopper pushes last (higher updatedAt) — the case that used to clobber.
    const pushed = mergeDurableSnapshotForPush(state(collaborator, T + 10), state(shopper, T + 20));
    assert.deepEqual(ids(pushed.activeSession as ShoppingSession), ['beans', 'hammer', 'nails', 'soup']);
    assert.ok(
      (pushed.activeSession as ShoppingSession).storeQueue.includes('canned'),
      'the upcoming store must stay in the queue',
    );
  });
}

test('[fixed] both devices converge on identical entries after push then pull', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);
  const shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });

  // 1. shopper pushes -> server
  const server = mergeDurableSnapshotForPush(state(collaborator, T + 10), state(shopper, T + 20));
  const serverSession = server.activeSession as ShoppingSession;

  // 2. both devices pull the server copy
  const shopperAfterPull = foldRemoteActiveSession(shopper, serverSession);
  const collaboratorAfterPull = foldRemoteActiveSession(collaborator, serverSession);

  assert.deepEqual(ids(shopperAfterPull), ids(collaboratorAfterPull), 'devices must converge');
  assert.deepEqual(ids(shopperAfterPull), ['beans', 'hammer', 'nails', 'soup']);
});

test('[fixed] no duplicate entries after repeated push/pull rounds', () => {
  const base = shopperTrip();
  let collaborator = collaboratorAddsStoreB(base);
  let shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });

  for (let round = 0; round < 4; round++) {
    const server = mergeDurableSnapshotForPush(
      state(collaborator, T + 10 + round * 10),
      state(shopper, T + 20 + round * 10),
    ).activeSession as ShoppingSession;
    shopper = foldRemoteActiveSession(shopper, server);
    collaborator = foldRemoteActiveSession(collaborator, server);

    assert.deepEqual(ids(shopper), ['beans', 'hammer', 'nails', 'soup'], `round ${round + 1}: shopper`);
    assert.deepEqual(ids(collaborator), ['beans', 'hammer', 'nails', 'soup'], `round ${round + 1}: collaborator`);
    assert.equal(new Set(shopper.entries.map((e) => e.itemId)).size, shopper.entries.length, 'no duplicates');
  }
});

test('[fixed] no entries are lost when the collaborator pushes last instead', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);
  const shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });

  // Reverse preference: collaborator's snapshot is the newer one.
  const pushed = mergeDurableSnapshotForPush(state(shopper, T + 10), state(collaborator, T + 20));
  assert.deepEqual(ids(pushed.activeSession as ShoppingSession), ['beans', 'hammer', 'nails', 'soup']);
});

test('a newer collaborator edit cannot roll the shared trip back to an earlier store', () => {
  const base = collaboratorAddsStoreB(shopperTrip());
  const collaborator = { ...base };
  let shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });
  shopper = reduce(shopper, { type: 'SKIP_RECEIPT', now: T + 16 });
  shopper = reduce(shopper, { type: 'CONTINUE_TRIP' });
  shopper = reduce(shopper, { type: 'ADVANCE_STORE' });
  assert.equal(shopper.currentIndex, 1);

  const pushed = mergeDurableSnapshotForPush(
    state(shopper, T + 20),
    state(collaborator, T + 30),
  ).activeSession as ShoppingSession;

  assert.equal(pushed.currentIndex, 1, 'a later item edit must not return everyone to Store A');
  assert.equal(pushed.status, 'shopping_store');
  assert.deepEqual(ids(pushed), ['beans', 'hammer', 'nails', 'soup']);
});

test('a newer collaborator edit cannot reopen a store after the shopper finishes it', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);
  const shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });

  const pushed = mergeDurableSnapshotForPush(
    state(shopper, T + 20),
    state(collaborator, T + 30),
  ).activeSession as ShoppingSession;
  const shopperAfterPull = foldRemoteActiveSession(shopper, collaborator);

  assert.equal(pushed.status, 'receipt_prompt', 'the cloud must retain the shopper progression');
  assert.equal(shopperAfterPull.status, 'receipt_prompt', 'the shopper must not regress on pull');
  assert.deepEqual(ids(pushed), ['beans', 'hammer', 'nails', 'soup']);
});

test('push and pull share one merge policy (canFoldActiveSessions)', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);
  const shopper = reduce(base, { type: 'FINISH_STORE', now: T + 15 });

  // Mismatched status on the same trip must be foldable for BOTH directions.
  assert.equal(canFoldActiveSessions(collaborator, shopper), true);
  assert.equal(canFoldActiveSessions(shopper, collaborator), true);

  // A different trip must not fold, either way.
  const otherTrip = { ...collaborator, tripId: 't_other' };
  assert.equal(canFoldActiveSessions(otherTrip, shopper), false);

  // A terminal local side must not fold.
  assert.equal(canFoldActiveSessions({ ...collaborator, status: 'trip_summary' }, shopper), false);
  assert.equal(canFoldActiveSessions({ ...collaborator, status: 'idle' }, shopper), false);
});

test('[OTA 415 preserved] a closed trip still cannot resurrect through the push path', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);

  // The shopper cancelled the trip; its id is tombstoned in closedTripIds.
  // Real wall-clock stamps here — mergeTombstones prunes anything older than
  // its 60-day retention window against the actual current time.
  const realNow = Date.now();
  const closed = { ...state(null, realNow + 20), closedTripIds: [{ id: base.tripId!, deletedAt: realNow }] };
  const stale = state(collaborator, realNow - 10); // peer still pushing the old session

  const merged = mergeDurableSnapshotForPush(stale, closed);
  assert.equal(merged.activeSession, null, 'the closed trip must not come back via push');
});

test('[OTA 415 preserved] a completed trip still cannot resurrect through the push path', () => {
  const base = shopperTrip();
  const collaborator = collaboratorAddsStoreB(base);

  const completed = state(null, T + 20);
  completed.trips = [{ id: base.tripId! } as DurableState['trips'][number]];
  const stale = state(collaborator, T + 10);

  assert.equal(mergeDurableSnapshotForPush(stale, completed).activeSession, null);
});
