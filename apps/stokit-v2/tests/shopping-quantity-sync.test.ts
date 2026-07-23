import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reconcileShoppingSession } from '../core/services/shoppingEntrySync';
import type { PantryItem, SharedShoppingSession } from '../types';

// ── Root cause: mid-trip quantity change never reaches the synced item ────────
//
// The stepper dispatches UPDATE_QUANTITY, which the shopping machine applies to
// the SESSION ENTRY only. But the pantry item is the synced source of truth:
// reconcileShoppingSession forces every entry.quantity back to item.quantity,
// and durableSnapshot runs that reconcile on every outbound push (and every
// inbound apply). So a session-only quantity change is stripped from every
// snapshot — the peer never sees it, and it is even reverted locally on the
// next reconcile. This is the "iPhone Envelopes = 4, iPad = 1" divergence.

const item = (quantity: number): PantryItem => ({
  id: 'env',
  name: 'Envelopes',
  quantity,
  unit: 'unit',
  status: 'low',
  storageLocation: 'pantry',
  storeId: 'dollar-general',
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
});

const sessionWithEntryQuantity = (quantity: number): SharedShoppingSession => ({
  status: 'shopping_store',
  tripId: 'trip',
  startedAt: 1,
  storeQueue: ['dollar-general'],
  currentIndex: 0,
  skippedStoreIds: [],
  entries: [
    { itemId: 'env', name: 'Envelopes', quantity, unit: 'unit', storeId: 'dollar-general', picked: false },
  ],
  removedItemIds: [],
  receipts: [],
  completedTrip: null,
});

test('a session-only quantity change is stripped by reconcile (the reported bug)', () => {
  // Stepper bumped the entry to 4, but the item is still 1 (UPDATE_QUANTITY
  // never wrote the item).
  const reconciled = reconcileShoppingSession(sessionWithEntryQuantity(4), [item(1)]);
  assert.equal(
    reconciled.entries.find((e) => e.itemId === 'env')?.quantity,
    1,
    'entry quantity is forced back to the item quantity, so the change is lost on push/apply',
  );
});

test('when the quantity change is written to the item, reconcile preserves and syncs it', () => {
  const reconciled = reconcileShoppingSession(sessionWithEntryQuantity(4), [item(4)]);
  assert.equal(
    reconciled.entries.find((e) => e.itemId === 'env')?.quantity,
    4,
    'once the item carries the new quantity, reconcile keeps it — so it survives every snapshot',
  );
});

test('dispatch propagates a mid-trip quantity change to the durable item', () => {
  const src = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  assert.match(
    src,
    /event\.type === 'UPDATE_QUANTITY'/,
    'dispatch must special-case UPDATE_QUANTITY to write the item',
  );
  assert.match(
    src,
    /durable\.updateItem\(entry\.itemId, \{ quantity: entry\.quantity \}\)/,
    'the new quantity must be written to the pantry item so it syncs via the per-item merge',
  );
  assert.match(
    src,
    /entry\.itemId !== '__quick_scan__'/,
    'the synthetic quick-scan entry must never be written back as a pantry item',
  );
});
