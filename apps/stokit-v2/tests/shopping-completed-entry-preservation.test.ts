import assert from 'node:assert/strict';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import { shoppingEntryEventForItem } from '../core/services/shoppingEntrySync';
import type { PantryItem } from '../types';

// End-to-end regression for the OTA 461 fix: an item picked and receipted at
// an early stop must survive the rest of a multi-store trip even when an
// unrelated pantry edit fires mid-trip, and must appear correctly in the
// final trip's purchasedItems / itemsBought / receipts.
//
// This drives the real reducer sequence (START_TRIP -> pick -> FINISH_STORE
// -> SAVE_RECEIPT -> CONTINUE_TRIP -> CHOOSE_NEXT_STORE -> ... -> FINISH_TRIP)
// and manually applies the same "flip to stocked" side effect that
// store/durable-store.ts's clearShoppingEntries performs the instant a store
// is finished — so the fallback-lookup window this bug lived in is actually
// exercised, not just asserted about in isolation.

function item(id: string, name: string, storeId: string | null): PantryItem {
  return {
    id,
    name,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function start(items: PantryItem[], now = 1000): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now,
    shopperId: 'owner',
    entries: items.map((i) => ({
      pantryItemId: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      storeId: i.storeId!,
      picked: false,
    })),
  });
}

function pick(session: ShoppingSession, pantryItemId: string, now: number): ShoppingSession {
  const entryId = session.entries.find((e) => e.pantryItemId === pantryItemId)!.entryId;
  return reduce(session, { type: 'TOGGLE_PICK', entryId, now });
}

function finishStoreWithReceipt(session: ShoppingSession, amount: number, now: number): ShoppingSession {
  return reduce(reduce(session, { type: 'FINISH_STORE', now }), {
    type: 'SAVE_RECEIPT', amount, status: 'logged', now,
  });
}

/** Mirrors store/durable-store.ts's clearShoppingEntries: the instant a stop
 * finishes, its picked items flip to 'stocked' with storeId null. */
function applyClearShoppingEntriesSideEffect(
  items: PantryItem[],
  session: ShoppingSession,
  finishedStopId: string,
): PantryItem[] {
  const pickedAtStop = new Set(
    session.entries.filter((e) => e.stopId === finishedStopId && e.picked).map((e) => e.pantryItemId),
  );
  return items.map((candidate) =>
    pickedAtStop.has(candidate.id)
      ? { ...candidate, status: 'stocked', storeId: null, updatedAt: candidate.updatedAt + 1 }
      : candidate,
  );
}

/** Mirrors store/durable-store.ts's syncShoppingItem for an unrelated edit. */
function applyUnrelatedEdit(session: ShoppingSession, editedItem: PantryItem): ShoppingSession {
  const event = shoppingEntryEventForItem(session, editedItem, editedItem.id);
  return event ? reduce(session, event) : session;
}

test('a picked item from a completed stop survives an unrelated edit during a later stop and is finalized correctly', () => {
  const tortillas = item('tortillas', 'Tortillas', 'store1');
  const bread = item('bread', 'Bread', 'store2');
  const eggs = item('eggs', 'Eggs', 'store3');
  let items = [tortillas, bread, eggs];

  let session = start(items, 1000);
  const stop1Id = session.entries.find((e) => e.pantryItemId === 'tortillas')!.stopId;

  // Store 1: pick Tortillas, finish the stop, log the receipt.
  session = pick(session, 'tortillas', 1010);
  session = finishStoreWithReceipt(session, 12.5, 1020);
  items = applyClearShoppingEntriesSideEffect(items, session, stop1Id);
  assert.equal(items.find((i) => i.id === 'tortillas')?.status, 'stocked');

  // Move to store 2.
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'store2' });
  assert.equal(session.storeQueue[session.currentIndex], 'store2');

  // Unrelated pantry edit fires mid-store-2 for Tortillas (already stocked,
  // already off the shopping list) — e.g. the user tweaks its quantity, or
  // a background sync touches the record.
  const tortillasBefore = items.find((i) => i.id === 'tortillas')!;
  session = applyUnrelatedEdit(session, { ...tortillasBefore, quantity: 3 });

  // The completed stop-1 entry must still be present and still picked.
  const stop1Entry = session.entries.find((e) => e.pantryItemId === 'tortillas');
  assert.ok(stop1Entry, 'Tortillas entry must still exist after the unrelated edit');
  assert.equal(stop1Entry?.picked, true);
  assert.equal(session.removedEntryIds.includes(stop1Entry!.entryId), false);

  // Pick and finish store 2.
  session = pick(session, 'bread', 1030);
  session = finishStoreWithReceipt(session, 8, 1040);
  items = applyClearShoppingEntriesSideEffect(items, session, 'stop:trip-1:store2:1');

  // Move to store 3, pick and finish it.
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'store3' });
  session = pick(session, 'eggs', 1050);
  session = finishStoreWithReceipt(session, 4, 1060);

  // Finish the whole trip.
  session = reduce(session, { type: 'FINISH_TRIP', now: 1070 });
  const trip = session.completedTrip;
  assert.ok(trip, 'trip must finalize');

  assert.equal(trip!.itemsBought, 3, 'all three picked items must be counted');
  assert.deepEqual(
    trip!.purchasedItems.map((p) => p.itemId).sort(),
    ['bread', 'eggs', 'tortillas'],
    'Tortillas must remain in purchasedItems despite the unrelated mid-trip edit',
  );
  assert.equal(trip!.receiptIds.length, 3, 'all three receipts must be present');
  assert.equal(trip!.itemsRemaining, 0);

  const tortillasEntry = session.entries.find((e) => e.pantryItemId === 'tortillas');
  assert.equal(tortillasEntry?.picked, true, 'Tortillas stays picked through trip completion');
});

test('a three-store trip with one item completed early does not leave that item low/unassigned afterward', () => {
  const tortillas = item('tortillas', 'Tortillas', 'store1');
  const bread = item('bread', 'Bread', 'store2');
  const eggs = item('eggs', 'Eggs', 'store3');
  let items = [tortillas, bread, eggs];

  let session = start(items, 2000);
  const stop1Id = session.entries.find((e) => e.pantryItemId === 'tortillas')!.stopId;

  session = pick(session, 'tortillas', 2010);
  session = finishStoreWithReceipt(session, 12.5, 2020);
  items = applyClearShoppingEntriesSideEffect(items, session, stop1Id);

  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'store2' });

  // Sync-activity churn mid-trip: several unrelated edits fire in a row.
  for (const patch of [{ quantity: 2 }, { quantity: 5 }, { storageLocation: 'fridge' as const }]) {
    const current = items.find((i) => i.id === 'tortillas')!;
    session = applyUnrelatedEdit(session, { ...current, ...patch });
  }

  session = pick(session, 'bread', 2030);
  session = finishStoreWithReceipt(session, 8, 2040);
  items = applyClearShoppingEntriesSideEffect(items, session, 'stop:trip-1:store2:1');

  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'store3' });
  session = pick(session, 'eggs', 2050);
  session = finishStoreWithReceipt(session, 4, 2060);
  items = applyClearShoppingEntriesSideEffect(items, session, 'stop:trip-1:store3:1');

  session = reduce(session, { type: 'FINISH_TRIP', now: 2070 });

  assert.deepEqual(
    session.completedTrip!.purchasedItems.map((p) => p.itemId).sort(),
    ['bread', 'eggs', 'tortillas'],
  );
  const tortillasFinal = items.find((i) => i.id === 'tortillas')!;
  assert.equal(tortillasFinal.status, 'stocked', 'Tortillas must not revert to low/unassigned');
  assert.equal(tortillasFinal.storeId, null);
});
