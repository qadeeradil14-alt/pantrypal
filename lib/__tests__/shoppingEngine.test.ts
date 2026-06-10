/**
 * Shopping Flow Engine — contract scenario tests (pure reducer).
 * Run: npx tsx --test lib/__tests__/shoppingEngine.test.ts
 *
 * These map 1:1 to docs/SHOPPING_FLOW_CONTRACT.md §9. They exercise the pure
 * reducer only (no React, no Supabase), feeding live-list facts via payloads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shoppingReducer,
  initialShoppingState,
  selectNextStore,
  selectTotalGrabbed,
  type ShoppingSessionState,
  type ShoppingAction,
  type RemainingCounts,
} from '../shoppingEngine';

/** Apply a sequence of actions starting from idle (or a given state). */
function run(actions: ShoppingAction[], from = initialShoppingState): ShoppingSessionState {
  return actions.reduce(shoppingReducer, from);
}

// ---------------------------------------------------------------------------
// Scenario 1 — One store
// ---------------------------------------------------------------------------
test('1: one store — start → grab all → receipt → complete → summary → idle', () => {
  let s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A'], startCount: 2 }]);
  assert.equal(s.status, 'shopping_active');
  assert.equal(s.activeStoreId, 'A');

  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 1 });
  assert.equal(s.status, 'shopping_active');

  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 });
  assert.equal(s.status, 'receipt_pending', 'last item locks receipt_pending');
  assert.equal(s.pendingReceiptStoreId, 'A');

  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 30, receiptAdded: true, remaining: {} });
  assert.equal(s.status, 'trip_summary_open', 'no stores left → summary');
  assert.ok(s.tripSummary);
  assert.equal(s.tripSummary?.itemCount, 2);
  assert.equal(s.tripSummary?.tripSpend, 30);
  assert.equal(s.tripSummary?.receiptCount, 1);
  assert.deepEqual(s.completedStoreIds, ['A']);

  s = shoppingReducer(s, { type: 'DISMISS_SUMMARY' });
  assert.deepEqual(s, initialShoppingState, 'dismiss → full reset to idle');
});

// ---------------------------------------------------------------------------
// Scenario 2 — Two stores
// ---------------------------------------------------------------------------
test('2: two stores — A finishes → next_store_ready(B) → B finishes → complete', () => {
  let s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A', 'B'], startCount: 1 }]);
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 });
  assert.equal(s.status, 'receipt_pending');

  // B still has items remaining.
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 10, receiptAdded: false, remaining: { B: 2 } });
  assert.equal(s.status, 'next_store_ready');
  assert.equal(s.activeStoreId, null, 'no active store between stops');
  assert.equal(selectNextStore(s, { B: 2 }), 'B');

  s = shoppingReducer(s, { type: 'START_NEXT_STORE', storeId: 'B', startCount: 2 });
  assert.equal(s.status, 'shopping_active');
  assert.equal(s.activeStoreId, 'B');

  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'B', remainingAtStore: 1 });
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'B', remainingAtStore: 0 });
  assert.equal(s.status, 'receipt_pending');

  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 20, receiptAdded: true, remaining: {} });
  assert.equal(s.status, 'trip_summary_open');
  assert.equal(s.tripSummary?.itemCount, 3);
  assert.equal(s.tripSummary?.tripSpend, 30);
  assert.deepEqual(s.completedStoreIds, ['A', 'B']);
});

// ---------------------------------------------------------------------------
// Scenario 3 — Three stores in route order
// ---------------------------------------------------------------------------
test('3: three stores — resolves to next in route order, C completes', () => {
  let s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A', 'B', 'C'], startCount: 1 }]);
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 });
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 5, receiptAdded: false, remaining: { B: 1, C: 1 } });
  assert.equal(selectNextStore(s, { B: 1, C: 1 }), 'B');

  s = shoppingReducer(s, { type: 'START_NEXT_STORE', storeId: 'B', startCount: 1 });
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'B', remainingAtStore: 0 });
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 5, receiptAdded: false, remaining: { C: 1 } });
  assert.equal(s.status, 'next_store_ready');
  assert.equal(selectNextStore(s, { C: 1 }), 'C');

  s = shoppingReducer(s, { type: 'START_NEXT_STORE', storeId: 'C', startCount: 1 });
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'C', remainingAtStore: 0 });
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 5, receiptAdded: false, remaining: {} });
  assert.equal(s.status, 'trip_summary_open');
  assert.deepEqual(s.completedStoreIds, ['A', 'B', 'C']);
});

// ---------------------------------------------------------------------------
// Scenario 4 — Empty middle store is skipped
// ---------------------------------------------------------------------------
test('4: empty middle store (B=0) is skipped, never active, never owes receipt', () => {
  let s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A', 'B', 'C'], startCount: 1 }]);
  s = shoppingReducer(s, { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 });
  // B has 0 items; C has items.
  const remaining: RemainingCounts = { B: 0, C: 1 };
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 0, receiptAdded: false, remaining });
  assert.equal(s.status, 'next_store_ready');
  assert.equal(selectNextStore(s, remaining), 'C', 'B skipped → C is next');
  assert.ok(!s.completedStoreIds.includes('B'), 'B never completed');
  assert.equal(s.grabbedByStore['B'] ?? 0, 0, 'B never grabbed');

  s = shoppingReducer(s, { type: 'START_NEXT_STORE', storeId: 'C', startCount: 1 });
  assert.equal(s.activeStoreId, 'C', 'B is never the active store');
});

// ---------------------------------------------------------------------------
// Scenario 5 — No-logo store behaves identically (engine is logo-agnostic)
// ---------------------------------------------------------------------------
test('5: no-logo store — engine carries only ids, behaves identically', () => {
  // The engine stores store IDs only; logo/name are presentation. A store with
  // no logo is indistinguishable to the engine — same transitions hold.
  let s = run([
    { type: 'START_SESSION', storeId: 'nologo-1', route: ['nologo-1'], startCount: 1 },
    { type: 'GRAB_ITEM', storeId: 'nologo-1', remainingAtStore: 0 },
  ]);
  assert.equal(s.status, 'receipt_pending');
  s = shoppingReducer(s, { type: 'RESOLVE_RECEIPT', amount: 12.5, receiptAdded: false, remaining: {} });
  assert.equal(s.status, 'trip_summary_open');
  assert.equal(s.tripSummary?.stores[0].storeId, 'nologo-1');
});

// ---------------------------------------------------------------------------
// Scenario 6 — Second session starts fully reset
// ---------------------------------------------------------------------------
test('6: second session — dismiss → start again is fully reset', () => {
  let s = run([
    { type: 'START_SESSION', storeId: 'A', route: ['A'], startCount: 1 },
    { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 },
    { type: 'RESOLVE_RECEIPT', amount: 40, receiptAdded: true, remaining: {} },
    { type: 'DISMISS_SUMMARY' },
  ]);
  assert.deepEqual(s, initialShoppingState);

  s = shoppingReducer(s, { type: 'START_SESSION', storeId: 'B', route: ['B'], startCount: 3 });
  assert.equal(s.activeStoreId, 'B');
  assert.deepEqual(s.completedStoreIds, [], 'no carryover completed stores');
  assert.deepEqual(s.spendByStore, {}, 'no carryover spend');
  assert.equal(selectTotalGrabbed(s), 0, 'no carryover grabbed');
});

// ---------------------------------------------------------------------------
// Scenario 7 — Finish early blocks on owed receipt, else completes partial
// ---------------------------------------------------------------------------
test('7a: finish early with owed receipt → blocks into receipt_pending', () => {
  let s = run([
    { type: 'START_SESSION', storeId: 'A', route: ['A', 'B'], startCount: 3 },
    { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 2 }, // 1 grabbed, items remain
  ]);
  assert.equal(s.status, 'shopping_active');
  // Press Done while items remain and store owes a receipt.
  s = shoppingReducer(s, { type: 'END_SESSION', remaining: { A: 2, B: 1 } });
  assert.equal(s.status, 'receipt_pending', 'blocks on owed receipt');
  assert.equal(s.pendingReceiptStoreId, 'A');
});

test('7b: finish early with nothing grabbed → completes straight to idle', () => {
  let s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A', 'B'], startCount: 3 }]);
  s = shoppingReducer(s, { type: 'END_SESSION', remaining: { A: 3, B: 1 } });
  assert.deepEqual(s, initialShoppingState, 'nothing grabbed → idle, no summary');
});

// ---------------------------------------------------------------------------
// Scenario 8 — No auto-resume after restart (engine starts idle)
// ---------------------------------------------------------------------------
test('8: cold start — engine initial state is idle (no persistence)', () => {
  assert.equal(initialShoppingState.status, 'idle');
  assert.equal(initialShoppingState.activeStoreId, null);
  assert.equal(initialShoppingState.pendingReceiptStoreId, null);
});

// ---------------------------------------------------------------------------
// Forbidden transitions (contract §4) — must be structurally rejected
// ---------------------------------------------------------------------------
test('F1: idle cannot enter receipt_pending', () => {
  const s = shoppingReducer(initialShoppingState, {
    type: 'RESOLVE_RECEIPT', amount: 1, receiptAdded: false, remaining: {},
  });
  assert.equal(s.status, 'idle', 'RESOLVE_RECEIPT is a no-op from idle');
});

test('F4/F6: cannot re-enter a completed store; receipt locks the store', () => {
  // Reach next_store_ready with A completed.
  let s = run([
    { type: 'START_SESSION', storeId: 'A', route: ['A', 'B'], startCount: 1 },
    { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 },
    { type: 'RESOLVE_RECEIPT', amount: 0, receiptAdded: false, remaining: { B: 1 } },
  ]);
  const before = s;
  s = shoppingReducer(s, { type: 'START_NEXT_STORE', storeId: 'A', startCount: 1 });
  assert.deepEqual(s, before, 'cannot START_NEXT_STORE for completed store A');
});

test('F: GRAB_ITEM ignored unless shopping_active', () => {
  const s = shoppingReducer(initialShoppingState, {
    type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0,
  });
  assert.equal(s.status, 'idle');
});

test('F: REQUEST_FINISH_STOP is a no-op with 0 grabbed', () => {
  const s = run([{ type: 'START_SESSION', storeId: 'A', route: ['A'], startCount: 2 }]);
  const after = shoppingReducer(s, { type: 'REQUEST_FINISH_STOP', storeId: 'A' });
  assert.equal(after.status, 'shopping_active', 'no receipt with nothing grabbed');
});

test('ABORT from any state → idle, no summary', () => {
  const s = run([
    { type: 'START_SESSION', storeId: 'A', route: ['A'], startCount: 1 },
    { type: 'GRAB_ITEM', storeId: 'A', remainingAtStore: 0 },
  ]);
  const aborted = shoppingReducer(s, { type: 'ABORT' });
  assert.deepEqual(aborted, initialShoppingState);
});
