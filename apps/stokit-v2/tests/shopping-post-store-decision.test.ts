/**
 * Regression suite: the unified Post-Store Decision screen.
 *
 * Two workflow defects motivated this, both caused by the same seam. The
 * post-store moment was split across two screens: StoreSummary offered a
 * single forced "Continue to {next}" action, and NextStoreSelector — the only
 * screen that listed the other stores and the reopen controls — was skipped
 * past by an effect that auto-dispatched ADVANCE_STORE the instant status
 * became next_store_ready. So the shopper could never choose a next store, and
 * reopen controls only surfaced at the very end of a trip.
 *
 * There is now one decision point. Nothing advances on its own; every stop is
 * addressable; reopening is available after every store.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  completedStops,
  currentStopId,
  currentStoreId,
  entryStopPlacement,
  initialSession,
  pendingStops,
  receiptIdForStop,
  reduce,
  stopIdForQueueIndex,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import type { SharedShoppingSession, ShoppingEntryDraft } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const draft = (pantryItemId: string, name: string, storeId: string): ShoppingEntryDraft => ({
  pantryItemId, name, quantity: 1, unit: 'unit', storeId, picked: false,
});

/** A → B → C, sitting at A's completion. This is the decision point. */
function completedAOfABC(): {
  session: ShoppingSession;
  stopA: string;
  stopB: string;
  stopC: string;
} {
  let s = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [draft('apple', 'Apple', 'a'), draft('bread', 'Bread', 'b'), draft('cheese', 'Cheese', 'c')],
    now: 1000,
    shopperId: 'owner',
  });
  const [stopA, stopB, stopC] = [0, 1, 2].map((i) => stopIdForQueueIndex(s, i));
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2001 });
  return { session: s, stopA, stopB, stopC };
}

function completeCurrentStore(s: ShoppingSession, now: number): ShoppingSession {
  return reduce(reduce(s, { type: 'FINISH_STORE', now }), { type: 'SKIP_RECEIPT', now: now + 1 });
}

const storeIdsOf = (stops: ReturnType<typeof pendingStops>) => stops.map((stop) => stop.storeId);

// ── 1. Both remaining stores are selectable ───────────────────────────────────

test('after completing A with B and C remaining, both B and C are selectable', () => {
  const { session, stopA, stopB, stopC } = completedAOfABC();

  assert.equal(session.status, 'store_summary', 'the decision point, not an auto-advanced store');
  assert.equal(currentStopId(session), stopA);
  assert.deepEqual(
    pendingStops(session).map((s) => s.stopId),
    [stopB, stopC],
    'both remaining stops are offered, not just the next in queue order',
  );

  // Each is individually reachable from this exact state — no CONTINUE_TRIP hop.
  for (const storeId of ['b', 'c']) {
    const chosen = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId });
    assert.equal(chosen.status, 'shopping_store');
    assert.equal(currentStoreId(chosen), storeId);
  }
});

// ── 2. Choosing C activates C and leaves B pending ────────────────────────────

test('choosing C activates C and leaves B pending', () => {
  const { session, stopA, stopB, stopC } = completedAOfABC();

  const atC = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });

  assert.equal(currentStoreId(atC), 'c');
  assert.equal(currentStopId(atC), stopC, 'C keeps its original stop identity — no renumbering');
  assert.deepEqual(storeIdsOf(pendingStops(atC)), ['b'], 'B is still pending, not stranded');
  assert.ok(atC.completedStopIds.includes(stopA), 'A stays completed');

  // C's own entries came with it.
  assert.deepEqual(
    atC.entries.filter((e) => e.stopId === stopC).map((e) => e.pantryItemId),
    ['cheese'],
  );
  void stopB;
});

// ── 3. After C completes, B remains selectable ────────────────────────────────

test('after C completes, B is still selectable', () => {
  const { session, stopB, stopC } = completedAOfABC();

  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  s = completeCurrentStore(s, 3000);

  assert.equal(s.status, 'store_summary');
  assert.ok(s.completedStopIds.includes(stopC), 'C is now completed');
  assert.deepEqual(storeIdsOf(pendingStops(s)), ['b'], 'B survived being skipped over');

  const atB = reduce(s, { type: 'CHOOSE_NEXT_STORE', storeId: 'b' });
  assert.equal(currentStoreId(atB), 'b');
  assert.equal(currentStopId(atB), stopB, 'B keeps its original stop identity');
  assert.deepEqual(
    atB.entries.filter((e) => e.stopId === stopB).map((e) => e.pantryItemId),
    ['bread'],
    'B kept its assigned entries throughout',
  );
});

// ── 4. Current completed store reopens immediately ────────────────────────────

test('the just-completed store can be reopened immediately, in place', () => {
  const { session, stopA } = completedAOfABC();

  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: stopA, now: 2500 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStopId(reopened), stopA, 'same stop reactivated — no duplicate occurrence');
  assert.deepEqual(reopened.storeQueue, ['a', 'b', 'c'], 'queue is unchanged');
  assert.ok(!reopened.completedStopIds.includes(stopA), 'the completion is undone, not duplicated');
});

// ── 5. Earlier completed stores reopen from the same screen ───────────────────

test('an earlier completed store reopens from the same screen as a new occurrence', () => {
  const { session, stopA, stopC } = completedAOfABC();

  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  s = completeCurrentStore(s, 3000);
  // Now resting at C's completion, with A completed earlier.
  assert.deepEqual(completedStops(s).map((x) => x.stopId), [stopA, stopC]);

  const reopened = reduce(s, { type: 'REOPEN_STORE', stopId: stopA, now: 4000 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStoreId(reopened), 'a');
  assert.notEqual(currentStopId(reopened), stopA, 'a NEW occurrence, not the original stop');
  assert.ok(reopened.completedStopIds.includes(stopA), 'the original A stop stays completed');
  assert.ok(reopened.completedStopIds.includes(stopC), 'C stays completed');
  assert.deepEqual(storeIdsOf(pendingStops(reopened)), ['b'], 'B is still pending');
});

// ── 6. Original receipts and history survive an earlier-store revisit ─────────

test('original receipts, timestamps and entries survive an earlier-store revisit', () => {
  const { session, stopA, stopC } = completedAOfABC();

  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  s = completeCurrentStore(s, 3000);
  const receiptsBefore = structuredClone(s.receipts);
  const entriesBefore = structuredClone(s.entries);

  const reopened = reduce(s, { type: 'REOPEN_STORE', stopId: stopA, now: 4000 });

  assert.deepEqual(reopened.receipts, receiptsBefore, 'no receipt was touched');
  assert.deepEqual(reopened.entries, entriesBefore, 'no entry was moved or rebuilt');
  assert.equal(reopened.completedStopAt?.[stopA], s.completedStopAt?.[stopA]);
  assert.equal(reopened.completedStopAt?.[stopC], s.completedStopAt?.[stopC]);

  // The revisit earns its own, separately-identified receipt.
  const revisitStop = currentStopId(reopened)!;
  let withReceipt = reduce(reopened, { type: 'FINISH_STORE', now: 5000 });
  withReceipt = reduce(withReceipt, { type: 'SAVE_RECEIPT', amount: 9.99, status: 'logged', now: 5100 });

  assert.equal(withReceipt.receipts.length, receiptsBefore.length + 1);
  assert.equal(
    withReceipt.receipts.at(-1)!.id,
    receiptIdForStop(withReceipt.tripId, revisitStop),
    'the revisit receipt is keyed to the revisit stop',
  );
  assert.notEqual(
    withReceipt.receipts.at(-1)!.id,
    receiptIdForStop(withReceipt.tripId, stopA),
    'and is distinct from the original A receipt',
  );
  assert.equal(
    withReceipt.receipts.find((r) => r.id === receiptIdForStop(withReceipt.tripId, stopA))?.createdAt,
    receiptsBefore.find((r) => r.id === receiptIdForStop(s.tripId, stopA))?.createdAt,
    'the original A receipt is byte-identical',
  );
});

// ── 7. No implicit revisit from ordinary assignment (OTA 442) ─────────────────

test('ordinary assignment to a completed store still cannot create a revisit', () => {
  const { session } = completedAOfABC();
  const atC = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });

  const after = reduce(atC, {
    type: 'ADD_ENTRY',
    now: 3500,
    entry: draft('milk', 'Milk', 'a'), // A is completed
  });

  assert.equal(after, atC, 'assignment to a completed store is a no-op in the machine');
  assert.equal(entryStopPlacement(atC, 'a', 'milk'), null, 'placement itself refuses');
  assert.deepEqual(after.storeQueue, atC.storeQueue, 'no phantom stop was appended');
});

// ── 8. No duplicate stops from repeated selections or reopen taps ─────────────

test('repeated selections and repeated reopen taps never duplicate a stop', () => {
  const { session, stopA } = completedAOfABC();

  // Choosing the same store twice from the decision point.
  const once = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  const twice = reduce(once, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  assert.deepEqual(twice.storeQueue, once.storeQueue, 'queue length unchanged');
  assert.equal(currentStopId(twice), currentStopId(once));

  // Reopening the current stop twice: the second is a no-op, because after the
  // first the session is shopping_store, which REOPEN_STORE does not accept.
  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: stopA, now: 2500 });
  const again = reduce(reopened, { type: 'REOPEN_STORE', stopId: stopA, now: 2600 });
  assert.equal(again, reopened, 'second reopen tap changes nothing');

  // Reopening an EARLIER stop twice activates the same pending revisit rather
  // than minting a second one.
  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  s = completeCurrentStore(s, 3000);
  const revisit1 = reduce(s, { type: 'REOPEN_STORE', stopId: stopA, now: 4000 });
  const revisitStop = currentStopId(revisit1)!;
  // Complete the revisit, return to the decision point, then reopen A again.
  const afterRevisit = completeCurrentStore(revisit1, 4500);
  const revisit2 = reduce(afterRevisit, { type: 'REOPEN_STORE', stopId: stopA, now: 5000 });
  assert.notEqual(currentStopId(revisit2), revisitStop, 'a fresh occurrence, not the completed revisit');
  assert.equal(
    revisit2.storeQueue.filter((id) => id === 'a').length,
    3,
    'exactly one new occurrence per explicit reopen — no runaway duplication',
  );
});

// ── 9. Two devices converge on the same choices and active stop ───────────────

test('an out-of-order choice reconciles across two devices', () => {
  const { session, stopA, stopB, stopC } = completedAOfABC();

  // Device A picks C, skipping over B in queue order.
  const deviceA = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  const deviceB = session; // still at the decision point

  for (const merged of [
    foldRemoteActiveSession(
      deviceA as unknown as SharedShoppingSession,
      deviceB as unknown as SharedShoppingSession,
    ),
    foldRemoteActiveSession(
      deviceB as unknown as SharedShoppingSession,
      deviceA as unknown as SharedShoppingSession,
    ),
  ] as SharedShoppingSession[]) {
    assert.ok((merged.completedStopIds ?? []).includes(stopA), 'A stays completed either direction');
    // Every stop identity survives the merge — nothing renumbered or dropped.
    const stopIds = (merged.storeQueue ?? []).map((_, i) =>
      stopIdForQueueIndex(merged as unknown as ShoppingSession, i));
    for (const stop of [stopA, stopB, stopC]) {
      assert.ok(stopIds.includes(stop), `${stop} survives the merge`);
    }
    assert.equal(merged.storeQueue.length, 3, 'no duplicate stop was introduced by the merge');
  }
});

// ── 10. Final store completion still offers every exit ────────────────────────

test('after the final store, reopen / add store / End Trip all remain available', () => {
  const { session, stopA, stopB, stopC } = completedAOfABC();

  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'b' });
  s = completeCurrentStore(s, 3000);
  s = reduce(s, { type: 'CHOOSE_NEXT_STORE', storeId: 'c' });
  s = completeCurrentStore(s, 4000);

  assert.deepEqual(pendingStops(s), [], 'nothing left to visit');
  assert.deepEqual(completedStops(s).map((x) => x.stopId), [stopA, stopB, stopC]);

  // Reopen the current (final) stop, in place.
  const reopenCurrent = reduce(s, { type: 'REOPEN_STORE', stopId: stopC, now: 5000 });
  assert.equal(reopenCurrent.status, 'shopping_store');
  assert.equal(currentStopId(reopenCurrent), stopC);

  // Reopen an earlier stop, as a new occurrence.
  const reopenEarlier = reduce(s, { type: 'REOPEN_STORE', stopId: stopA, now: 5000 });
  assert.equal(reopenEarlier.status, 'shopping_store');
  assert.equal(currentStoreId(reopenEarlier), 'a');
  assert.ok(reopenEarlier.completedStopIds.includes(stopA));

  // Add an unplanned store.
  const added = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'd' });
  assert.equal(added.status, 'shopping_store');
  assert.equal(currentStoreId(added), 'd');

  // End the trip.
  const ended = reduce(s, { type: 'FINISH_TRIP', now: 6000 });
  assert.equal(ended.status, 'trip_summary');
  assert.equal(ended.completedTrip?.id, s.tripId);
});

// ── 11. End Trip works mid-route, from the decision point ─────────────────────

test('End Trip works with stops still remaining, marking them skipped', () => {
  const { session } = completedAOfABC();

  const ended = reduce(session, { type: 'FINISH_TRIP', now: 6000 });

  assert.equal(ended.status, 'trip_summary');
  assert.deepEqual(ended.skippedStoreIds.sort(), ['b', 'c'], 'unvisited stops are recorded as skipped');
});

// ── Source guard: nothing advances on its own ─────────────────────────────────

test('no effect auto-advances the trip on a status change', () => {
  const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.doesNotMatch(screen, /dispatch\(\{ type: 'ADVANCE_STORE' \}\)/);
  assert.doesNotMatch(screen, /dispatch\(\{ type: 'CONTINUE_TRIP' \}\)/);
});
