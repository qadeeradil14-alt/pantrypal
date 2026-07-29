/**
 * P0 regression: a canceled (or finished) trip kept reappearing on both
 * devices no matter how many times the user canceled it.
 *
 * Root cause: canceling a trip (END_TRIP) reset the local session to idle
 * but left no record anywhere that the tripId had been explicitly closed.
 * A finished trip was protected — isCompletedShoppingSession checks the
 * committed `trips` array before ever re-adopting a stale session — but a
 * canceled trip never gets committed to `trips`, so nothing protected it.
 * Any device that still held the old active session in memory (hadn't
 * pulled since before the cancel) could push it back up with a fresh,
 * monotonically-higher timestamp (pushLocalState always stamps newer than
 * whatever the server currently has, regardless of content). When that
 * stale-but-newer-timestamped push was later pulled by the device that
 * canceled, foldRemoteActiveSession saw local was idle with a mismatched
 * tripId and — with no way to know that tripId was already closed — fell
 * through to `return remoteSession`, resurrecting the trip. Repeats
 * indefinitely because nothing ever marked the tripId as dead.
 *
 * Fix: a new closedTripIds tombstone (types/index.ts, mirroring
 * deletedItems) is stamped whenever a trip closes (session-store.ts, on any
 * transition into idle/trip_summary), merged the same way as deletedItems
 * everywhere a snapshot is pushed/pulled/hydrated, and consulted by both
 * foldRemoteActiveSession (apply-time) and isCompletedShoppingSession
 * (push-time) so a stale echo can never resurrect a trip either side has
 * already closed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduce,
  initialSession,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import { isCompletedShoppingSession } from '../core/services/shoppingSessionSyncPolicy';
import type { DurableState } from '../types';

const NOW = 1_700_000_000_000;

function singleStoreTrip(now = NOW): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now,
    shopperId: 'nargis',
    entries: [{ pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'lidl', picked: false }],
  });
}

function makeState(overrides: Partial<DurableState> = {}): DurableState {
  return {
    items: [],
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs: {} as DurableState['prefs'],
    activeSession: null,
    updatedAt: 0,
    deletedItems: [],
    closedTripIds: [],
    ...overrides,
  };
}

test('[repro] canceling a trip does not by itself stop a stale device from resurrecting it (no closedTripIds tracked)', () => {
  const active = singleStoreTrip();
  // Device A cancels — local goes idle. Device B never learned about the
  // cancel and still holds the old active session in memory.
  const deviceAAfterCancel = initialSession;
  const deviceBStalePush = active;

  // Without any closed-trip knowledge, the fold has no choice but to adopt
  // the incoming (stale) active session wholesale — this documents exactly
  // what used to happen.
  const result = foldRemoteActiveSession(deviceAAfterCancel, deviceBStalePush);
  assert.equal(result.status, 'shopping_store', 'demonstrates the un-tombstoned resurrection this bug produced');
  assert.equal(result.tripId, active.tripId);
});

test('[fixed] foldRemoteActiveSession refuses to resurrect a trip tombstoned as closed', () => {
  const active = singleStoreTrip();
  const deviceAAfterCancel = initialSession;
  const deviceBStalePush = active;

  const isClosedTripId = (tripId: string) => tripId === active.tripId;
  const result = foldRemoteActiveSession(deviceAAfterCancel, deviceBStalePush, isClosedTripId);

  assert.equal(result.status, 'idle', 'the closed trip must never come back');
  assert.equal(result.tripId, null);
});

test('[fixed] a genuinely different, newer trip (different tripId) still applies normally', () => {
  const oldTrip = singleStoreTrip(NOW);
  const newTrip = singleStoreTrip(NOW + 100_000); // a fresh START_TRIP after the cancel — different tripId
  const deviceAAfterCancel = initialSession;

  const isClosedTripId = (tripId: string) => tripId === oldTrip.tripId; // only the OLD trip is closed
  const result = foldRemoteActiveSession(deviceAAfterCancel, newTrip, isClosedTripId);

  assert.equal(result.status, 'shopping_store', 'a genuinely new trip must still be adopted');
  assert.equal(result.tripId, newTrip.tripId);
});

test('[fixed] repeated resurrection attempts (simulating "did it 3 times") all fail identically', () => {
  const active = singleStoreTrip();
  const isClosedTripId = (tripId: string) => tripId === active.tripId;

  let session: ShoppingSession = initialSession;
  for (let i = 0; i < 3; i++) {
    session = foldRemoteActiveSession(session, active, isClosedTripId);
    assert.equal(session.status, 'idle', `attempt ${i + 1} must not resurrect the trip`);
  }
});

test('[fixed] a finished (trip_summary) local session is likewise protected against a stale active echo', () => {
  const active = singleStoreTrip();
  const finished: ShoppingSession = { ...active, status: 'trip_summary', completedTrip: null };
  const isClosedTripId = (tripId: string) => tripId === active.tripId;

  const result = foldRemoteActiveSession(finished, active, isClosedTripId);
  // trip_summary is itself a terminal early-bail in foldRemoteActiveSession;
  // with the tripId closed, it must fall back to the (terminal) previous
  // value rather than reopen the trip.
  assert.notEqual(result.status, 'shopping_store');
});

test('[fixed] isCompletedShoppingSession also honors closedTripIds, not just the committed trips array', () => {
  const session = { status: 'shopping_store', tripId: 't_lidl' };
  assert.equal(isCompletedShoppingSession(session, []), false, 'sanity: not completed with no evidence');
  assert.equal(isCompletedShoppingSession(session, [], [{ id: 't_lidl' }]), true, 'a closed-trip tombstone alone is enough');
  assert.equal(isCompletedShoppingSession(session, [{ id: 't_other' }], [{ id: 't_other' }]), false, 'an unrelated tombstone must not match');
});

test('[fixed] mergeDurableSnapshotForPush clears activeSession when either side has already closed that tripId', () => {
  const active = singleStoreTrip();

  // Remote still shows the stale active session (from before Device A's
  // cancel reached the server); local (Device A) has already recorded a
  // closedTripIds tombstone for it.
  // Real wall-clock timestamps here (not the fictional NOW constant used
  // elsewhere) — mergeTombstones prunes tombstones older than its 60-day
  // retention window against the actual current time.
  const realNow = Date.now();
  const remote = makeState({ activeSession: active, updatedAt: realNow });
  const local = makeState({
    activeSession: null,
    closedTripIds: [{ id: active.tripId!, deletedAt: realNow + 100 }],
    updatedAt: realNow + 100,
  });

  const merged = mergeDurableSnapshotForPush(remote, local);
  assert.equal(merged.activeSession, null, 'the closed trip must not survive the push-time merge');
  assert.ok(merged.closedTripIds?.some((t) => t.id === active.tripId), 'the tombstone itself must propagate forward');
});

test('[fixed] closedTripIds tombstones union across both sides of a push merge, same as deletedItems', () => {
  const realNow = Date.now();
  const remote = makeState({ closedTripIds: [{ id: 't_a', deletedAt: realNow }], updatedAt: realNow });
  const local = makeState({ closedTripIds: [{ id: 't_b', deletedAt: realNow + 10 }], updatedAt: realNow + 10 });

  const merged = mergeDurableSnapshotForPush(remote, local);
  const ids = (merged.closedTripIds ?? []).map((t) => t.id).sort();
  assert.deepEqual(ids, ['t_a', 't_b']);
});
