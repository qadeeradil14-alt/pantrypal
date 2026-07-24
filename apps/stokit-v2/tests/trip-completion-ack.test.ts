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
