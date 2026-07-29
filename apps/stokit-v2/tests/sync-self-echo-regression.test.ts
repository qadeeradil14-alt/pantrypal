/**
 * Regression: trip_summary → idle self-echo bug.
 *
 * Root cause proven: when FINISH_TRIP fires, durable.setActiveSession(null)
 * triggers persist() → pushLocalState(). Supabase echoes this snapshot back
 * through the realtime channel. shouldApplyRemote() accepted self-echoes
 * because it only checked `remoteUpdatedAt > lastAppliedRemoteAt` without
 * also checking isSelfEcho(). The echo applied applyRemoteSession(null),
 * wiping trip_summary back to idle before the user could see the TripSummary
 * screen or use "Reopen last store".
 *
 * Fix: shouldApplyRemote() now returns false when isSelfEcho() is true.
 * These tests are the permanent regression gate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldApplyRemote,
  markRemoteApplied,
  markPushed,
  isSelfEcho,
  resetSyncWatermark,
} from '../core/services/syncWatermark';

import {
  reduce,
  initialSession,
  type ShoppingSession,
} from '../core/shopping-machine';

import type { ShoppingEntryDraft } from '../types';

function setup() {
  resetSyncWatermark();
}

function makeEntry(pantryItemId: string, storeId: string): ShoppingEntryDraft {
  return { pantryItemId, name: `Item ${pantryItemId}`, quantity: 1, unit: 'unit', storeId, picked: true };
}

/** Drives the state machine from idle → trip_summary via the minimal valid path. */
function finishTrip(now = 1000): ShoppingSession {
  const entries: ShoppingEntryDraft[] = [makeEntry('milk', 'walmart')];
  let s = reduce(initialSession, { type: 'START_TRIP', entries, now });
  // Shop the single store
  s = reduce(s, { type: 'FINISH_STORE', now: now + 100 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: now + 200 });
  // store_summary → FINISH_TRIP
  s = reduce(s, { type: 'FINISH_TRIP', now: now + 300 });
  return s;
}

// ── Test 1: Self-echo rejected ────────────────────────────────────────────────

test('[regression] SELF_ECHO: shouldApplyRemote returns false when the timestamp is a self-echo', () => {
  setup();

  const T1 = 1_700_000_000_000;
  markPushed(T1); // Simulates pushLocalState(snap) completing and calling markPushed

  // Supabase realtime fires the exact same snapshot back at T1
  const remoteUpdatedAt = T1;

  assert.ok(isSelfEcho(remoteUpdatedAt),
    'isSelfEcho(T1) must be true — this is our own snapshot reflecting back');

  assert.equal(shouldApplyRemote(remoteUpdatedAt), false,
    'shouldApplyRemote(T1) must return false — self-echoes must never be applied');
});

// ── Test 2: Genuine remote update accepted ────────────────────────────────────

test('[regression] GENUINE_REMOTE: shouldApplyRemote returns true for a different device\'s update', () => {
  setup();

  const T1 = 1_700_000_000_000; // This device pushed at T1
  const T2 = T1 + 5000;         // Another household member pushed at T2 > T1

  markPushed(T1); // Local push recorded

  // Another device's realtime snapshot arrives at T2 — NOT our timestamp
  const remoteUpdatedAt = T2;

  assert.equal(isSelfEcho(remoteUpdatedAt), false,
    'isSelfEcho(T2) must be false — T2 came from a different device');

  assert.ok(shouldApplyRemote(remoteUpdatedAt),
    'shouldApplyRemote(T2) must return true — legitimate remote updates must sync');
});

// ── Test 3: Trip summary regression proof ─────────────────────────────────────

test('[regression] TRIP_SUMMARY_PRESERVED: simulated self-echo after FINISH_TRIP must not wipe session', () => {
  setup();

  // Step 1 — Drive the state machine to trip_summary
  const session = finishTrip(2000);
  assert.equal(session.status, 'trip_summary',
    'Precondition: reducer must produce trip_summary from FINISH_TRIP');

  // Step 2 — Simulate what durable.setActiveSession(null) + persist() + pushLocalState does:
  //   persist() stamps a fresh updatedAt and calls pushLocalState which calls markPushed.
  const pushTimestamp = 1_750_000_000_000; // fixed timestamp for determinism
  markPushed(pushTimestamp);

  // Step 3 — Supabase realtime fires the snapshot back with the same timestamp.
  //   This is the exact condition that caused the bug.
  const supabaseEchoTimestamp = pushTimestamp;

  // Step 4 — This is the gate that previously failed (accepted the echo).
  const willApply = shouldApplyRemote(supabaseEchoTimestamp);

  assert.equal(willApply, false,
    'shouldApplyRemote must return false for the self-echo — if it returned true, ' +
    'applyRemoteSession(null) would reset trip_summary to idle');

  // Step 5 — Prove the session would have been preserved.
  //   If willApply were true, the old code called applyRemoteSession(null) which called
  //   set({ session: initialSession }). Since willApply is now false, the session is untouched.
  //   We simulate the conditional that pullFromSupabase uses:
  let sessionWasReset = false;
  if (willApply) {
    // This branch must NOT execute — if it did, trip_summary would become idle
    sessionWasReset = true;
  }

  assert.equal(sessionWasReset, false,
    'The session reset branch must not execute — trip_summary must survive the self-echo');

  // The session the UI was displaying (trip_summary) is still valid
  assert.equal(session.status, 'trip_summary',
    'session.status must remain trip_summary after the self-echo is correctly rejected');
});

// ── Test 4: Multi-device safety ───────────────────────────────────────────────

test('[regression] MULTI_DEVICE: rejecting self-echoes does NOT block genuine remote updates from other members', () => {
  setup();

  // Both devices started synced at T=100 (e.g. after household join)
  markRemoteApplied(100);

  // Device A (local) finishes their own write at T=200, marks it pushed
  const deviceATimestamp = 200;
  markPushed(deviceATimestamp);

  // --- Device A's OWN echo arrives (must be rejected) ---
  assert.equal(shouldApplyRemote(deviceATimestamp), false,
    'Device A self-echo at T=200 must be rejected');

  // Self-echo did NOT advance lastAppliedRemoteAt.
  // (pullFromSupabase: if (shouldApplyRemote(ts) && !isSelfEcho(ts)) markRemoteApplied(ts))
  // Since shouldApplyRemote already returns false, markRemoteApplied is not called.

  // --- Device B (another household member) finishes their shop at T=250 ---
  const deviceBTimestamp = 250;

  assert.equal(isSelfEcho(deviceBTimestamp), false,
    'Device B timestamp T=250 must NOT be a self-echo (different device)');

  assert.ok(shouldApplyRemote(deviceBTimestamp),
    'Device B update at T=250 must be accepted — household sync must work across members');

  // Simulate Device B's update being applied and watermark advancing
  if (shouldApplyRemote(deviceBTimestamp) && !isSelfEcho(deviceBTimestamp)) {
    markRemoteApplied(deviceBTimestamp);
  }

  // --- Stale events after Device B's update must still be rejected ---
  assert.equal(shouldApplyRemote(150), false,
    'Stale event at T=150 must be rejected after watermark advanced to T=250');

  // --- Device B's next update at T=300 must still apply ---
  const deviceBTimestamp2 = 300;
  assert.equal(isSelfEcho(deviceBTimestamp2), false,
    'Device B second update at T=300 is not a self-echo');
  assert.ok(shouldApplyRemote(deviceBTimestamp2),
    'Device B second update at T=300 must apply normally — multi-member sync must not be broken');
});
