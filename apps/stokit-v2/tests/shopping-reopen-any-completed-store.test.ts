/**
 * Regression suite: reopening ANY completed store in a multi-store trip — not
 * just the one the shopper is currently standing at.
 *
 * The first implementation of this feature rewound `currentIndex` back into
 * the original stop and removed it from `completedStopIds`, mutating
 * completed history: the receipt, the completedStopAt timestamp, and the
 * entries all belonged to a stop that was no longer marked completed. This
 * suite pins the corrected design instead:
 *
 *  - Reopening the CURRENT stop (store_summary/continue_prompt, the shopper
 *    has not chosen a next store yet) is an in-place undo — unchanged, this
 *    is REOPEN_STORE's original behavior. Covered by shopping-reopen-store.test.ts.
 *
 *  - Reopening an EARLIER stop — from the "Completed stops" list, which lives
 *    in NextStoreSelector while stores are still pending and in StoreSummary
 *    once nothing is (next_store_ready is otherwise unreachable then) — never
 *    touches the original stop. Instead it creates — or, if one is already
 *    queued, activates — a NEW occurrence of the same store: its own stopId,
 *    its own entries, its own completion/receipt lifecycle. The original
 *    stop's completedStopIds, completedStopAt, receipt, and entries are
 *    provably untouched.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  currentStoreId,
  entryStopPlacement,
  initialSession,
  pendingStoreIds,
  reduce,
  stopIdForQueueIndex,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import type { SharedShoppingSession, ShoppingEntryDraft } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function startTrip(draftEntries: ShoppingEntryDraft[], now = 1000): ShoppingSession {
  return reduce(initialSession, { type: 'START_TRIP', entries: draftEntries, now, shopperId: 'owner' });
}

function completeStore(session: ShoppingSession, now: number): ShoppingSession {
  const s = reduce(session, { type: 'FINISH_STORE', now });
  return reduce(s, { type: 'SKIP_RECEIPT', now: now + 1 });
}

function advanceToNextStore(session: ShoppingSession): ShoppingSession {
  const s = reduce(session, { type: 'CONTINUE_TRIP' });
  return reduce(s, { type: 'ADVANCE_STORE' });
}

const costcoDraft: ShoppingEntryDraft = {
  pantryItemId: 'apple', name: 'Apple', quantity: 1, unit: 'unit', storeId: 'costco', picked: false,
};
const safewayDraft: ShoppingEntryDraft = {
  pantryItemId: 'bread', name: 'Bread', quantity: 1, unit: 'unit', storeId: 'safeway', picked: false,
};
const targetDraft: ShoppingEntryDraft = {
  pantryItemId: 'cheese', name: 'Cheese', quantity: 1, unit: 'unit', storeId: 'target', picked: false,
};

/** 3-store trip with Costco+Safeway completed, sitting at next_store_ready for Target. */
function twoCompletedOneRemaining(): {
  session: ShoppingSession;
  costcoStop: string;
  safewayStop: string;
  targetStop: string;
} {
  let s = startTrip([costcoDraft, safewayDraft, targetDraft]);
  const costcoStop = stopIdForQueueIndex(s, 0);
  const safewayStop = stopIdForQueueIndex(s, 1);
  const targetStop = stopIdForQueueIndex(s, 2);

  s = completeStore(s, 2000);
  s = advanceToNextStore(s);    // currentIndex → 1 (Safeway)
  s = completeStore(s, 3000);
  s = reduce(s, { type: 'CONTINUE_TRIP' }); // next_store_ready, currentIndex still 1 (Safeway)
  return { session: s, costcoStop, safewayStop, targetStop };
}

/**
 * 3-store trip with ALL stores completed, resting in store_summary for Target.
 *
 * Once nothing is pending, CONTINUE_TRIP refuses to advance
 * (pendingStoreIds().length === 0 is its own no-op guard), so next_store_ready
 * — and with it NextStoreSelector's "Completed stops" list — is unreachable.
 * StoreSummary's `pending.length === 0` branch is the only screen a shopper
 * can be on here, which is why REOPEN_STORE's earlier-stop branch must also
 * accept store_summary/continue_prompt, not only next_store_ready.
 */
function allCompleted(): {
  session: ShoppingSession;
  costcoStop: string;
  safewayStop: string;
  targetStop: string;
} {
  const { session: s2, costcoStop, safewayStop, targetStop } = twoCompletedOneRemaining();
  let s = reduce(s2, { type: 'CHOOSE_NEXT_STORE', storeId: 'target' });
  s = completeStore(s, 4000);
  return { session: s, costcoStop, safewayStop, targetStop };
}

// ── Test 1: Reopen first store while a later store is still pending ───────────

test('reopen first store (Costco) after completing Costco→Safeway, Target still pending', () => {
  const { session, costcoStop, safewayStop } = twoCompletedOneRemaining();
  assert.equal(session.status, 'next_store_ready');
  assert.equal(currentStoreId(session), 'safeway', 'resting at the most recently completed stop');
  assert.deepEqual(pendingStoreIds(session), ['target'], 'Target is still pending before reopen');

  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: costcoStop, now: 5000 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStoreId(reopened), 'costco');
  assert.notEqual(currentStopId(reopened), costcoStop, 'the revisit is a NEW stop, not the original');

  // The original Costco stop is untouched: still completed, same timestamp.
  assert.ok(reopened.completedStopIds.includes(costcoStop), 'original Costco stop remains completed');
  assert.equal(
    reopened.completedStopAt?.[costcoStop],
    session.completedStopAt?.[costcoStop],
    'original completedStopAt is unchanged',
  );
  assert.ok(reopened.completedStopIds.includes(safewayStop), 'Safeway remains completed too');

  // Queue grew by exactly one occurrence, at the end of Costco's family.
  assert.deepEqual(reopened.storeQueue, ['costco', 'costco', 'safeway', 'target']);
  assert.equal(currentStopId(reopened), stopIdForQueueIndex(reopened, 1));

  // Target — genuinely still pending — is not stranded by the reopen.
  assert.deepEqual(pendingStoreIds(reopened), ['target']);
});

// ── Test 2: Reopen the middle store once every store is completed ─────────────

test('reopen middle store (Safeway) after all 3 stores are completed', () => {
  const { session, costcoStop, safewayStop, targetStop } = allCompleted();
  assert.equal(session.status, 'store_summary');
  assert.equal(currentStopId(session), targetStop, 'resting at Target, the last completed stop');
  assert.deepEqual(pendingStoreIds(session), [], 'nothing left pending');

  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: safewayStop, now: 6000 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStoreId(reopened), 'safeway');
  assert.notEqual(currentStopId(reopened), safewayStop, 'the revisit is a NEW stop, not the original');

  assert.ok(reopened.completedStopIds.includes(safewayStop), 'original Safeway stop remains completed');
  assert.ok(reopened.completedStopIds.includes(costcoStop), 'Costco still completed');
  assert.ok(reopened.completedStopIds.includes(targetStop), 'Target still completed');
  assert.equal(
    reopened.completedStopAt?.[safewayStop],
    session.completedStopAt?.[safewayStop],
    'original Safeway completedStopAt is unchanged',
  );

  assert.deepEqual(reopened.storeQueue, ['costco', 'safeway', 'safeway', 'target']);
  assert.deepEqual(pendingStoreIds(reopened), [], 'Costco and Target both stay completed, still nothing pending');
});

// ── Test 3: Reopen the last (most recently completed) store from the list ─────

test('reopen the most recently completed store still creates a new occurrence, not an in-place undo', () => {
  const { session, safewayStop } = twoCompletedOneRemaining();
  assert.equal(currentStopId(session), safewayStop, 'Safeway is the stop currently being rested at');

  // Dispatched from next_store_ready (the Completed Stops list), NOT from
  // StoreSummary's dedicated undo button — so even the current stop's card
  // in that list creates a fresh revisit rather than reactivating in place.
  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: safewayStop, now: 5000 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStoreId(reopened), 'safeway');
  assert.notEqual(currentStopId(reopened), safewayStop);
  assert.ok(reopened.completedStopIds.includes(safewayStop), 'the original completed stop is untouched');
  assert.deepEqual(reopened.storeQueue, ['costco', 'safeway', 'safeway', 'target']);
});

// ── Test 4: Original receipts and timestamps are never touched ────────────────

test('receipts and completedStopAt for the original stop are untouched by a revisit', () => {
  const { session, costcoStop, safewayStop } = twoCompletedOneRemaining();
  const receiptsBefore = structuredClone(session.receipts);

  const reopened = reduce(session, { type: 'REOPEN_STORE', stopId: costcoStop, now: 7000 });

  // Both original receipts (Costco, Safeway) still present, byte-identical.
  assert.deepEqual(reopened.receipts, receiptsBefore);

  // completedStopAt for the original stop is untouched — Case B never writes it.
  assert.equal(reopened.completedStopAt?.[costcoStop], session.completedStopAt?.[costcoStop]);
  assert.equal(reopened.completedStopAt?.[safewayStop], session.completedStopAt?.[safewayStop]);
  // No reopenedStopAt entry is stamped for the original stop either — that
  // field only ever means "this exact stop was reactivated in place" (Case A).
  assert.equal(reopened.reopenedStopAt?.[costcoStop], session.reopenedStopAt?.[costcoStop]);

  // The revisit earns its own receipt only once it is itself completed.
  const revisitStopId = currentStopId(reopened)!;
  let withReceipt = reduce(reopened, { type: 'FINISH_STORE', now: 8000 });
  withReceipt = reduce(withReceipt, {
    type: 'SAVE_RECEIPT', amount: 12.5, status: 'logged', now: 8100,
  });

  assert.equal(withReceipt.receipts.length, 3, 'the revisit gets its own, third receipt');
  assert.ok(withReceipt.completedStopIds.includes(revisitStopId), 'the revisit has its own completion entry');
  assert.equal(
    withReceipt.completedStopAt?.[costcoStop],
    session.completedStopAt?.[costcoStop],
    'the original Costco completion timestamp is still untouched after the revisit completes',
  );
});

// ── Test 5: A duplicate Reopen activates the existing revisit, never a second one ─

test('a Reopen for a store that already has a pending revisit activates it instead of duplicating', () => {
  const { session, costcoStop } = twoCompletedOneRemaining();
  // Simulate a revisit already in flight (created locally, or merged in from
  // another device) — a second, not-yet-completed 'costco' occurrence appended
  // to the queue, exactly the shape Case B itself would have produced.
  const withPendingRevisit: ShoppingSession = {
    ...session,
    storeQueue: [...session.storeQueue, 'costco'],
  };
  const revisitIndex = withPendingRevisit.storeQueue.length - 1;
  const revisitStopId = stopIdForQueueIndex(withPendingRevisit, revisitIndex);
  assert.notEqual(revisitStopId, costcoStop);

  const reopened = reduce(withPendingRevisit, { type: 'REOPEN_STORE', stopId: costcoStop, now: 9000 });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(reopened.currentIndex, revisitIndex, 'the existing pending revisit is activated');
  assert.equal(currentStopId(reopened), revisitStopId);
  assert.equal(
    reopened.storeQueue.length,
    withPendingRevisit.storeQueue.length,
    'no second, duplicate revisit is created',
  );
});

// ── Test 9: the Completed Stops list stays reachable once nothing is pending ──

test('the decision screen lists every earlier completed stop for reopening, at any point in the trip', () => {
  const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  const decision = screen.slice(
    screen.indexOf('function PostStoreDecision'),
    screen.indexOf('// ── Active trip shell'),
  );

  // OTA 443 had to mirror this list into StoreSummary because next_store_ready
  // — the only screen that carried it — was unreachable once nothing was
  // pending. There is now one screen for the whole decision point, so the list
  // is simply always present and needs no pending-count gating at all.
  assert.match(
    decision,
    /const otherCompleted = completedStops\(session\)\.filter\(\(s\) => s\.stopId !== stopId\)/,
    'every completed stop except the current one is offered for reopening',
  );
  assert.match(decision, /otherCompleted\.length > 0 &&/);
  assert.match(decision, /type: 'REOPEN_STORE', stopId: stop\.stopId, now: Date\.now\(\)/);
  // The current stop keeps its own dedicated in-place undo button.
  assert.match(decision, /type: 'REOPEN_STORE', stopId, now: Date\.now\(\)/);
  assert.doesNotMatch(
    decision,
    /pending\.length === 0 && session\.completedStopIds\.some/,
    'the reopen list must not be gated on the trip having nothing left to visit',
  );
});

// ── Test 6: Ordinary ADD_ENTRY for a completed store stays blocked (OTA 442) ──

test('ADD_ENTRY for a completed store is still blocked by entryStopPlacement', () => {
  const { session: raw } = twoCompletedOneRemaining();
  const s = reduce(raw, { type: 'CHOOSE_NEXT_STORE', storeId: 'target' });
  assert.equal(s.status, 'shopping_store');

  const before = s;
  const after = reduce(s, {
    type: 'ADD_ENTRY',
    now: 9000,
    entry: {
      pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit',
      storeId: 'costco', // Costco is completed
      picked: false,
    },
  });

  assert.equal(after, before, 'ADD_ENTRY for completed Costco is a no-op in the machine');
  assert.equal(
    entryStopPlacement(s, 'costco', 'milk'),
    null,
    'entryStopPlacement itself returns null for a completed store',
  );
});

// ── Test 7: Cross-device merge preserves both the original stop and the revisit ─

test('foldRemoteActiveSession: a revisit created on device A survives merging with device B', () => {
  const { session, costcoStop, safewayStop } = twoCompletedOneRemaining();

  const deviceA = reduce(session, { type: 'REOPEN_STORE', stopId: costcoStop, now: 5000 });
  const deviceB = session; // has not seen the reopen

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
    // The original Costco stop's completion survives regardless of merge direction.
    assert.ok(
      (merged.completedStopIds ?? []).includes(costcoStop),
      'original Costco completion survives the merge',
    );
    assert.ok(
      (merged.completedStopIds ?? []).includes(safewayStop),
      'original Safeway completion survives the merge',
    );
    // The revisit occurrence itself (the extra queue slot) is carried by the
    // union-based storeQueue merge regardless of which side is "preferred".
    const costcoOccurrences = (merged.storeQueue ?? []).filter((id) => id === 'costco').length;
    assert.equal(costcoOccurrences, 2, 'both the original stop and the new revisit occurrence are present');
  }
});

// ── Test 8: OTA 442 regression — completed-store assignments stay planning-only ─

test('an item newly assigned to a completed store (no prior occurrence there) stays planning-only', () => {
  const { session: raw } = twoCompletedOneRemaining();
  const s = reduce(raw, { type: 'CHOOSE_NEXT_STORE', storeId: 'target' });

  // Milk was never shopped at Costco — assigning it there while Costco is
  // completed must not silently reopen or join Costco (OTA 442's fix).
  const before = s;
  const after = reduce(s, {
    type: 'ADD_ENTRY',
    now: 9500,
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  assert.equal(after, before);
  assert.equal(s.entries.some((entry) => entry.pantryItemId === 'milk'), false);
});
