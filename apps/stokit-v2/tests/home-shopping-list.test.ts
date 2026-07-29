import { test } from 'node:test';
import assert from 'node:assert/strict';

import { homeShoppingItems } from '../core/services/homeShoppingItems';
import type { PantryItem } from '../types';

function item(id: string, status: PantryItem['status']): PantryItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status,
    storageLocation: 'pantry',
    storeId: 'store',
    expiryDate: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

test('Home excludes every item already attached to the active trip', () => {
  const items = [
    item('completed-store-item', 'low'),
    item('current-store-item', 'expiring'),
    item('future-item', 'low'),
  ];

  const visible = homeShoppingItems(
    items,
    [{ itemId: 'completed-store-item' }, { itemId: 'current-store-item' }],
  );

  assert.deepEqual(visible.map((entry) => entry.id), ['future-item']);
});

test('Home keeps low items visible when no trip owns them', () => {
  const visible = homeShoppingItems(
    [item('banana', 'low'), item('milk', 'stocked')],
    [],
  );

  assert.deepEqual(visible.map((entry) => entry.id), ['banana']);
});
