import { test } from 'node:test';
import assert from 'node:assert/strict';

import { consolidatePantryItems, normalizeItemName } from '../core/services/pantryItems';
import type { PantryItem } from '../types';

const item = (patch: Partial<PantryItem>): PantryItem => ({
  id: 'original',
  name: 'Apple',
  quantity: 1,
  unit: 'unit',
  status: 'stocked',
  storageLocation: 'fridge',
  storeId: null,
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

test('normalizes spacing and case for duplicate detection', () => {
  assert.equal(normalizeItemName('  APPLE  '), 'apple');
});

test('consolidates duplicates without losing the original id or assigned store', () => {
  const result = consolidatePantryItems([
    item({ id: 'original', updatedAt: 1 }),
    item({ id: 'duplicate', storeId: 'store-1', updatedAt: 2 }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'original');
  assert.equal(result[0].storeId, 'store-1');
});

test('keeps the newest item state while preserving useful duplicate metadata', () => {
  const result = consolidatePantryItems([
    item({ id: 'original', status: 'low', storeId: 'store-1', updatedAt: 1 }),
    item({ id: 'duplicate', status: 'stocked', quantity: 3, updatedAt: 5 }),
  ]);

  assert.equal(result[0].status, 'stocked');
  assert.equal(result[0].quantity, 3);
  assert.equal(result[0].storeId, 'store-1');
});
