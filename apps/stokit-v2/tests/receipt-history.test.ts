import assert from 'node:assert/strict';
import test from 'node:test';
import { storedReceiptItems } from '../core/services/receiptHistory';

test('receipt history keeps saved scan prices after reload', () => {
  assert.deepEqual(storedReceiptItems({
    id: 'receipt-1',
    items: [{ name: 'Baby Wipes', quantity: 1, price: 7.97 }],
  }), [{ id: 'receipt-1:0', itemName: 'Baby Wipes', price: 7.97 }]);
});

test('receipt history safely keeps a missing item price as unavailable', () => {
  assert.deepEqual(storedReceiptItems({
    id: 'receipt-1',
    items: [{ name: 'Unpriced item', quantity: 1, price: null }],
  }), [{ id: 'receipt-1:0', itemName: 'Unpriced item', price: 0 }]);
});
