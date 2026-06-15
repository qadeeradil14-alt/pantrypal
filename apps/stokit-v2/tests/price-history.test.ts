import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cheapestRecentPrice,
  isDuplicatePriceEntry,
  isValidPrice,
  itemPriceHistory,
  lastPriceAtStore,
} from '../core/services/priceHistory';
import type { PriceEntry } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = Date.now();

const prices: PriceEntry[] = [
  { id: '1', itemId: 'milk', itemName: 'Milk', storeId: 'whole-foods', price: 6.49, paidAt: NOW - 3000 },
  { id: '2', itemId: 'milk', itemName: ' milk ', storeId: 'walmart', price: 4.99, paidAt: NOW - 2000 },
  { id: '3', itemId: 'milk', itemName: 'MILK', storeId: 'walmart', price: 5.49, paidAt: NOW - 1000 },
  { id: '4', itemId: 'eggs', itemName: 'Eggs', storeId: 'walmart', price: 3.99, paidAt: NOW - 500 },
];

// ── isValidPrice ──────────────────────────────────────────────────────────────

test('isValidPrice: rejects zero', () => assert.equal(isValidPrice(0), false));
test('isValidPrice: rejects negative', () => assert.equal(isValidPrice(-1.5), false));
test('isValidPrice: rejects NaN', () => assert.equal(isValidPrice(NaN), false));
test('isValidPrice: rejects Infinity', () => assert.equal(isValidPrice(Infinity), false));
test('isValidPrice: rejects string', () => assert.equal(isValidPrice('5.99'), false));
test('isValidPrice: rejects undefined', () => assert.equal(isValidPrice(undefined), false));
test('isValidPrice: accepts positive number', () => assert.equal(isValidPrice(4.99), true));
test('isValidPrice: accepts small positive', () => assert.equal(isValidPrice(0.01), true));

// ── itemPriceHistory ──────────────────────────────────────────────────────────

test('price history matches normalized item names newest first', () => {
  assert.deepEqual(itemPriceHistory(prices, 'Milk').map((e) => e.id), ['3', '2', '1']);
});

test('price history is empty for unknown item', () => {
  assert.equal(itemPriceHistory(prices, 'Butter').length, 0);
});

test('case and whitespace variations match the same item', () => {
  assert.equal(itemPriceHistory(prices, ' MILK ').length, 3);
});

// ── lastPriceAtStore ──────────────────────────────────────────────────────────

test('last price at a store returns its newest entry', () => {
  assert.equal(lastPriceAtStore(prices, 'milk', 'walmart')?.price, 5.49);
});

test('last price at a store returns undefined for unknown store', () => {
  assert.equal(lastPriceAtStore(prices, 'milk', 'target'), undefined);
});

test('last price at a store returns undefined for unknown item', () => {
  assert.equal(lastPriceAtStore(prices, 'Bread', 'walmart'), undefined);
});

// ── cheapestRecentPrice ───────────────────────────────────────────────────────

test('cheapest comparison uses the latest known price from each store', () => {
  // Whole Foods: $6.49 | Walmart latest: $5.49 → Walmart is cheaper
  assert.equal(cheapestRecentPrice(prices, 'milk')?.storeId, 'walmart');
});

test('cheapest price returns undefined for item with no history', () => {
  assert.equal(cheapestRecentPrice(prices, 'Bread'), undefined);
});

test('cheapest price with single-store history returns that store', () => {
  assert.equal(cheapestRecentPrice(prices, 'Eggs')?.storeId, 'walmart');
});

test('cheapest price does not use stale override — uses latest per store', () => {
  // Walmart has two entries: $4.99 (older) and $5.49 (newer).
  // cheapestRecentPrice should use $5.49 (newest), not $4.99 (cheapest ever).
  const cheapest = cheapestRecentPrice(prices, 'milk');
  // Whole Foods $6.49 vs Walmart $5.49 — Walmart wins but at the current price
  assert.equal(cheapest?.price, 5.49);
});

// ── isDuplicatePriceEntry ─────────────────────────────────────────────────────

test('duplicate: detects identical entry within window', () => {
  const entries: PriceEntry[] = [
    { id: 'x', itemId: 'milk', itemName: 'Milk', storeId: 'walmart', price: 5.49, paidAt: Date.now() - 5000 },
  ];
  assert.equal(isDuplicatePriceEntry(entries, { itemName: 'milk', storeId: 'walmart', price: 5.49 }), true);
});

test('duplicate: not flagged when price differs by more than 1 cent', () => {
  const entries: PriceEntry[] = [
    { id: 'x', itemId: 'milk', itemName: 'Milk', storeId: 'walmart', price: 5.49, paidAt: Date.now() - 5000 },
  ];
  assert.equal(isDuplicatePriceEntry(entries, { itemName: 'milk', storeId: 'walmart', price: 5.51 }), false);
});

test('duplicate: not flagged when store differs', () => {
  const entries: PriceEntry[] = [
    { id: 'x', itemId: 'milk', itemName: 'Milk', storeId: 'walmart', price: 5.49, paidAt: Date.now() - 5000 },
  ];
  assert.equal(isDuplicatePriceEntry(entries, { itemName: 'milk', storeId: 'whole-foods', price: 5.49 }), false);
});

test('duplicate: not flagged when entry is older than window', () => {
  const entries: PriceEntry[] = [
    { id: 'x', itemId: 'milk', itemName: 'Milk', storeId: 'walmart', price: 5.49, paidAt: Date.now() - 60_000 },
  ];
  assert.equal(isDuplicatePriceEntry(entries, { itemName: 'milk', storeId: 'walmart', price: 5.49 }), false);
});

test('duplicate: case-insensitive item name matching', () => {
  const entries: PriceEntry[] = [
    { id: 'x', itemId: 'milk', itemName: 'MILK', storeId: 'walmart', price: 5.49, paidAt: Date.now() - 1000 },
  ];
  assert.equal(isDuplicatePriceEntry(entries, { itemName: ' milk ', storeId: 'walmart', price: 5.49 }), true);
});

test('duplicate: empty history is never a duplicate', () => {
  assert.equal(isDuplicatePriceEntry([], { itemName: 'Milk', storeId: 'walmart', price: 5.49 }), false);
});
