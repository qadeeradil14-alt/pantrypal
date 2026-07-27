import test from 'node:test';
import assert from 'node:assert/strict';

import { nextTimestamp } from '../core/services/id';
import { mergePantryItems } from '../core/services/mergePantryState';
import { mergeShoppingEntries } from '../core/services/shoppingEntrySync';
import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import type { PantryItem, ShoppingEntry } from '../types';

// Root cause (OTA 389 investigation): item.updatedAt / pickedAt / outOfStockAt
// were stamped with a plain wall clock. A device with a slower clock could
// stamp a SMALLER value than a peer's already-known timestamp, so its own
// edits permanently lost the last-writer-wins merge to that peer — a
// directional, progressively-worsening sync failure. Fix: nextTimestamp()
// stamps Math.max(wallClock, currentKnownValue + 1), so a local edit always
// exceeds whatever version it was based on, regardless of clock skew.

const item = (o: Partial<PantryItem> = {}): PantryItem => ({
  id: 'env', name: 'Envelopes', quantity: 1, unit: 'unit', status: 'low',
  storageLocation: 'pantry', storeId: 'dollar-general', expiryDate: null,
  createdAt: 1, updatedAt: 1, ...o,
});

const entry = (o: Partial<ShoppingEntry> = {}): ShoppingEntry => ({
  itemId: 'env', name: 'Envelopes', quantity: 1, unit: 'unit', storeId: 'dollar-general',
  picked: false, ...o,
});

const active = (entries: ShoppingEntry[]): ShoppingSession => ({
  ...initialSession, status: 'shopping_store', tripId: 't', startedAt: 1,
  storeQueue: ['dollar-general'], currentIndex: 0, entries,
});

// ── 1. Behind-clock device quantity edit ─────────────────────────────────────

test('behind-clock device quantity edit still wins the merge against a faster-clock peer', () => {
  // iPhone (fast clock) pushed the item at updatedAt=5000.
  const peerItem = item({ updatedAt: 5000, quantity: 1 });
  // iPad applied that snapshot, so its own copy now reads updatedAt=5000 too —
  // but iPad's wall clock only reads 1000 (behind).
  const stamped = nextTimestamp(peerItem.updatedAt, 1000);
  assert.ok(stamped > peerItem.updatedAt, 'stamped timestamp must exceed the known peer version despite a behind wall clock');
  const ipadEdit = { ...peerItem, quantity: 4, updatedAt: stamped };

  // Round-trips back to iPhone, which still holds the original updatedAt=5000 copy.
  const merged = mergePantryItems([peerItem], [ipadEdit], []);
  assert.equal(merged[0].quantity, 4, 'the behind-clock edit must win the merge on the peer (the reported bug)');
});

test('behind-clock deletion still beats the newest item version and prevents resurrection', () => {
  const peerItem = item({ updatedAt: 5000 });
  const deletedAt = nextTimestamp(peerItem.updatedAt, 1000);

  const merged = mergePantryItems([], [peerItem], [{ id: peerItem.id, deletedAt }]);

  assert.deepEqual(merged, []);
});

// ── 2. Reverse-direction quantity edit ───────────────────────────────────────

test('reverse direction: fast-clock device quantity edit still propagates normally', () => {
  const base = item({ updatedAt: 1000, quantity: 1 });
  const iphoneEdit = { ...base, quantity: 9, updatedAt: nextTimestamp(base.updatedAt, 9000) };
  const merged = mergePantryItems([base], [iphoneEdit], []);
  assert.equal(merged[0].quantity, 9, 'a normal, non-skewed edit is unaffected by the fix');
});

test('both directions converge to the latest edit after a skewed round-trip', () => {
  const original = item({ updatedAt: 5000, quantity: 1 });
  // iPad (slow clock) edits first.
  const ipadEdit = { ...original, quantity: 4, updatedAt: nextTimestamp(original.updatedAt, 1000) };
  // iPhone (fast clock) later edits again, based on iPad's version.
  const iphoneEdit = { ...ipadEdit, quantity: 7, updatedAt: nextTimestamp(ipadEdit.updatedAt, 9000) };

  const onIpad = mergePantryItems([ipadEdit], [iphoneEdit], []);
  const onIphone = mergePantryItems([iphoneEdit], [ipadEdit], []);
  assert.equal(onIpad[0].quantity, 7);
  assert.equal(onIphone[0].quantity, 7);
  assert.equal(onIpad[0].quantity, onIphone[0].quantity, 'both devices converge');
});

// ── 3. Check then uncheck across skewed clocks ───────────────────────────────

test('check then uncheck across skewed clocks: the uncheck still wins the merge', () => {
  let session = active([entry({ picked: false })]);
  // iPad (behind clock) checks at wall-time 1000.
  session = reduce(session, { type: 'TOGGLE_PICK', itemId: 'env', now: 1000 });
  assert.equal(session.entries[0].picked, true);
  const checkedAt = session.entries[0].pickedAt!;

  // iPad unchecks moments later, but its clock reads the same or even a
  // slightly lower value (e.g. NTP correction) — not strictly advanced.
  session = reduce(session, { type: 'TOGGLE_PICK', itemId: 'env', now: 999 });
  assert.equal(session.entries[0].picked, false);
  assert.ok(session.entries[0].pickedAt! > checkedAt, 'the uncheck stamp must exceed the prior check even under a non-advancing clock');

  // A peer that only ever saw the earlier "checked" state.
  const remoteStillChecked = entry({ picked: true, pickedAt: checkedAt });
  const merged = mergeShoppingEntries(session.entries, [remoteStillChecked], []);
  assert.equal(merged[0].picked, false, 'the uncheck must win the merge on the peer');
});

// ── 4. Out-of-stock set then clear across skewed clocks ──────────────────────

test('out-of-stock set then clear across skewed clocks: the clear still wins the merge', () => {
  let session = active([entry({ outOfStock: false })]);
  session = reduce(session, { type: 'MARK_OUT_OF_STOCK', itemId: 'env', now: 1000 });
  assert.equal(session.entries[0].outOfStock, true);
  const setAt = session.entries[0].outOfStockAt!;

  // Cleared moments later under a non-advancing / behind clock.
  session = reduce(session, { type: 'MARK_OUT_OF_STOCK', itemId: 'env', now: 999 });
  assert.equal(session.entries[0].outOfStock, false);
  assert.ok(session.entries[0].outOfStockAt! > setAt, 'the clear stamp must exceed the prior set even under a non-advancing clock');

  const remoteStillOOS = entry({ outOfStock: true, outOfStockAt: setAt });
  const merged = mergeShoppingEntries(session.entries, [remoteStillOOS], []);
  assert.equal(merged[0].outOfStock, false, 'clearing out-of-stock must win the merge on the peer');
});

// ── nextTimestamp unit coverage ───────────────────────────────────────────────

test('nextTimestamp: advancing clock just uses the wall clock', () => {
  assert.equal(nextTimestamp(100, 500), 500);
});

test('nextTimestamp: non-advancing/behind clock still exceeds the known value', () => {
  assert.equal(nextTimestamp(500, 100), 501);
});

test('nextTimestamp: no known prior value falls back to the wall clock', () => {
  assert.equal(nextTimestamp(undefined, 500), 500);
});
