import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Push-debounce regression gate.
 *
 * durable-store.ts debounces the NETWORK push (pushLocalState) behind a
 * 300ms trailing timer capped at 1000ms from the first mutation in a burst —
 * saveDurable() (local persistence) is never debounced. The scheduling
 * closures (scheduleDebouncedPush/runDebouncedPush/flushPendingPush) are
 * private to the store creator and not exported, so behavior is verified two
 * ways:
 *   1. A faithful re-implementation of the same algorithm (identical
 *      formula, checked against the real source below) exercised with fake
 *      timers, proving the debounce/cap/flush control flow is correct.
 *   2. Source assertions tying that formula and every required flush call
 *      site to the real files, so a change to either drifts this test.
 */

const storeSrc = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
const syncSrc = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
const layoutSrc = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');

// ── 1. Algorithm, exercised with fake timers ────────────────────────────────

function createPushDebouncer(push: (epoch: number) => void) {
  const PUSH_DEBOUNCE_MS = 300;
  const PUSH_DEBOUNCE_CAP_MS = 1_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstArmedAt = 0;

  const run = (epoch: number) => {
    timer = null;
    firstArmedAt = 0;
    push(epoch);
  };

  const schedule = (epoch: number, nowMs: number) => {
    if (timer === null) firstArmedAt = nowMs;
    else clearTimeout(timer);
    const elapsed = nowMs - firstArmedAt;
    const waitMs = Math.min(PUSH_DEBOUNCE_MS, Math.max(0, PUSH_DEBOUNCE_CAP_MS - elapsed));
    timer = setTimeout(() => run(epoch), waitMs);
  };

  const flush = (epoch: number) => {
    if (timer === null) return;
    clearTimeout(timer);
    run(epoch);
  };

  const isArmed = () => timer !== null;

  return { schedule, flush, isArmed, PUSH_DEBOUNCE_MS, PUSH_DEBOUNCE_CAP_MS };
}

test('a burst of 15 rapid mutations produces at most 2 pushes', async () => {
  let pushCount = 0;
  const d = createPushDebouncer(() => { pushCount += 1; });
  let clock = 0;
  const advance = (ms: number) => new Promise<void>((resolve) => {
    clock += ms;
    setTimeout(resolve, ms);
  });

  for (let i = 0; i < 15; i += 1) {
    d.schedule(0, clock);
    await advance(20); // taps ~20ms apart — well under the 300ms trailing window
  }
  assert.ok(pushCount <= 1, `expected the burst itself to have fired at most 1 push mid-stream, got ${pushCount}`);
  await advance(400); // let the final trailing timer fire
  assert.ok(pushCount >= 1 && pushCount <= 2, `expected 1-2 total pushes for the burst, got ${pushCount}`);
});

test('the final mutation in a burst is what gets pushed, not a stale one', async () => {
  const pushed: number[] = [];
  let latestValue = 0;
  const d = createPushDebouncer(() => { pushed.push(latestValue); });
  let clock = 0;
  for (let i = 1; i <= 5; i += 1) {
    latestValue = i;
    d.schedule(0, clock);
    clock += 50;
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(pushed, [5], 'only the last-armed value should have been pushed, exactly once');
});

test('flush() during the debounce window cancels the pending timer and fires exactly once', async () => {
  let pushCount = 0;
  const d = createPushDebouncer(() => { pushCount += 1; });
  d.schedule(0, 0);
  assert.equal(d.isArmed(), true);
  d.flush(0);
  assert.equal(d.isArmed(), false, 'flush must clear the armed state');
  assert.equal(pushCount, 1);
  // No double push once the original timer would have fired.
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(pushCount, 1, 'the original timer must not also fire after flush');
});

test('flush() when nothing is pending is a no-op', () => {
  let pushCount = 0;
  const d = createPushDebouncer(() => { pushCount += 1; });
  d.flush(0);
  assert.equal(pushCount, 0);
});

test('a sustained stream of mutations still pushes at least once per second (cap)', async () => {
  const pushTimes: number[] = [];
  let clock = 0;
  const d = createPushDebouncer(() => { pushTimes.push(clock); });
  // Re-arm every 200ms (< 300ms trailing window) for 2.5 seconds straight —
  // without a cap this would never fire.
  for (let i = 0; i < 13; i += 1) {
    d.schedule(0, clock);
    clock += 200;
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(pushTimes.length >= 2, `expected the 1s cap to force multiple pushes across a 2.6s sustained stream, got ${pushTimes.length}`);
  for (let i = 1; i < pushTimes.length; i += 1) {
    assert.ok(pushTimes[i] - pushTimes[i - 1] <= 1_100, 'no gap between pushes should exceed the 1s cap by more than scheduling slop');
  }
});

// ── 2. Source wiring: the real files match this algorithm and call flush at
//      every required site ───────────────────────────────────────────────

test('durable-store.ts implements the same debounce formula (300ms trailing, 1000ms cap)', () => {
  assert.match(storeSrc, /PUSH_DEBOUNCE_MS = 300/);
  assert.match(storeSrc, /PUSH_DEBOUNCE_CAP_MS = 1_000/);
  assert.match(storeSrc, /Math\.min\(PUSH_DEBOUNCE_MS, Math\.max\(0, PUSH_DEBOUNCE_CAP_MS - elapsedSinceArm\)\)/);
});

test('saveDurable is never debounced; only the network push is', () => {
  const persistBody = storeSrc.slice(storeSrc.indexOf('const persist = () =>'), storeSrc.indexOf('const syncShoppingItem ='));
  assert.match(persistBody, /await saveDurable\(snap\)/, 'local persistence must remain immediate/awaited');
  assert.match(persistBody, /scheduleDebouncedPush\(epoch\)/, 'the network push must go through the debouncer');
  assert.doesNotMatch(persistBody, /void pushLocalState\(snap\)/, 'the old direct fire-and-forget push must be gone');
});

test('the debounced push reads a fresh snapshot at fire time, not a captured one', () => {
  const runBody = storeSrc.slice(storeSrc.indexOf('const runDebouncedPush'), storeSrc.indexOf('const scheduleDebouncedPush'));
  assert.match(runBody, /pushLocalState\(snapshot\(get\(\)\)\)/);
});

test('flushPendingPush (sync) and flushPendingPushAsync are both exported on the store', () => {
  assert.match(storeSrc, /flushPendingPush: \(\) => void;/, 'sync flush must be on the DurableStore interface');
  assert.match(storeSrc, /flushPendingPushAsync: \(\) => Promise<void>;/, 'async flush must be on the DurableStore interface');
  assert.match(storeSrc, /^\s*flushPendingPush,\s*$/m, 'sync flush must be exposed on the returned store object');
  assert.match(storeSrc, /^\s*flushPendingPushAsync,\s*$/m, 'async flush must be exposed on the returned store object');
});

test('flushPendingPushAsync awaits persistQueue before flushing (this is what fixes the race)', () => {
  const body = storeSrc.slice(storeSrc.indexOf('const flushPendingPushAsync'), storeSrc.indexOf('const persist = () =>'));
  assert.match(body, /await persistQueue;\s*\n\s*flushPendingPush\(\);/);
});

test('commitTrip, closeTrip, and resetLocalOnly use the ASYNC flush, not the racy sync one', () => {
  const commitTripStart = storeSrc.indexOf('commitTrip: (trip, receipts) => {');
  const commitTripBody = storeSrc.slice(commitTripStart, storeSrc.indexOf('removeTrip: (tripId, receiptIds) => {', commitTripStart));
  assert.match(commitTripBody, /persist\(\);\s*\n[\s\S]*?flushPendingPushAsync\(\);/, 'trip/store completion (and its receipts) must flush via the async API');
  assert.doesNotMatch(commitTripBody, /\bflushPendingPush\(\);/, 'must not call the racy sync flush right after its own persist()');

  const closeTripStart = storeSrc.indexOf('closeTrip: (tripId) => {');
  const closeTripBody = storeSrc.slice(closeTripStart, storeSrc.indexOf('updateReceipt:', closeTripStart));
  assert.match(closeTripBody, /persist\(\);\s*\n\s*void flushPendingPushAsync\(\);/);
  assert.doesNotMatch(closeTripBody, /\bflushPendingPush\(\);/);

  const resetLocalOnlyStart = storeSrc.indexOf('resetLocalOnly: async () => {');
  const resetLocalOnlyBody = storeSrc.slice(resetLocalOnlyStart, storeSrc.indexOf('applyRemotePatch:', resetLocalOnlyStart));
  const flushIdx = resetLocalOnlyBody.indexOf('await flushPendingPushAsync()');
  const epochIdx = resetLocalOnlyBody.indexOf('persistEpoch += 1');
  const cancelIdx = resetLocalOnlyBody.indexOf('cancelPendingHouseholdPushes()');
  const clearIdx = resetLocalOnlyBody.indexOf('clearDurable()');
  assert.ok(
    flushIdx >= 0 && flushIdx < epochIdx && epochIdx < cancelIdx && cancelIdx < clearIdx,
    'sign-out must await the async flush BEFORE bumping persistEpoch (which would otherwise invalidate it) and before the coordinator is reset and local state is wiped',
  );
  assert.doesNotMatch(resetLocalOnlyBody, /\bflushPendingPush\(\);/, 'must not use the racy sync flush');
});

test('wake and app-background still use the fast synchronous flush (not the async one)', () => {
  // Requirement: preserve the sync flush where it was already correct — wake
  // and background/inactive run after prior microtasks (including any
  // in-flight persist()) have necessarily already settled, so there is no
  // race there, and blocking on Promise<void> at those sites is unnecessary.
  const wakeBody = syncSrc.slice(syncSrc.indexOf('export async function wakePendingHouseholdPush'), syncSrc.indexOf('export function cancelPendingHouseholdPushes'));
  assert.match(wakeBody, /\.getState\(\)\.flushPendingPush\(\);/);
  assert.doesNotMatch(wakeBody, /flushPendingPushAsync/);

  const listenerStart = layoutSrc.indexOf("AppState.addEventListener('change'");
  const listenerEnd = layoutSrc.indexOf('return () => sub.remove();', listenerStart);
  const listenerBody = layoutSrc.slice(listenerStart, listenerEnd);
  assert.match(listenerBody, /flushPendingPush\(\);/);
  assert.doesNotMatch(listenerBody, /flushPendingPushAsync/);
});

test('an explicit wake flushes the debounced push before waking the coordinator', () => {
  const wakeBody = syncSrc.slice(syncSrc.indexOf('export async function wakePendingHouseholdPush'), syncSrc.indexOf('export function cancelPendingHouseholdPushes'));
  const flushIdx = wakeBody.indexOf('flushPendingPush()');
  const wakeIdx = wakeBody.indexOf('householdPushCoordinator.wake(id)');
  assert.ok(flushIdx >= 0 && flushIdx < wakeIdx, 'wake must flush the store debounce before waking the coordinator');
});

test('backgrounding or going inactive flushes the pending push', () => {
  const listenerStart = layoutSrc.indexOf("AppState.addEventListener('change'");
  const listenerEnd = layoutSrc.indexOf('return () => sub.remove();', listenerStart);
  const listenerBody = layoutSrc.slice(listenerStart, listenerEnd);
  assert.match(listenerBody, /nextState === 'background' \|\| nextState === 'inactive'/);
  assert.match(listenerBody, /flushPendingPush\(\)/);
});

test('no coordinator, merge-rule, CAS/offline, geofencing, or schema files were touched by this change', () => {
  // Scope guard: this debounce is client-side scheduling only.
  const untouched = [
    'core/services/householdPushCoordinator.ts',
    'core/services/mergeDurableSnapshot.ts',
    'core/services/mergePantryState.ts',
    'core/services/geofencing.ts',
    'core/services/geofencingLogic.ts',
  ];
  for (const f of untouched) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), f), 'utf8'), /PUSH_DEBOUNCE_MS|flushPendingPush|scheduleDebouncedPush/);
  }
});

// ── 3. The QA-confirmed race, reproduced and proven fixed ──────────────────
//
// Bug: commitTrip()/closeTrip()/resetLocalOnly() called flushPendingPush()
// synchronously right after persist(). But persist() reassigns persistQueue
// to a chain that AWAITS async saveDurable() before arming the debounce
// timer via scheduleDebouncedPush(). The synchronous flush ran before that
// timer existed, saw nothing, and no-opped — the "immediate" flush actually
// still waited out the full 300ms-1s debounce.
//
// Fix: flushPendingPushAsync() awaits the current persistQueue (which
// resolves only after saveDurable + scheduleDebouncedPush have both run)
// before flushing — so by the time it flushes, the timer it's meant to
// cancel actually exists.
//
// This harness is a faithful copy of durable-store.ts's real control flow
// (persist / scheduleDebouncedPush / runDebouncedPush / flushPendingPush /
// flushPendingPushAsync), with a real async saveDurable delay, exercised
// with real timers — not the fake-timer algorithm probe above, which
// deliberately doesn't model the saveDurable await and so can't see this
// race at all.

function createRaceHarness(saveDurableDelayMs: number) {
  let persistQueue: Promise<void> = Promise.resolve();
  let persistEpoch = 0;
  let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pushLog: Array<{ atMs: number; snap: string }> = [];
  const t0 = Date.now();

  const saveDurable = (snap: string) =>
    new Promise<void>((resolve) => setTimeout(resolve, saveDurableDelayMs));
  const pushLocalState = async (snap: string) => {
    pushLog.push({ atMs: Date.now() - t0, snap });
  };

  const runDebouncedPush = (epoch: number, snap: string) => {
    pushDebounceTimer = null;
    if (epoch !== persistEpoch) return;
    void pushLocalState(snap);
  };
  const scheduleDebouncedPush = (epoch: number, snap: string) => {
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => runDebouncedPush(epoch, snap), 300);
  };
  const flushPendingPush = (snap: string) => {
    if (pushDebounceTimer === null) return;
    clearTimeout(pushDebounceTimer);
    runDebouncedPush(persistEpoch, snap);
  };
  const flushPendingPushAsync = async (snap: string): Promise<void> => {
    await persistQueue;
    flushPendingPush(snap);
  };

  const persist = (snap: string) => {
    const epoch = persistEpoch;
    persistQueue = persistQueue.then(async () => {
      await saveDurable(snap);
      scheduleDebouncedPush(epoch, snap);
    });
  };

  return { persist, flushPendingPush, flushPendingPushAsync, pushLog, timerArmed: () => pushDebounceTimer !== null };
}

test('[the QA race, reproduced] the OLD sync-flush-right-after-persist pattern misses the push', async () => {
  const h = createRaceHarness(20); // saveDurable takes 20ms — plenty of time for a sync flush to race past it
  h.persist('trip-commit');
  h.flushPendingPush('trip-commit'); // the OLD (buggy) call pattern
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(h.pushLog.length, 0, 'the sync flush ran before the timer was armed and saw nothing');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.pushLog.length, 1, 'the push only happens later, from the natural debounce timer — not "immediately"');
});

test('[fixed] flushPendingPushAsync after persist() flushes right after persistence, not after 300ms — commitTrip shape', async () => {
  const h = createRaceHarness(20);
  h.persist('trip-commit');
  await h.flushPendingPushAsync('trip-commit');
  const elapsed = Date.now();
  assert.equal(h.pushLog.length, 1, 'exactly one push occurred');
  assert.equal(h.pushLog[0].snap, 'trip-commit');
  assert.ok(h.pushLog[0].atMs < 100, `push should land shortly after the ~20ms saveDurable, not after the 300ms debounce; got ${h.pushLog[0].atMs}ms`);
  assert.equal(h.timerArmed(), false, 'the timer must be cancelled, not left armed');
  // No duplicate push once the timer WOULD have fired naturally.
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(h.pushLog.length, 1, 'no duplicate push after the awaited flush');
});

test('[fixed] same shape for closeTrip (immediate tombstone commit)', async () => {
  const h = createRaceHarness(15);
  h.persist('trip-close');
  await h.flushPendingPushAsync('trip-close');
  assert.equal(h.pushLog.length, 1);
  assert.ok(h.pushLog[0].atMs < 100);
});

test('[fixed] same shape for resetLocalOnly (sign-out): a timer armed just before reset is still flushed', async () => {
  const h = createRaceHarness(10);
  h.persist('pre-signout-edit');
  // Sign-out doesn't necessarily call persist() itself right before —
  // simulate an edit that landed moments earlier, still draining.
  await h.flushPendingPushAsync('pre-signout-edit');
  assert.equal(h.pushLog.length, 1, 'the pending edit was pushed before local state would be wiped');
});

test('[fixed] a slow saveDurable (e.g. large snapshot) is still correctly awaited, not raced', async () => {
  const h = createRaceHarness(120); // simulate a slow AsyncStorage write
  h.persist('slow-save');
  await h.flushPendingPushAsync('slow-save');
  assert.equal(h.pushLog.length, 1);
  assert.ok(h.pushLog[0].atMs >= 100, 'the flush genuinely waited for the slow save, it did not race ahead of it');
});

test('[fixed] ordinary burst coalescing is unaffected by the async flush existing', async () => {
  const h = createRaceHarness(5);
  for (let i = 0; i < 10; i += 1) {
    h.persist(`tap-${i}`);
    await new Promise((r) => setTimeout(r, 15)); // rapid taps, no flush calls at all
  }
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(h.pushLog.length, 1, 'a burst with no explicit flush still coalesces to one push');
  assert.equal(h.pushLog[0].snap, 'tap-9', 'the last mutation in the burst is what gets pushed');
});
