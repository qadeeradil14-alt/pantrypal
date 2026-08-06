import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeShoppingEntries } from '../core/services/shoppingEntrySync';
import type { ShoppingEntry } from '../types';

const entry = (over: Partial<ShoppingEntry>): ShoppingEntry => ({
  entryId: 'occ:1', pantryItemId: 'i1', stopId: 'stop:1', storeId: 's1',
  name: 'Lamb', quantity: 1, unit: 'unit', picked: false,
  ...over,
} as ShoppingEntry);

test('later addedAt re-add cannot erase a stamped picked=true (local newer flag, remote newer addedAt)', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ addedAt: 200, picked: false })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].picked, true);
  assert.equal(merged[0].pickedAt, 500);
  assert.equal(merged[0].addedAt, 200, 'structural addedAt still comes from the newer copy');
});

test('both merge directions produce the same picked outcome', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ addedAt: 200, picked: false })];
  const ab = mergeShoppingEntries(local, remote, []);
  const ba = mergeShoppingEntries(remote, local, []);
  assert.equal(ab[0].picked, true);
  assert.equal(ba[0].picked, true);
  assert.equal(ab[0].pickedAt, ba[0].pickedAt);
});

test('a legitimate later unpick with a newer pickedAt still wins', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ addedAt: 200, picked: false, pickedAt: 900 })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged[0].picked, false);
  assert.equal(merged[0].pickedAt, 900);
});

test('tombstone/removal still wins over any addedAt or flag state', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ addedAt: 200, picked: false })];
  const merged = mergeShoppingEntries(local, remote, ['occ:1']);
  assert.equal(merged.length, 0);
});

test('outOfStock resolves independently of picked across an addedAt asymmetry', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500, outOfStock: false })];
  const remote = [entry({ addedAt: 200, picked: false, outOfStock: true, outOfStockAt: 700 })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged[0].picked, true, 'picked unaffected by outOfStock resolution');
  assert.equal(merged[0].outOfStock, true);
  assert.equal(merged[0].outOfStockAt, 700);
});

test('equal-addedAt merges are unchanged (tie keeps historical entry-wins structural shape)', () => {
  const local = [entry({ addedAt: 100, picked: true, pickedAt: 500, quantity: 1 })];
  const remote = [entry({ addedAt: 100, picked: false, quantity: 2 })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged[0].quantity, 2, 'structural field from entry (remote) on tie, as before');
  assert.equal(merged[0].picked, true, 'flag still resolved by timestamp, not by tie-break');
});

test('same entryId, DIFFERENT stopId: OTA 429 contract applies (newer addedAt owns flags wholesale)', () => {
  const local = [entry({ stopId: 'stop:1', addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ stopId: 'stop:2', addedAt: 200, picked: false })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].stopId, 'stop:2');
  assert.equal(merged[0].picked, false, 'cross-stop: newer addedAt owns completion state wholesale');
  assert.equal('pickedAt' in merged[0], false);
});

test('same entryId, SAME stopId: modern rule applies (resolveTimedFlag decides picked independently)', () => {
  const local = [entry({ stopId: 'stop:1', addedAt: 100, picked: true, pickedAt: 500 })];
  const remote = [entry({ stopId: 'stop:1', addedAt: 200, picked: false })];
  const merged = mergeShoppingEntries(local, remote, []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].stopId, 'stop:1');
  assert.equal(merged[0].picked, true, 'same-stop: stamped pick survives unstamped re-add');
  assert.equal(merged[0].pickedAt, 500);
});

test('cross-stop, EQUAL addedAt: order-independent, stamped pick survives in both directions', () => {
  const local = entry({ stopId: 'stop:1', addedAt: 100, picked: true, pickedAt: 500 });
  const remote = entry({ stopId: 'stop:2', addedAt: 100, picked: false });
  const fwd = mergeShoppingEntries([local], [remote], [])[0];
  const rev = mergeShoppingEntries([remote], [local], [])[0];
  assert.equal(fwd.picked, true, 'forward: stamped pick must not be erased by an unstamped equal-addedAt cross-stop copy');
  assert.equal(fwd.pickedAt, 500);
  assert.equal(rev.picked, true, 'reverse: same outcome regardless of argument order');
  assert.equal(rev.pickedAt, 500);
  assert.deepEqual(fwd, rev, 'cross-stop equal-addedAt merge must converge regardless of direction');
});

test('cross-stop, MISSING addedAt on both sides (legacy): order-independent, stamped pick survives in both directions', () => {
  const local = entry({ stopId: 'stop:1', picked: true, pickedAt: 500 });
  const remote = entry({ stopId: 'stop:2', picked: false });
  const fwd = mergeShoppingEntries([local], [remote], [])[0];
  const rev = mergeShoppingEntries([remote], [local], [])[0];
  assert.equal(fwd.picked, true);
  assert.equal(fwd.pickedAt, 500);
  assert.deepEqual(fwd, rev, 'legacy (no addedAt) cross-stop merge must converge regardless of direction');
});

test('cross-stop, EQUAL addedAt: outOfStock resolves independently and converges', () => {
  const local = entry({ stopId: 'stop:1', addedAt: 100, picked: false, outOfStock: true, outOfStockAt: 700 });
  const remote = entry({ stopId: 'stop:2', addedAt: 100, picked: false });
  const fwd = mergeShoppingEntries([local], [remote], [])[0];
  const rev = mergeShoppingEntries([remote], [local], [])[0];
  assert.equal(fwd.outOfStock, true);
  assert.equal(fwd.outOfStockAt, 700);
  assert.deepEqual(fwd, rev);
});

test('cross-stop, STRICTLY DIFFERING addedAt: OTA 429 wholesale-winner behavior unchanged and order-independent', () => {
  const local = entry({ stopId: 'stop:1', addedAt: 100, picked: true, pickedAt: 500 });
  const remote = entry({ stopId: 'stop:2', addedAt: 200, picked: false });
  const fwd = mergeShoppingEntries([local], [remote], [])[0];
  const rev = mergeShoppingEntries([remote], [local], [])[0];
  assert.equal(fwd.picked, false, 'newer addedAt owns completion state wholesale, per OTA 429');
  assert.equal('pickedAt' in fwd, false);
  assert.equal(fwd.stopId, 'stop:2');
  assert.deepEqual(fwd, rev, 'strictly-differing addedAt cross-stop is already order-independent');
});

test('cross-stop, EQUAL addedAt: a tombstoned entryId is still dropped', () => {
  const local = entry({ stopId: 'stop:1', addedAt: 100, picked: true, pickedAt: 500 });
  const remote = entry({ stopId: 'stop:2', addedAt: 100, picked: false });
  const merged = mergeShoppingEntries([local], [remote], ['occ:1']);
  assert.equal(merged.length, 0, 'tombstone wins regardless of the cross-stop tie-break path');
});
