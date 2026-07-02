import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldApplyRemote,
  markRemoteApplied,
  markPushed,
  isSelfEcho,
  resetSyncWatermark,
} from '../core/services/syncWatermark';

// Shared module state — reset before every test.
function setup() {
  resetSyncWatermark();
}

test('directional unblock: watermark layer alone does not consider local write freshness', () => {
  setup();
  // Wife last pulled remote at T=3; then wrote locally (not reflected in watermark).
  markRemoteApplied(3);
  // Owner pushes at T=5. The watermark is 3, so at THIS layer the snapshot is
  // eligible. Since WO-002 the engine applies a second gate on top
  // (shouldApplyRemoteSnapshot: remote must also be newer than local.updatedAt)
  // and reconciles a rejected-but-stale cloud snapshot by pushing local up —
  // see tests/sync-offline-safety.test.ts for the composite behavior.
  assert.ok(shouldApplyRemote(5), 'watermark layer accepts Owner snapshot with updatedAt=5');
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

test('Wife local edit does not advance the watermark layer', () => {
  setup();
  // Both devices synced to T=3 after household join.
  markRemoteApplied(3);
  // Wife writes locally — this does NOT call markRemoteApplied, so watermark stays at 3.
  // Owner then pushes T=4: above the watermark, so eligible at this layer.
  // NOTE (WO-002): the ENGINE additionally rejects T=4 when Wife's local
  // updatedAt is newer (newest-wins) and pushes Wife's newer state up so both
  // members converge. That composite gate is covered in
  // tests/sync-offline-safety.test.ts.
  assert.ok(shouldApplyRemote(4), 'watermark layer accepts Owner T=4 above watermark T=3');
});

// --- Self-echo detection (new: markPushed / isSelfEcho) ---

test('isSelfEcho: markPushed(T) makes isSelfEcho(T) return true', () => {
  setup();
  markPushed(100);
  assert.ok(isSelfEcho(100), 'remoteUpdatedAt matching lastPushedAt is a self-echo');
});

test('isSelfEcho: a different timestamp is not a self-echo', () => {
  setup();
  markPushed(100);
  assert.equal(isSelfEcho(101), false, 'T+1 is not a self-echo');
  assert.equal(isSelfEcho(99), false, 'T-1 is not a self-echo');
});

test('resetSyncWatermark also clears lastPushedAt', () => {
  setup();
  markPushed(50);
  resetSyncWatermark();
  assert.equal(isSelfEcho(50), false, 'after reset, previously pushed timestamp is no longer a self-echo');
});

test('self-echo does not advance watermark: Owner out-of-order update still applies', () => {
  setup();
  // Both devices joined and synced: watermark at T=10 (Owner's snapshot).
  markRemoteApplied(10);

  // Wife writes and pushes at T=20; marks that she pushed T=20.
  markPushed(20);

  // Self-echo arrives at T=20 — caller uses isSelfEcho to skip markRemoteApplied.
  // Simulate the correct pullFromSupabase behavior:
  if (shouldApplyRemote(20) && !isSelfEcho(20)) {
    markRemoteApplied(20);
  }
  // Watermark should still be 10 because the self-echo was not applied.
  assert.ok(shouldApplyRemote(15), 'Owner T=15 (concurrent, out-of-order) must still apply after self-echo at T=20');
});

test('true remote from Owner advances watermark normally', () => {
  setup();
  markRemoteApplied(10);
  markPushed(20);

  // Owner pushes T=25 — not a self-echo.
  if (shouldApplyRemote(25) && !isSelfEcho(25)) {
    markRemoteApplied(25);
  }
  // Watermark is now 25. Stale event at T=15 must be skipped.
  assert.equal(shouldApplyRemote(15), false, 'stale T=15 skipped after Owner T=25 applied');
  assert.ok(shouldApplyRemote(26), 'next Owner push at T=26 applies normally');
});
