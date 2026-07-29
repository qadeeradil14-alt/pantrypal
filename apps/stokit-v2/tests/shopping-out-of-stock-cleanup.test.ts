import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';

// Bug: completing a store visit (store_summary) only cleared *picked* entries
// for that store via durable.clearShoppingEntries. An item marked out of
// stock during the visit is a definitive decision too, but MARK_OUT_OF_STOCK
// never touches durable state — the item kept status 'low' and storeId
// pointing at the just-finished store forever, so the Shopping tab's `plan`
// (derived from items with status low/expiring + a storeId) kept showing that
// store as active even after the trip was fully finished.
// Fix: at store_summary, also null the storeId of that store's out-of-stock
// entries in store/session-store.ts's dispatch.

const src = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

test('the store_summary transition unassigns out-of-stock items from the completed store', () => {
  assert.match(
    src,
    /next\.entries\s*\n\s*\.filter\(\(e\) => e\.stopId === completedStopId && e\.outOfStock\)\s*\n\s*\.forEach\(\(e\) => durable\.updateItem\(e\.pantryItemId, \{ storeId: null \}\)\);/,
    'store_summary must unassign out-of-stock entries for the completed store, not just clear picked ones',
  );
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
