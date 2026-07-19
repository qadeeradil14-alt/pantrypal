import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePantryItems, mergeTombstones } from '../core/services/mergePantryState';
import type { PantryItem } from '../types';

function item(id: string, updatedAt: number, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status: 'stocked',
    storeId: null,
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  } as PantryItem;
}

test('items added on one device are never dropped by the other (the reported bug)', () => {
  // iPad already had A; iPhone snapshot has A + newly-added B, C.
  const ipad = [item('A', 100)];
  const iphone = [item('A', 100), item('B', 200), item('C', 210)];
  const merged = mergePantryItems(ipad, iphone, []);
  assert.deepEqual(merged.map((i) => i.id).sort(), ['A', 'B', 'C']);
});

test('per-item last-writer-wins by updatedAt regardless of list order', () => {
  const local = [item('A', 300, { name: 'local-new' })];
  const remote = [item('A', 100, { name: 'remote-old' })];
  assert.equal(mergePantryItems(local, remote, [])[0].name, 'local-new');
  assert.equal(mergePantryItems(remote, local, [])[0].name, 'local-new');
});

test('a tombstone keeps a deleted item deleted even if the other side still has it', () => {
  const local: PantryItem[] = [];
  const remote = [item('A', 100)]; // stale device still has A
  const merged = mergePantryItems(local, remote, [{ id: 'A', deletedAt: 150 }]);
  assert.deepEqual(merged.map((i) => i.id), []);
});

test('re-adding an item after its deletion wins over the tombstone', () => {
  const local = [item('A', 500)]; // re-added after the delete
  const remote: PantryItem[] = [];
  const merged = mergePantryItems(local, remote, [{ id: 'A', deletedAt: 300 }]);
  assert.deepEqual(merged.map((i) => i.id), ['A']);
});

test('local order preserved, remote-only items appended', () => {
  const local = [item('A', 10), item('B', 10)];
  const remote = [item('B', 10), item('C', 10)];
  assert.deepEqual(mergePantryItems(local, remote, []).map((i) => i.id), ['A', 'B', 'C']);
});

test('mergeTombstones unions by id keeping latest deletedAt and prunes old', () => {
  const now = 1_000_000_000_000;
  const merged = mergeTombstones(
    [{ id: 'A', deletedAt: now - 1000 }, { id: 'B', deletedAt: 1 }],
    [{ id: 'A', deletedAt: now - 10 }],
    now,
    5000,
  );
  const a = merged.find((t) => t.id === 'A');
  assert.equal(a?.deletedAt, now - 10); // latest kept
  assert.equal(merged.find((t) => t.id === 'B'), undefined); // pruned (too old)
});

test('malformed inputs never throw', () => {
  assert.deepEqual(mergePantryItems(undefined, undefined, undefined), []);
  assert.deepEqual(
    mergePantryItems([null as unknown as PantryItem, item('A', 1)], [], [null as unknown as never]).map((i) => i.id),
    ['A'],
  );
});
