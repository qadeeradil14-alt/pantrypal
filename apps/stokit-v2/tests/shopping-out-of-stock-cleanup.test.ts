import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';

// History: completing a store used to null the storeId of that store's
// unpicked and out-of-stock items, so the finished store could not reactivate.
// That overloaded "no storeId" (which everywhere else means "needs a store")
// to also mean "already shopped here", and because the Shopping tab's `plan`
// groups strictly by item.storeId, it erased the completed store from the
// shopping list entirely — the "Safeway takes over Costco" bug.
// Reactivation is now blocked directly by session.completedStopIds, so the
// items keep their store assignment. These tests pin that contract.

const src = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

test('the store_summary transition no longer unassigns items from the completed store', () => {
  assert.doesNotMatch(
    src,
    /completedStopId[\s\S]{0,400}?durable\.updateItem\([^)]*\{ storeId: null \}\)/,
    'completing a store must not null item.storeId — that erases the store from the shopping list',
  );
});

test('completing a store records the stop in completedStopIds', () => {
  const started = reduce(initialSession, {
    type: 'START_TRIP',
    now: 1,
    entries: [
      { pantryItemId: 'i1', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'walmart', picked: false },
    ],
  });
  const done = reduce(
    reduce(started, { type: 'FINISH_STORE', now: 2 }),
    { type: 'SKIP_RECEIPT', now: 3 },
  );

  assert.equal(done.status, 'store_summary');
  assert.deepEqual(done.completedStopIds, [started.entries[0].stopId]);
});

test('MARK_OUT_OF_STOCK produces an entry the store_summary handler can detect', () => {
  const started = reduce(initialSession, {
    type: 'START_TRIP',
    now: 1,
    entries: [
      { pantryItemId: 'i1', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'walmart', picked: false },
    ],
  });
  const marked = reduce(started, {
    type: 'MARK_OUT_OF_STOCK',
    entryId: started.entries[0].entryId,
  });
  const entry = marked.entries.find((e) => e.pantryItemId === 'i1');

  assert.equal(entry?.outOfStock, true);
  assert.equal(entry?.picked, false, 'out-of-stock items must not also count as picked');

  const afterFinish = reduce(marked, { type: 'FINISH_STORE', now: 2 });
  const afterReceipt = reduce(afterFinish, {
    type: 'SKIP_RECEIPT',
    now: 3,
  }) as ShoppingSession;

  assert.equal(afterReceipt.status, 'store_summary');
  const stillOutOfStock = afterReceipt.entries.find((e) => e.pantryItemId === 'i1');
  assert.equal(stillOutOfStock?.storeId, 'walmart', 'session-level storeId is untouched — the durable item unassignment happens in session-store.ts, not the pure reducer');
});
