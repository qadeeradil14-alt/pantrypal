import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findDuplicateStore } from '../core/services/storeDuplicates';
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

test('durable-store.addStore returns existing store on duplicate', () => {
  const source = readFileSync(new URL('../store/durable-store.ts', import.meta.url), 'utf8');
  const addStoreBody = source.slice(source.indexOf('addStore: (input) => {'), source.indexOf('updateStore: (id, patch) => {'));

  assert.match(addStoreBody, /const duplicate = findDuplicateStore\(get\(\)\.stores, input\);/);
  assert.match(addStoreBody, /if \(duplicate\) return duplicate;/);
});
