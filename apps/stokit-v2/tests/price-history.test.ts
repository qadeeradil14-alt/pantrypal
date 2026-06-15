import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheapestRecentPrice, itemPriceHistory, lastPriceAtStore } from '../core/services/priceHistory';
import type { PriceEntry } from '../types';

const prices: PriceEntry[] = [
  { id: '1', itemId: 'milk', itemName: 'Milk', storeId: 'whole-foods', price: 6.49, paidAt: 10 },
  { id: '2', itemId: 'milk', itemName: ' milk ', storeId: 'walmart', price: 4.99, paidAt: 20 },
  { id: '3', itemId: 'milk', itemName: 'MILK', storeId: 'walmart', price: 5.49, paidAt: 30 },
  { id: '4', itemId: 'eggs', itemName: 'Eggs', storeId: 'walmart', price: 3.99, paidAt: 40 },
];

test('price history matches normalized item names newest first', () => {
  assert.deepEqual(itemPriceHistory(prices, 'Milk').map((entry) => entry.id), ['3', '2', '1']);
});

test('last price at a store returns its newest entry', () => {
  assert.equal(lastPriceAtStore(prices, 'milk', 'walmart')?.price, 5.49);
});

test('cheapest comparison uses the latest known price from each store', () => {
  assert.equal(cheapestRecentPrice(prices, 'milk')?.storeId, 'walmart');
});
