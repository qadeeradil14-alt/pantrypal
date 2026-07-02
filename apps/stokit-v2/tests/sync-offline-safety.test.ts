/**
 * WO-002 regression gate: stale remote snapshots must never overwrite newer
 * local state.
 *
 * Root cause (Final Architecture Review, P0): the sync watermark lives in
 * module memory and resets to 0 on every app launch, and pullFromSupabase
 * never compared the incoming remote snapshot against the local durable
 * snapshot. After an offline session (local edits saved to AsyncStorage, push
 * to Supabase failed), the next online pull found any cloud snapshot
 * "newer than watermark 0", applied it wholesale via applyRemotePatch, and
 * silently destroyed the offline edits.
 *
 * Fix under test: shouldApplyRemoteSnapshot(remote, local) — the engine-level
 * gate — additionally requires remote.updatedAt > local.updatedAt. Because
 * local.updatedAt is persisted inside the durable snapshot itself
 * (durableRepository → AsyncStorage), this protection survives restarts
 * without introducing any new storage. pullFromSupabase then reconciles a
 * strictly-stale cloud snapshot by pushing the newer local state up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldApplyRemoteSnapshot,
  remoteSkipReason,
  shouldApplyRemote,
  markRemoteApplied,
  markPushed,
  resetSyncWatermark,
} from '../core/services/syncWatermark';

// Shared module state — reset before every test (same convention as
// sync-watermark.test.ts).
function setup() {
  resetSyncWatermark();
}

// ── 1. Remote older than local → rejected ─────────────────────────────────────

test('[WO-002] stale remote is rejected when local durable state is newer', () => {
  setup();
  // Cloud snapshot at T=5, local durable state at T=10 (offline edits).
  assert.equal(shouldApplyRemoteSnapshot(5, 10), false,
    'remote T=5 must not overwrite local T=10');
  assert.equal(remoteSkipReason(5, 10), 'not_newer_than_local');
});

test('[WO-002] remote equal to local is a no-op (steady-state launch must not re-apply or push)', () => {
  setup();
  // Normal post-sync launch: cloud and local carry the same timestamp.
  assert.equal(shouldApplyRemoteSnapshot(9, 9), false,
    'remote equal to local must be skipped');
  assert.equal(remoteSkipReason(9, 9), 'not_newer_than_local');
});

// ── 2. Remote newer than local → accepted ─────────────────────────────────────

test('[WO-002] genuinely newer remote snapshot still applies', () => {
  setup();
  assert.ok(shouldApplyRemoteSnapshot(11, 10),
    'remote T=11 must apply over local T=10');
  assert.equal(remoteSkipReason(11, 10), null);
});

// ── 3. Self-echo still rejected ───────────────────────────────────────────────

test('[WO-002] self-echo is still rejected, even when newer than local', () => {
  setup();
  // Device pushed T=12; applyRemotePatch({receipts}) does not bump local
  // updatedAt, so local can lag behind the pushed timestamp.
  markPushed(12);
  assert.equal(shouldApplyRemoteSnapshot(12, 10), false,
    'own echo at T=12 must be rejected');
  assert.equal(remoteSkipReason(12, 10), 'local_origin');
});

// ── 4. Restart does not reset the protection ──────────────────────────────────

test('[WO-002] offline-edit scenario: restart does not allow a stale cloud snapshot to overwrite', () => {
  setup();

  // Day 1: device syncs with the household — cloud snapshot T=5 applied.
  markRemoteApplied(5);
  const localAfterApply = 5; // applyRemotePatch spreads remote.updatedAt into local state

  // Device goes offline. User edits the pantry: persist() stamps local
  // updatedAt = 9 and saves to AsyncStorage; pushLocalState throws and is
  // swallowed. Cloud remains at T=5.
  const localUpdatedAt = 9;
  assert.ok(localUpdatedAt > localAfterApply);

  // App is killed and relaunched: in-memory watermark resets to 0.
  resetSyncWatermark();

  // Reconnect. pullFromSupabase fetches the stale cloud snapshot T=5.
  // OLD gate (watermark only): 5 > 0 → would have applied → data loss.
  assert.ok(shouldApplyRemote(5),
    'precondition: the pre-WO-002 watermark-only gate accepts the stale snapshot — this was the bug');

  // NEW gate: local durable updatedAt=9 survives the restart and blocks it.
  assert.equal(shouldApplyRemoteSnapshot(5, localUpdatedAt), false,
    'stale cloud T=5 must be rejected against restart-surviving local T=9');
  assert.equal(remoteSkipReason(5, localUpdatedAt), 'not_newer_than_local',
    'engine reconciles this case by pushing local state up (see pullFromSupabase)');
});

// ── 5. Legitimate remote update from another member still applies ─────────────

test('[WO-002] another member\'s newer update applies after a restart', () => {
  setup();
  // Fresh launch: watermark is 0, local durable state at T=9.
  // Partner pushed T=14 while this device was away.
  assert.ok(shouldApplyRemoteSnapshot(14, 9),
    'partner snapshot T=14 must apply over local T=9');
});

test('[WO-002] multi-member ordering: watermark still blocks out-of-order stale events within a session', () => {
  setup();
  // Partner update T=14 applied; local now carries T=14.
  markRemoteApplied(14);
  const localUpdatedAt = 14;
  // A late/stale realtime event at T=13 must be skipped by BOTH layers.
  assert.equal(shouldApplyRemoteSnapshot(13, localUpdatedAt), false);
  assert.equal(remoteSkipReason(13, localUpdatedAt), 'older');
  // The partner's next update applies normally.
  assert.ok(shouldApplyRemoteSnapshot(15, localUpdatedAt));
});

test('[WO-002] fresh install: empty local state (updatedAt=0) accepts any cloud snapshot', () => {
  setup();
  assert.ok(shouldApplyRemoteSnapshot(1, 0),
    'first sign-in on a new device must still hydrate from the cloud');
});
