import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupHomeShoppingOccurrences,
  homeShoppingItems,
} from '../core/services/homeShoppingItems';
import type { PantryItem, ShoppingStoreAssignment } from '../types';

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

test('Home excludes every occurrence already attached to the active trip', () => {
  const items = [
    item('completed-store-item', 'low'),
    item('current-store-item', 'expiring'),
    item('future-item', 'low'),
  ];

  const visible = homeShoppingItems(
    items,
    [],
    [
      { pantryItemId: 'completed-store-item', storeId: 'store' },
      { pantryItemId: 'current-store-item', storeId: 'store' },
    ],
  );

  assert.deepEqual(visible.map((entry) => entry.pantryItem.id), ['future-item']);
});

test('Home keeps low items visible when no trip owns them', () => {
  const visible = homeShoppingItems(
    [item('banana', 'low'), item('milk', 'stocked')],
    [],
    [],
  );

  assert.deepEqual(visible.map((entry) => entry.pantryItem.id), ['banana']);
});

test('OTA 433 regression: Home shows Apple and Banana at both Costco and Safeway', () => {
  const items = [
    { ...item('apple', 'low'), name: 'Apple', storeId: 'safeway' },
    { ...item('banana', 'low'), name: 'Banana', storeId: 'safeway' },
  ];
  const assignments: ShoppingStoreAssignment[] = [
    { id: 'apple-costco', pantryItemId: 'apple', storeId: 'costco', active: true, updatedAt: 1 },
    { id: 'banana-costco', pantryItemId: 'banana', storeId: 'costco', active: true, updatedAt: 2 },
    { id: 'apple-safeway', pantryItemId: 'apple', storeId: 'safeway', active: true, updatedAt: 3 },
    { id: 'banana-safeway', pantryItemId: 'banana', storeId: 'safeway', active: true, updatedAt: 4 },
  ];

  const visible = homeShoppingItems(items, assignments, []);

  assert.equal(visible.length, 4);
  assert.equal(new Set(visible.map((entry) => entry.occurrenceId)).size, 4);
  assert.equal(new Set(visible.map((entry) => entry.storeId)).size, 2);
  assert.deepEqual(
    visible.map((entry) => `${entry.storeId}:${entry.pantryItem.name}`).sort(),
    ['costco:Apple', 'costco:Banana', 'safeway:Apple', 'safeway:Banana'],
  );
});

test('Home excludes only the occurrence already attached to the active trip', () => {
  const apple = { ...item('apple', 'low'), storeId: 'safeway' };
  const assignments: ShoppingStoreAssignment[] = [
    { id: 'apple-costco', pantryItemId: 'apple', storeId: 'costco', active: true, updatedAt: 1 },
    { id: 'apple-safeway', pantryItemId: 'apple', storeId: 'safeway', active: true, updatedAt: 2 },
  ];

  const visible = homeShoppingItems(
    [apple],
    assignments,
    [{ pantryItemId: 'apple', storeId: 'costco' }],
  );

  assert.deepEqual(
    visible.map((entry) => `${entry.storeId}:${entry.pantryItem.id}`),
    ['safeway:apple'],
  );
});

test('Home presentation groups one pantry item assigned to two stores', () => {
  const occurrences = homeShoppingItems(
    [{ ...item('apple', 'low'), name: 'Apple', storeId: 'safeway' }],
    [
      { id: 'apple-costco', pantryItemId: 'apple', storeId: 'costco', active: true, updatedAt: 1 },
      { id: 'apple-safeway', pantryItemId: 'apple', storeId: 'safeway', active: true, updatedAt: 2 },
    ],
    [],
  );

  const groups = groupHomeShoppingOccurrences(occurrences);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.pantryItem.id, 'apple');
  assert.deepEqual(groups[0]?.occurrences.map((entry) => entry.storeId), ['costco', 'safeway']);
});

test('Home presentation groups two pantry items assigned to two stores without changing occurrence totals', () => {
  const occurrences = homeShoppingItems(
    [
      { ...item('apple', 'low'), name: 'Apple', storeId: 'safeway' },
      { ...item('banana', 'low'), name: 'Banana', storeId: 'safeway' },
    ],
    [
      { id: 'apple-costco', pantryItemId: 'apple', storeId: 'costco', active: true, updatedAt: 1 },
      { id: 'apple-safeway', pantryItemId: 'apple', storeId: 'safeway', active: true, updatedAt: 2 },
      { id: 'banana-costco', pantryItemId: 'banana', storeId: 'costco', active: true, updatedAt: 3 },
      { id: 'banana-safeway', pantryItemId: 'banana', storeId: 'safeway', active: true, updatedAt: 4 },
    ],
    [],
  );

  const groups = groupHomeShoppingOccurrences(occurrences);

  assert.equal(occurrences.length, 4);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.pantryItem.name, group.occurrences.length]),
    [['Apple', 2], ['Banana', 2]],
  );
});

test('Home presentation removes one store occurrence without removing its sibling', () => {
  const occurrences = homeShoppingItems(
    [{ ...item('apple', 'low'), name: 'Apple', storeId: 'safeway' }],
    [
      { id: 'apple-costco', pantryItemId: 'apple', storeId: 'costco', active: false, updatedAt: 3 },
      { id: 'apple-safeway', pantryItemId: 'apple', storeId: 'safeway', active: true, updatedAt: 2 },
    ],
    [],
  );

  const groups = groupHomeShoppingOccurrences(occurrences);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.occurrences.map((entry) => entry.storeId), ['safeway']);
});
