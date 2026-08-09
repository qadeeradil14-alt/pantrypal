/**
 * Regression suite: the perpetual empty household-snapshot push loop.
 *
 * Physical evidence (fresh SyncDiag export, two-device household):
 * 518 rls_push_attempt events in ~27 minutes, median cadence ~821ms, every
 * single one with outgoing.count=0 and tripId=null — i.e. nothing to sync,
 * yet the coordinator kept pushing indefinitely. This starved a real edit
 * (an item's low/expiring status) from reaching the other device for ~18
 * minutes, and independently exhausted the 2000-entry SyncDiag ring buffer
 * in ~12 minutes, destroying the evidence window around the original edit.
 *
 * Proven root cause: durableStateSemanticFingerprint (mergeDurableSnapshot.ts)
 * used plain JSON.stringify, which is sensitive to object KEY ORDER, not just
 * value. household_snapshots.state is Postgres `jsonb`, which — unlike the
 * `json` type — does NOT preserve object key insertion order. So a record
 * round-tripped through the server always comes back with its keys in a
 * different order than the same record still living in local memory, even
 * when every value is identical. That produced a different fingerprint STRING
 * for byte-identical CONTENT on every cycle, permanently defeating both no-op
 * guards in householdPushCoordinator.ts's runDrain:
 *   - the top-of-loop check (line ~209): lastAcknowledgedFingerprint === submittedFingerprint
 *   - the post-install check (line ~262): re-queues immediately (no timer) if
 *     the post-install local state's fingerprint doesn't match what was just
 *     acknowledged
 * Empirically confirmed in isolation: two objects with identical values but
 * different key insertion order produced different JSON.stringify strings,
 * and mergeDurableSnapshotForPush's own tie-break (equal updatedAt -> keep
 * the LOCAL/"existing" object, not the incoming one) means a device's local
 * copy keeps its own original key order even after adopting server-confirmed
 * content — guaranteeing a mismatch against the server-shaped acknowledged
 * fingerprint on almost every real device.
 *
 * Fix: durableStateSemanticFingerprint now recursively sorts object keys
 * before stringifying (stableStringify), so fingerprint equality reflects
 * VALUE equality only. No merge logic, value, or array ordering changed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  durableStateSemanticFingerprint,
  mergeDurableSnapshotForPush,
} from '../core/services/mergeDurableSnapshot';
import { createHouseholdPushCoordinator, type PushAttemptOutcome } from '../core/services/householdPushCoordinator';
import { emptyDurableState } from '../core/repositories/durableRepository';
import type { DurableState, PantryItem } from '../types';

const HID = 'household-1';

/** Deep-clones a value with every object's keys inserted in REVERSE order —
 * simulating a Postgres jsonb round trip, which does not preserve key order,
 * with every VALUE left byte-identical. */
function withReorderedKeys<T>(value: T): T {
  const reorder = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(reorder);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).reverse()) out[k] = reorder((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return reorder(value) as T;
}

const mk = (id: string, name: string): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId: null, expiryDate: null, createdAt: 1, updatedAt: 100, statusUpdatedAt: 100,
});

// ── 1. The core defect, in isolation ────────────────────────────────────────

test('fingerprint is unaffected by object key order (the actual fix)', () => {
  const state: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')] };
  const reordered = withReorderedKeys(state);
  assert.equal(
    durableStateSemanticFingerprint(state),
    durableStateSemanticFingerprint(reordered),
    'identical content in a different key order must fingerprint identically — this is what jsonb round-tripping does',
  );
});

test('fingerprint still detects a REAL value change, regardless of key order', () => {
  const state: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')] };
  const changed: DurableState = {
    ...emptyDurableState,
    items: [{ ...mk('apple', 'Apple'), status: 'stocked', statusUpdatedAt: 200 }],
  };
  assert.notEqual(durableStateSemanticFingerprint(state), durableStateSemanticFingerprint(withReorderedKeys(changed)));
});

test('the fix holds at realistic scale — many items, trips, receipts, and assignments', () => {
  // Deliberately synthetic (never a real device dump — a captured snapshot
  // would carry live signed receipt-URL tokens that must never enter git
  // history), but shaped like production: 200 items, 100 trips with
  // purchased/released pairings, 500 store assignments, receipts, activity.
  const items: PantryItem[] = Array.from({ length: 200 }, (_, i) => ({
    ...mk(`item_${i}`, `Item ${i}`),
    updatedAt: 100 + i, statusUpdatedAt: 100 + i,
  }));
  const trips = Array.from({ length: 100 }, (_, i) => ({
    id: `trip_${i}`, storeIdsVisited: [`store_${i % 5}`], skippedStoreIds: [],
    itemsBought: 2, itemsRemaining: 1, itemsOutOfStock: 0, receiptIds: [`r_${i}`],
    totalSpent: 12.5, breakdown: [],
    purchasedItems: [{ itemId: `item_${i}`, name: `Item ${i}`, storeId: `store_${i % 5}`, price: 3.5 }],
    releasedItems: [{ itemId: `item_${(i + 1) % 200}`, name: `Item ${(i + 1) % 200}`, storeId: `store_${i % 5}`, price: 0 }],
    startedAt: i * 1000, completedAt: i * 1000 + 500, duration: 500,
  }));
  const assignments = Array.from({ length: 500 }, (_, i) => ({
    id: `shopping-store:item_${i % 200}:store_${i % 7}`, pantryItemId: `item_${i % 200}`,
    storeId: `store_${i % 7}`, active: i % 3 === 0, updatedAt: i,
  }));
  const state: DurableState = {
    ...emptyDurableState, items, trips: trips as unknown as DurableState['trips'],
    shoppingStoreAssignments: assignments as unknown as DurableState['shoppingStoreAssignments'],
    updatedAt: 99999,
  };
  assert.equal(
    durableStateSemanticFingerprint(state),
    durableStateSemanticFingerprint(withReorderedKeys(state)),
  );
});

// ── 2. Coordinator-level: the full feedback loop ────────────────────────────

type Harness = {
  coordinator: ReturnType<typeof createHouseholdPushCoordinator>;
  attemptCalls: () => number;
  getLocal: () => DurableState;
  mutateLocal: (fn: (s: DurableState) => DurableState) => void;
  setOutcome: (fn: () => PushAttemptOutcome) => void;
};

/**
 * A coordinator wired to fake dependencies that behave like the real
 * production path: a successful push's serverState comes back with reordered
 * (jsonb-shaped) keys, and installSuccess merges it against the PRE-push
 * local copy exactly like installSuccessfulPush does — mergeDurableSnapshotForPush
 * (remote=server, local=pre-push local) — so a tied (unchanged) item keeps
 * its original local key order per mergePantryItems' tie-break.
 */
function makeHarness(initial: DurableState): Harness {
  let local = initial;
  let attempts = 0;
  let outcomeFn: () => PushAttemptOutcome = () => {
    const serverState = withReorderedKeys(local);
    return { type: 'success', serverState, updatedAt: Date.now() };
  };

  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => local,
    attempt: async () => {
      attempts += 1;
      return outcomeFn();
    },
    installSuccess: async (_hid, _submitted, serverState) => {
      const preInstallLocal = local;
      const merged = mergeDurableSnapshotForPush(serverState, preInstallLocal);
      local = merged;
      return { acknowledgedState: serverState, latestState: local };
    },
    // No real waiting: retry/backoff paths are not what this suite is
    // proving (that's sync-push-retry-safety.test.ts). Deterministic and fast.
    delay: async () => {},
    setTimer: (cb) => { cb(); return 0 as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: () => {},
  });

  return {
    coordinator,
    attemptCalls: () => attempts,
    getLocal: () => local,
    mutateLocal: (fn) => { local = fn(local); },
    setOutcome: (fn) => { outcomeFn = fn; },
  };
}

test('two idle devices, 60 simulated seconds, no mutations: pushes settle to zero', async () => {
  const initial: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')], updatedAt: 1 };
  const h = makeHarness(initial);

  await h.coordinator.enqueue(HID, initial);
  await h.coordinator.whenSettled(HID);
  const afterFirstSettle = h.attemptCalls();
  assert.ok(afterFirstSettle >= 1, 'the very first enqueue must actually push once');

  // Simulate 60 "seconds" of idle foreground/realtime wake-ups with NO local
  // mutation in between — exactly the two-idle-devices scenario.
  for (let i = 0; i < 60; i += 1) {
    await h.coordinator.wake(HID);
    await h.coordinator.whenSettled(HID);
  }

  assert.equal(
    h.attemptCalls(), afterFirstSettle,
    `THE FIX: zero additional pushes after convergence — was previously unbounded (518 in ~27min = ~0.3/s sustained)`,
  );
});

test('one legitimate local edit produces bounded push activity', async () => {
  const initial: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')], updatedAt: 1 };
  const h = makeHarness(initial);
  await h.coordinator.enqueue(HID, initial);
  await h.coordinator.whenSettled(HID);
  const beforeEdit = h.attemptCalls();

  const edited: DurableState = {
    ...h.getLocal(),
    items: h.getLocal().items.map((i) => i.id === 'apple' ? { ...i, status: 'stocked', statusUpdatedAt: 999, updatedAt: 999 } : i),
    updatedAt: 999,
  };
  await h.coordinator.enqueue(HID, edited);
  await h.coordinator.whenSettled(HID);

  const afterEdit = h.attemptCalls();
  assert.ok(afterEdit > beforeEdit, 'a real edit must still sync');
  assert.ok(afterEdit - beforeEdit <= 2, `bounded push activity for one edit, got ${afterEdit - beforeEdit} attempts`);

  // And it settles — no runaway follow-up.
  for (let i = 0; i < 10; i += 1) {
    await h.coordinator.wake(HID);
    await h.coordinator.whenSettled(HID);
  }
  assert.equal(h.attemptCalls(), afterEdit, 'no further pushes once the edit is acknowledged');
});

test('self realtime echo (wake with nothing enqueued) causes zero follow-up push', async () => {
  const initial: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')], updatedAt: 1 };
  const h = makeHarness(initial);
  await h.coordinator.enqueue(HID, initial);
  await h.coordinator.whenSettled(HID);
  const settled = h.attemptCalls();

  // wake() with no enqueue is exactly what a pull triggered by our own
  // self-broadcast realtime UPDATE does.
  await h.coordinator.wake(HID);
  await h.coordinator.whenSettled(HID);

  assert.equal(h.attemptCalls(), settled);
});

test('app foreground/pull with unchanged data causes zero push (top-of-drain no-op guard)', async () => {
  const initial: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')], updatedAt: 1 };
  const h = makeHarness(initial);
  await h.coordinator.enqueue(HID, initial);
  await h.coordinator.whenSettled(HID);
  const settled = h.attemptCalls();

  // A foreground pull re-enqueuing the CURRENT (unchanged, but independently
  // constructed/key-ordered) snapshot must be caught by the fingerprint no-op
  // guard before any network attempt — not merely by wake()'s dirty check.
  await h.coordinator.enqueue(HID, withReorderedKeys(h.getLocal()));
  await h.coordinator.whenSettled(HID);

  assert.equal(h.attemptCalls(), settled, 'a semantically-unchanged re-enqueue must not push');
});

test('CAS conflict retry converges and stops', async () => {
  const initial: DurableState = { ...emptyDurableState, items: [mk('apple', 'Apple')], updatedAt: 1 };
  const h = makeHarness(initial);

  let calls = 0;
  h.setOutcome(() => {
    calls += 1;
    if (calls < 3) return { type: 'conflict' };
    const serverState = withReorderedKeys(h.getLocal());
    return { type: 'success', serverState, updatedAt: Date.now() };
  });

  await h.coordinator.enqueue(HID, initial);
  await h.coordinator.whenSettled(HID);

  assert.equal(calls, 3, 'retries within the bounded CAS_ATTEMPTS loop, then succeeds — not unbounded');

  // And it stays converged afterward.
  const settled = h.attemptCalls();
  await h.coordinator.wake(HID);
  await h.coordinator.whenSettled(HID);
  assert.equal(h.attemptCalls(), settled);
});
