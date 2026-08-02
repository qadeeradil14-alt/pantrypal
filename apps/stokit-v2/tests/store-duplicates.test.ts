import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dedupeStoresForDisplay, findDuplicateStore } from '../core/services/storeDuplicates';
import type { Store } from '../types';

function store(patch: Partial<Store>): Store {
  return {
    id: patch.id ?? 'store_1',
    name: patch.name ?? 'Lidl',
    createdAt: patch.createdAt ?? 1,
    updatedAt: patch.updatedAt ?? 1,
    ...patch,
  };
}

test('same placeId is blocked as duplicate', () => {
  const existing = store({ id: 'lidl_1', name: 'Lidl', placeId: 'place_123' });
  const duplicate = findDuplicateStore([existing], {
    name: 'Different label',
    placeId: ' place_123 ',
  });

  assert.equal(duplicate?.id, 'lidl_1');
});

test('normalized name + address is blocked as duplicate', () => {
  const existing = store({
    id: 'lidl_2',
    name: ' Lidl ',
    address: '100 Main St, Fairfax, VA',
  });
  const duplicate = findDuplicateStore([existing], {
    name: 'lidl',
    address: ' 100 main st, fairfax, va ',
  });

  assert.equal(duplicate?.id, 'lidl_2');
});

test('normalized name + nearby coordinates is blocked as duplicate', () => {
  const existing = store({
    id: 'lidl_3',
    name: 'Lidl',
    lat: 38.8462,
    lng: -77.3064,
  });
  const duplicate = findDuplicateStore([existing], {
    name: ' lidl ',
    lat: 38.84625,
    lng: -77.30645,
  });

  assert.equal(duplicate?.id, 'lidl_3');
});

test('unique store is not treated as duplicate', () => {
  const existing = store({
    id: 'lidl_4',
    name: 'Lidl',
    placeId: 'place_lidl',
    address: '100 Main St',
    lat: 38.8462,
    lng: -77.3064,
  });
  const duplicate = findDuplicateStore([existing], {
    name: 'Subway',
    placeId: 'place_subway',
    address: '200 Market St',
    lat: 38.85,
    lng: -77.31,
  });

  assert.equal(duplicate, undefined);
});

// ── Display dedupe for records that arrived already duplicated via sync ──────

test('two Lidl records at the same address render as one card, oldest kept', () => {
  // The reported case: both members added the same shop, so mergeStores (which
  // unions by id) kept both.
  const older = store({ id: 'lidl_a', name: 'Lidl', address: '2904 Prince William Pkwy, Woodbridge, VA', createdAt: 100 });
  const newer = store({ id: 'lidl_b', name: 'Lidl', address: '2904 Prince William Pkwy, Woodbridge, VA', createdAt: 900 });

  const { stores: visible, canonicalIdFor } = dedupeStoresForDisplay([older, newer]);

  assert.deepEqual(visible.map((s) => s.id), ['lidl_a'], 'only the oldest record renders');
  assert.equal(canonicalIdFor.get('lidl_b'), 'lidl_a', 'the collapsed id maps onto the survivor');
  assert.equal(canonicalIdFor.get('lidl_a'), 'lidl_a');
});

test('display dedupe tolerates punctuation, case and spacing differences', () => {
  const a = store({ id: 'a', name: 'Lidl', address: '2904 Prince William Pkwy, Woodbridge, VA', createdAt: 1 });
  const b = store({ id: 'b', name: '  lidl ', address: '2904  prince william pkwy,  woodbridge  va ', createdAt: 2 });

  assert.deepEqual(dedupeStoresForDisplay([a, b]).stores.map((s) => s.id), ['a']);
});

test('same chain at a different address is preserved', () => {
  const woodbridge = store({ id: 'lidl_w', name: 'Lidl', address: '2904 Prince William Pkwy, Woodbridge, VA', createdAt: 1 });
  const fairfax = store({ id: 'lidl_f', name: 'Lidl', address: '100 Main St, Fairfax, VA', createdAt: 2 });

  const { stores: visible } = dedupeStoresForDisplay([woodbridge, fairfax]);

  assert.deepEqual(visible.map((s) => s.id), ['lidl_w', 'lidl_f'], 'both locations still render');
});

test('display dedupe preserves original list order and leaves unique lists untouched', () => {
  const target = store({ id: 'target', name: 'Target', address: '2460 Prince William Pkwy', createdAt: 5 });
  const lidl = store({ id: 'lidl', name: 'Lidl', address: '2904 Prince William Pkwy', createdAt: 1 });
  const sams = store({ id: 'sams', name: "Sam's Club", address: '14050 Worth Ave', createdAt: 9 });
  const input = [target, lidl, sams];

  const { stores: visible } = dedupeStoresForDisplay(input);

  assert.deepEqual(visible.map((s) => s.id), ['target', 'lidl', 'sams']);
});

test('Stores screen renders the deduped list, not the raw store array', () => {
  const source = readFileSync(new URL('../app/(tabs)/stores.tsx', import.meta.url), 'utf8');

  assert.match(source, /dedupeStoresForDisplay\(stores\)/, 'the screen derives a deduped list');
  assert.match(source, /\{visibleStores\.map\(\(store\) =>/, 'and renders that list');
  assert.doesNotMatch(source, /\{stores\.map\(\(store\) =>/, 'the raw array is never rendered directly');
  // Item counts must follow the surviving card, or items on a collapsed
  // duplicate would silently vanish from the UI.
  assert.match(source, /canonicalIdFor\.get\(i\.storeId\) === storeId/);
});

test('durable-store.addStore returns existing store on duplicate', () => {
  const source = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const addStoreBody = source.slice(source.indexOf('addStore: (input) => {'), source.indexOf('updateStore: (id, patch) => {'));

  assert.match(addStoreBody, /const duplicate = findDuplicateStore\(get\(\)\.stores, input\);/);
  assert.match(addStoreBody, /if \(duplicate\) return duplicate;/);
});
