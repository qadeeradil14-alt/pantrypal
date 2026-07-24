import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newestUnseenTrip } from '../core/services/tripCompletionAck';
import type { Trip } from '../types';

function trip(id: string, completedAt: number, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    storeIdsVisited: ['aldi'],
    skippedStoreIds: [],
    itemsBought: 3,
    itemsRemaining: 0,
    itemsOutOfStock: 0,
    receiptIds: [],
    totalSpent: 12.5,
    breakdown: [],
    purchasedItems: [],
    startedAt: completedAt - 1_000,
    completedAt,
    duration: 1_000,
    ...overrides,
  };
}

test('a trip completed after the acknowledgment floor is returned', () => {
  const trips = [trip('t1', 1_000)];
  assert.equal(newestUnseenTrip(trips, 0)?.id, 't1');
});

test('a trip completed at or before the acknowledgment floor is not returned (no re-show after restart)', () => {
  const trips = [trip('t1', 1_000)];
  assert.equal(newestUnseenTrip(trips, 1_000), null, 'exactly-acknowledged must not reappear');
  assert.equal(newestUnseenTrip(trips, 1_500), null, 'acknowledged-and-older must not reappear');
});

test('an empty trips array has nothing unseen', () => {
  assert.equal(newestUnseenTrip([], 0), null);
});

test('picks the newest trip when multiple are unseen', () => {
  const trips = [trip('older', 1_000), trip('newer', 2_000), trip('oldest', 500)];
  assert.equal(newestUnseenTrip(trips, 0)?.id, 'newer');
});

test('a newer trip becomes unseen again after an older one was acknowledged', () => {
  const trips = [trip('t1', 1_000), trip('t2', 2_000)];
  // Acknowledged through t1 — t2 (completed later) must still surface.
  assert.equal(newestUnseenTrip(trips, 1_000)?.id, 't2');
});

test('trip order in the array does not matter — result is by completedAt, not position', () => {
  const trips = [trip('newer', 2_000), trip('older', 1_000)];
  assert.equal(newestUnseenTrip(trips, 0)?.id, 'newer');
});

// ── First-run initialization scenario (OTA 399 bug) ─────────────────────────
//
// Models the hook's exact baseline arithmetic (a Math.max reduce over
// existing trips) end-to-end, independent of the source-regex wiring proof.

function establishBaseline(trips: Trip[]): number {
  return trips.reduce((max, t) => Math.max(max, t.completedAt), 0);
}

test('existing historical trips + no acknowledgment => baseline is the newest trip, nothing shown', () => {
  const trips = [trip('old1', 1_000), trip('old2', 5_000), trip('old3', 3_000)];
  const baseline = establishBaseline(trips);
  assert.equal(baseline, 5_000, 'baseline must be the newest trip already in history');
  assert.equal(newestUnseenTrip(trips, baseline), null, 'no historical trip may surface once baselined');
});

test('no historical trips + no acknowledgment => baseline is 0, nothing shown', () => {
  const baseline = establishBaseline([]);
  assert.equal(baseline, 0);
  assert.equal(newestUnseenTrip([], baseline), null);
});

test('a genuinely new remote trip after the baseline is established shows exactly once, then is suppressed', () => {
  const historical = [trip('old1', 1_000), trip('old2', 5_000)];
  const baseline = establishBaseline(historical);

  // A new trip lands from a peer, completed after the baseline was set.
  const withNewTrip = [...historical, trip('new1', 9_000)];
  const shown = newestUnseenTrip(withNewTrip, baseline);
  assert.equal(shown?.id, 'new1', 'the genuinely new trip must surface');

  // Simulate dismissal persisting acknowledgment through the shown trip.
  const acknowledgedThrough = shown!.completedAt;
  assert.equal(newestUnseenTrip(withNewTrip, acknowledgedThrough), null,
    'after dismissal (or an app restart re-reading the same persisted floor), the same trip must not reappear');
});

test('a still-later trip can trigger again after the previous one was acknowledged', () => {
  const historical = [trip('old1', 1_000), trip('old2', 5_000)];
  const baseline = establishBaseline(historical);
  const afterFirstNewTrip = [...historical, trip('new1', 9_000)];
  const ackThroughFirst = newestUnseenTrip(afterFirstNewTrip, baseline)!.completedAt;

  const afterSecondNewTrip = [...afterFirstNewTrip, trip('new2', 12_000)];
  assert.equal(newestUnseenTrip(afterSecondNewTrip, ackThroughFirst)?.id, 'new2');
});
