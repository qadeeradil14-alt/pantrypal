import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLowStockWidgetData } from '../core/services/widgetData';
import type { PantryItem } from '../types';

const item = (name: string, status: PantryItem['status']): PantryItem => ({
  id: name,
  name,
  quantity: 1,
  unit: 'unit',
  status,
  storageLocation: 'fridge',
  storeId: null,
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
});

test('includes only low and expiring pantry items', () => {
  const data = buildLowStockWidgetData([
    item('Milk', 'low'),
    item('Bread', 'expiring'),
    item('Eggs', 'stocked'),
    item('Apples', 'purchased'),
  ], 'now');

  assert.deepEqual(data, {
    count: 2,
    itemSummary: 'Milk, Bread',
    updatedAt: 'now',
  });
});

test('limits the widget summary to three items', () => {
  const data = buildLowStockWidgetData([
    item('Milk', 'low'),
    item('Bread', 'low'),
    item('Eggs', 'low'),
    item('Apples', 'low'),
  ]);

  assert.equal(data.count, 4);
  assert.equal(data.itemSummary, 'Milk, Bread, Eggs');
});

test('returns an empty summary when everything is stocked', () => {
  const data = buildLowStockWidgetData([item('Milk', 'stocked')]);

  assert.equal(data.count, 0);
  assert.equal(data.itemSummary, '');
});
