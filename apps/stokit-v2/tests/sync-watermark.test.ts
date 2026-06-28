import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldApplyRemote,
  markRemoteApplied,
  resetSyncWatermark,
} from '../core/services/syncWatermark';

// Shared module state — reset before every test.
function setup() {
  resetSyncWatermark();
}

test('directional unblock: Owner snapshot applies on Wife even when Wife local write freshness is higher', () => {
  setup();
  // Wife last pulled remote at T=3; then wrote locally (not reflected in watermark).
  markRemoteApplied(3);
  // Owner pushes at T=5. Wife local updatedAt might be 10 from her own writes,
  // but the watermark is 3 — so Owner's T=5 snapshot must apply.
  assert.ok(shouldApplyRemote(5), 'should apply Owner snapshot with updatedAt=5');
});

test('own reflection skip: device does not re-apply the snapshot it just pushed', () => {
  setup();
  markRemoteApplied(10);
  // Realtime fires the same snapshot back on the originating device.
  assert.equal(shouldApplyRemote(10), false, 'should skip own reflection at updatedAt=10');
});

test('stale remote skip: older snapshot does not overwrite a newer already-applied state', () => {
  setup();
  markRemoteApplied(8);
  assert.equal(shouldApplyRemote(7), false, 'should skip stale snapshot with updatedAt=7');
});

test('cleanup reset: stopSyncEngine watermark resets to 0 so next household starts fresh', () => {
  setup();
  markRemoteApplied(42);
  resetSyncWatermark(); // mirrors what stopSyncEngine() calls
  // After reset, any positive timestamp should be accepted.
  assert.ok(shouldApplyRemote(1), 'should accept any snapshot after watermark reset');
});

test('Wife local edit does not block Owner remote update arriving above the watermark', () => {
  setup();
  // Both devices synced to T=3 after household join.
  markRemoteApplied(3);
  // Wife writes locally — this does NOT call markRemoteApplied, so watermark stays at 3.
  // Wife local updatedAt is now, say, 10. Owner then pushes T=4.
  // Under the old `local.updatedAt` guard, 4 ≤ 10 → blocked. Under the watermark guard, 4 > 3 → applies.
  assert.ok(shouldApplyRemote(4), 'Owner T=4 snapshot must apply despite Wife local updatedAt being 10');
});
