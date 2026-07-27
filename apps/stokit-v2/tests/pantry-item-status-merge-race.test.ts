/**
 * Regression: a collaborator's unrelated field edit on a stale copy of a
 * pantry item could resurrect a just-purchased item back onto the shopping
 * list. Root cause: mergePantryItems used whole-object last-write-wins keyed
 * on `updatedAt` — any field edit bumps that timestamp, so an unrelated
 * quantity change racing a `status: 'stocked'` completion could win the
 * merge and drag `status`/`storeId` back to their stale pre-purchase values.
 *
 * Fix: `status`/`storeId` are now resolved independently via a dedicated
 * `statusUpdatedAt` timestamp, stamped by every intentional status/store
 * transition (see store/durable-store.ts). Confirmed via Case A/B
 * investigation that only a genuine concurrent write can cause this — pure
 * background sync with zero edits never could (and still can't).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mergePantryItems } from '../core/services/mergePantryState';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import { nextTimestamp } from '../core/services/id';
import type { DurableState, PantryItem } from '../types';

function makeState(items: PantryItem[], updatedAt: number): DurableState {
  return {
    items,
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs: {} as DurableState['prefs'],
    activeSession: null,
    updatedAt,
    deletedItems: [],
  };
}

const stale: PantryItem = {
  id: 'item_fabric_softener',
  name: 'Fabric softener',
  quantity: 1,
  unit: 'unit',
  status: 'low',
  storageLocation: 'pantry',
  storeId: 'lidl',
  expiryDate: null,
  createdAt: 1000,
  updatedAt: 5000,
  statusUpdatedAt: 5000,
};

function shopperStocksIt(now: number): PantryItem {
  return {
    ...stale,
    status: 'stocked',
    storeId: null,
    updatedAt: nextTimestamp(stale.updatedAt, now),
    statusUpdatedAt: nextTimestamp(stale.statusUpdatedAt, now),
  };
}

function collaboratorEditsQuantity(now: number): PantryItem {
  // Concurrent, unrelated edit on a copy that never learned about the
  // purchase — status/storeId/statusUpdatedAt are untouched (still stale).
  return {
    ...stale,
    quantity: 2,
    updatedAt: nextTimestamp(stale.updatedAt, now),
    // statusUpdatedAt intentionally NOT bumped — this write never touched status/storeId.
  };
}

test('[fixed] concurrent unrelated edit no longer resurrects a stocked item — push direction', () => {
  const shopper = shopperStocksIt(5010);
  const collaborator = collaboratorEditsQuantity(5015); // edit lands with a HIGHER updatedAt than the stocked write

  const remote = makeState([shopper], shopper.updatedAt);
  const local = makeState([collaborator], collaborator.updatedAt);

  const merged = mergeDurableSnapshotForPush(remote, local);
  const result = merged.items.find((i) => i.id === 'item_fabric_softener')!;

  assert.equal(result.status, 'stocked', 'status must stay stocked despite the later unrelated edit');
  assert.equal(result.storeId, null, 'storeId must stay cleared');
  assert.equal(result.quantity, 2, "the collaborator's newer quantity must still be preserved");
});

test('[fixed] concurrent unrelated edit no longer resurrects a stocked item — pull direction', () => {
  const shopper = shopperStocksIt(5010);
  const collaborator = collaboratorEditsQuantity(5015);

  // Pull direction: local = collaborator's own state, remote = incoming shopper snapshot.
  const merged = mergePantryItems([collaborator], [shopper], []);
  const result = merged.find((i) => i.id === 'item_fabric_softener')!;

  assert.equal(result.status, 'stocked');
  assert.equal(result.storeId, null);
  assert.equal(result.quantity, 2);
});

test('[fixed] symmetric: merging in the opposite array order gives the same result', () => {
  const shopper = shopperStocksIt(5010);
  const collaborator = collaboratorEditsQuantity(5015);

  const merged = mergePantryItems([shopper], [collaborator], []);
  const result = merged.find((i) => i.id === 'item_fabric_softener')!;

  assert.equal(result.status, 'stocked');
  assert.equal(result.storeId, null);
  assert.equal(result.quantity, 2);
});

test('[fixed] a collaborator edit landing BEFORE the stocked write is simply superseded (sanity, not a race)', () => {
  const collaborator = collaboratorEditsQuantity(5005);
  const shopper = shopperStocksIt(5010);

  const merged = mergePantryItems([collaborator], [shopper], []);
  const result = merged.find((i) => i.id === 'item_fabric_softener')!;

  assert.equal(result.status, 'stocked');
  assert.equal(result.storeId, null);
  // Here the shopper's write is chronologically last overall (no race), so
  // it correctly wins on every field, including quantity (still 1 — the
  // shopper's snapshot never saw the earlier quantity edit).
  assert.equal(result.quantity, 1);
});

test('[legacy] items without statusUpdatedAt on either side still merge safely via the old whole-object rule', () => {
  const legacyStale: PantryItem = { ...stale, statusUpdatedAt: undefined };
  const legacyShopperStocked: PantryItem = {
    ...legacyStale,
    status: 'stocked',
    storeId: null,
    updatedAt: nextTimestamp(legacyStale.updatedAt, 5010),
    // no statusUpdatedAt — simulates a client that hasn't shipped this field yet
  };
  const legacyCollaboratorEdit: PantryItem = {
    ...legacyStale,
    quantity: 2,
    updatedAt: nextTimestamp(legacyStale.updatedAt, 5015), // newer than the stocked write
  };

  const merged = mergePantryItems([legacyCollaboratorEdit], [legacyShopperStocked], []);
  const result = merged.find((i) => i.id === 'item_fabric_softener')!;

  // This documents the PRE-EXISTING (unfixed) legacy behavior — both sides
  // lack statusUpdatedAt, so status/storeId still follow whole-object
  // updatedAt exactly as before this change, and the newer (collaborator's)
  // record wins outright. Nothing crashes; behavior for legacy data is
  // unchanged, matching the compatibility requirement.
  assert.equal(result.status, 'low', 'legacy items with no statusUpdatedAt on either side keep the old whole-object LWW behavior');
  assert.equal(result.quantity, 2);
});

test('[legacy] a fresh statusUpdatedAt write beats a legacy item with no statusUpdatedAt at all', () => {
  const legacyStale: PantryItem = { ...stale, statusUpdatedAt: undefined };
  const legacyCollaboratorEdit: PantryItem = {
    ...legacyStale,
    quantity: 2,
    updatedAt: nextTimestamp(legacyStale.updatedAt, 5015),
    // still no statusUpdatedAt on this copy
  };
  const shopper = shopperStocksIt(5010); // has a real statusUpdatedAt stamp

  const merged = mergePantryItems([legacyCollaboratorEdit], [shopper], []);
  const result = merged.find((i) => i.id === 'item_fabric_softener')!;

  assert.equal(result.status, 'stocked', 'an explicit, tracked status stamp beats an untracked legacy status');
  assert.equal(result.storeId, null);
  assert.equal(result.quantity, 2, "the legacy side's newer quantity field is still preserved via the regular field");
});

test('[fixed] repeated merges (simulating a second sync round) do not re-drop the stocked state', () => {
  const shopper = shopperStocksIt(5010);
  const collaborator = collaboratorEditsQuantity(5015);

  const firstMerge = mergePantryItems([collaborator], [shopper], []);
  const afterFirst = firstMerge.find((i) => i.id === 'item_fabric_softener')!;
  assert.equal(afterFirst.status, 'stocked');

  // A second, later sync round pulling the same shopper snapshot again.
  const secondMerge = mergePantryItems(firstMerge, [shopper], []);
  const afterSecond = secondMerge.find((i) => i.id === 'item_fabric_softener')!;
  assert.equal(afterSecond.status, 'stocked');
  assert.equal(afterSecond.quantity, 2);
});
