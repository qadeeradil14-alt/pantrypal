import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeShoppingEntries } from '../core/services/shoppingEntrySync';
import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import type { ShoppingEntry } from '../types';

// Last-Tap-Wins for `picked` and `outOfStock`: a newer check OR uncheck must
// always override an older state. Legacy (timeless) snapshots keep the historic
// sticky-OR merge so an OTA rollover never regresses.

const E = (o: Partial<ShoppingEntry> = {}): ShoppingEntry => ({
  itemId: 'env',
  name: 'Envelopes',
  quantity: 1,
  unit: 'unit',
  storeId: 's1',
  picked: false,
  ...o,
});

const pickedOf = (entries: ShoppingEntry[]) => entries[0].picked;
const oosOf = (entries: ShoppingEntry[]) => Boolean(entries[0].outOfStock);

// ── Propagation ──────────────────────────────────────────────────────────────

test('check propagates: a newer check overrides an older unchecked state', () => {
  const local = [E({ picked: false, pickedAt: 100 })];
  const remote = [E({ picked: true, pickedAt: 200 })];
  assert.equal(pickedOf(mergeShoppingEntries(local, remote, [])), true);
});

test('uncheck propagates: a newer uncheck overrides an older checked state (the fixed bug)', () => {
  const local = [E({ picked: true, pickedAt: 100 })];
  const remote = [E({ picked: false, pickedAt: 200 })];
  assert.equal(pickedOf(mergeShoppingEntries(local, remote, [])), false);
});

test('a stale uncheck does NOT override a newer check', () => {
  const local = [E({ picked: true, pickedAt: 200 })];
  const remote = [E({ picked: false, pickedAt: 100 })];
  assert.equal(pickedOf(mergeShoppingEntries(local, remote, [])), true);
});

test('out-of-stock clear propagates: a newer available state overrides an older out-of-stock', () => {
  const local = [E({ outOfStock: true, outOfStockAt: 100 })];
  const remote = [E({ outOfStock: false, outOfStockAt: 200 })];
  assert.equal(oosOf(mergeShoppingEntries(local, remote, [])), false);
});

// ── Concurrent opposite actions ──────────────────────────────────────────────

test('simultaneous opposite actions: the newer timestamp wins', () => {
  const older = [E({ picked: true, pickedAt: 100 })];
  const newer = [E({ picked: false, pickedAt: 200 })];
  assert.equal(pickedOf(mergeShoppingEntries(older, newer, [])), false, 'newer uncheck wins');
});

test('both devices converge to the same final state regardless of merge direction', () => {
  const deviceA = E({ picked: true, pickedAt: 100 });   // A checked at t=100
  const deviceB = E({ picked: false, pickedAt: 200 });  // B unchecked at t=200
  // A applies B's snapshot; B applies A's snapshot.
  const onA = pickedOf(mergeShoppingEntries([deviceA], [deviceB], []));
  const onB = pickedOf(mergeShoppingEntries([deviceB], [deviceA], []));
  assert.equal(onA, false);
  assert.equal(onB, false);
  assert.equal(onA, onB, 'both devices converge');
});

test('equal timestamps resolve deterministically (order-independent) via OR', () => {
  const a = E({ picked: true, pickedAt: 500 });
  const b = E({ picked: false, pickedAt: 500 });
  assert.equal(pickedOf(mergeShoppingEntries([a], [b], [])), pickedOf(mergeShoppingEntries([b], [a], [])));
});

// ── Legacy snapshot compatibility ────────────────────────────────────────────

test('legacy timeless entries keep the sticky-OR merge (no regression during rollover)', () => {
  const local = [E({ picked: true })];   // no pickedAt
  const remote = [E({ picked: false })];  // no pickedAt
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(pickedOf(merged), true, 'completion stays sticky when neither side is timestamped');
  assert.equal('pickedAt' in merged[0], false, 'no timestamp key is introduced for legacy entries');
});

test('a timestamped action beats a legacy timeless entry', () => {
  const legacyChecked = [E({ picked: true })];              // no timestamp
  const newUncheck = [E({ picked: false, pickedAt: 999 })]; // explicit uncheck
  assert.equal(pickedOf(mergeShoppingEntries(legacyChecked, newUncheck, [])), false);
  assert.equal(pickedOf(mergeShoppingEntries(newUncheck, legacyChecked, [])), false);
});

// ── Reducer stamping ─────────────────────────────────────────────────────────

const activeWith = (entry: ShoppingEntry): ShoppingSession => ({
  ...initialSession,
  status: 'shopping_store',
  tripId: 't',
  startedAt: 1,
  storeQueue: ['s1'],
  currentIndex: 0,
  entries: [entry],
});

test('TOGGLE_PICK stamps pickedAt when a timestamp is supplied', () => {
  const next = reduce(activeWith(E({ picked: false })), { type: 'TOGGLE_PICK', itemId: 'env', now: 777 });
  assert.equal(next.entries[0].picked, true);
  assert.equal(next.entries[0].pickedAt, 777);
});

test('TOGGLE_PICK omits pickedAt when no timestamp is supplied (legacy shape)', () => {
  const next = reduce(activeWith(E({ picked: false })), { type: 'TOGGLE_PICK', itemId: 'env' });
  assert.equal(next.entries[0].picked, true);
  assert.equal('pickedAt' in next.entries[0], false);
});

test('MARK_OUT_OF_STOCK stamps both outOfStockAt and pickedAt and clears picked', () => {
  const next = reduce(activeWith(E({ picked: true, pickedAt: 100 })), { type: 'MARK_OUT_OF_STOCK', itemId: 'env', now: 888 });
  assert.equal(next.entries[0].outOfStock, true);
  assert.equal(next.entries[0].outOfStockAt, 888);
  assert.equal(next.entries[0].picked, false);
  assert.equal(next.entries[0].pickedAt, 888, 'clearing picked via out-of-stock must also stamp pickedAt so it wins LTW');
});
