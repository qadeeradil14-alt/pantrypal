import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStoreEntries,
  initialSession,
  reduce,
  stopIdForQueueIndex,
} from '../core/shopping-machine';
import {
  decodeShoppingSession,
  encodeShoppingSession,
  mergeShoppingEntries,
} from '../core/services/shoppingEntrySync';
import type {
  SharedShoppingSession,
  ShoppingEntry,
  ShoppingEntryDraft,
} from '../types';

const draft = (pantryItemId: string, storeId: string): ShoppingEntryDraft => ({
  pantryItemId,
  name: pantryItemId,
  quantity: 1,
  unit: 'unit',
  storeId,
  picked: false,
});

function completedCostcoThenSafeway() {
  let session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [draft('apple', 'costco'), draft('banana', 'costco')],
    now: 100,
  });
  const costcoStopId = stopIdForQueueIndex(session, 0);
  const appleCostco = session.entries.find((entry) => entry.pantryItemId === 'apple')!;
  const bananaCostco = session.entries.find((entry) => entry.pantryItemId === 'banana')!;
  session = reduce(session, { type: 'SET_PICK', entryId: appleCostco.entryId, picked: true, now: 110 });
  session = reduce(session, { type: 'SET_PICK', entryId: bananaCostco.entryId, picked: true, now: 120 });
  session = reduce(session, { type: 'FINISH_STORE', now: 130 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 140 });
  session = reduce(session, { type: 'START_MANUAL_STORE', storeId: 'safeway' });
  return { session, costcoStopId };
}

test('a repeated pantry item creates independent Costco and Safeway occurrences', () => {
  let { session, costcoStopId } = completedCostcoThenSafeway();
  const beforeSafewayAdds = session.entries;
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'safeway'), now: 150 });
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('banana', 'safeway'), now: 160 });

  assert.equal(beforeSafewayAdds.length, 2, 'selecting Safeway alone leaves Costco untouched');
  assert.equal(session.entries.length, 4);
  assert.equal(session.entries.filter((entry) => entry.pantryItemId === 'apple').length, 2);
  assert.equal(session.entries.filter((entry) => entry.pantryItemId === 'banana').length, 2);
  assert.equal(session.entries.filter((entry) => entry.stopId === costcoStopId).every((entry) => entry.picked), true);
  assert.equal(currentStoreEntries(session).every((entry) => !entry.picked), true);
});

test('new occurrences never reuse the canonical pantry item ID', () => {
  const { session } = completedCostcoThenSafeway();

  for (const entry of session.entries) {
    assert.notEqual(entry.entryId, entry.pantryItemId);
    assert.match(entry.entryId, /^occ:/);
  }
});

test('same pantry item is idempotent within one stop but distinct across three stops', () => {
  let { session } = completedCostcoThenSafeway();
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'safeway'), now: 150 });
  const afterFirstSafewayAdd = session;
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'safeway'), now: 151 });
  assert.equal(session, afterFirstSafewayAdd);

  session = reduce(session, { type: 'FINISH_STORE', now: 160 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 170 });
  session = reduce(session, { type: 'START_MANUAL_STORE', storeId: 'target' });
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'target'), now: 180 });
  assert.equal(session.entries.filter((entry) => entry.pantryItemId === 'apple').length, 3);
});

test('revisiting the same physical store produces a distinct stable stop and occurrence', () => {
  let { session } = completedCostcoThenSafeway();
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'safeway'), now: 150 });
  session = reduce(session, { type: 'FINISH_STORE', now: 160 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 170 });
  session = reduce(session, { type: 'START_MANUAL_STORE', storeId: 'costco' });
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'costco'), now: 180 });

  const costcoOccurrences = session.entries.filter((entry) => entry.pantryItemId === 'apple' && entry.storeId === 'costco');
  assert.equal(costcoOccurrences.length, 2);
  assert.notEqual(costcoOccurrences[0].stopId, costcoOccurrences[1].stopId);
  assert.notEqual(costcoOccurrences[0].entryId, costcoOccurrences[1].entryId);
  assert.equal(currentStoreEntries(session).length, 1);
  assert.equal(currentStoreEntries(session)[0].picked, false);
});

test('toggle, quantity, out-of-stock, and removal target one occurrence only', () => {
  let { session } = completedCostcoThenSafeway();
  session = reduce(session, { type: 'ADD_ENTRY', entry: draft('apple', 'safeway'), now: 150 });
  const [costco, safeway] = session.entries.filter((entry) => entry.pantryItemId === 'apple');

  session = reduce(session, { type: 'SET_PICK', entryId: safeway.entryId, picked: true, now: 160 });
  session = reduce(session, { type: 'UPDATE_QUANTITY', entryId: safeway.entryId, quantity: 3 });
  session = reduce(session, { type: 'MARK_OUT_OF_STOCK', entryId: safeway.entryId, now: 170 });

  assert.equal(session.entries.find((entry) => entry.entryId === costco.entryId)?.picked, true);
  assert.equal(session.entries.find((entry) => entry.entryId === costco.entryId)?.quantity, 1);
  assert.equal(session.entries.find((entry) => entry.entryId === safeway.entryId)?.outOfStock, true);

  session = reduce(session, { type: 'REMOVE_ENTRY', entryId: safeway.entryId, now: 180 });
  assert.equal(session.entries.some((entry) => entry.entryId === costco.entryId), true);
  assert.equal(session.entries.some((entry) => entry.entryId === safeway.entryId), false);
  assert.deepEqual(session.removedEntryIds, [safeway.entryId]);
});

test('merge preserves sibling occurrences and merges only matching entryId', () => {
  const costco: ShoppingEntry = {
    entryId: 'legacy-apple',
    pantryItemId: 'apple',
    stopId: 'stop:trip:costco:1',
    name: 'Apple',
    quantity: 1,
    unit: 'unit',
    storeId: 'costco',
    picked: true,
    pickedAt: 110,
    addedAt: 100,
  };
  const safeway: ShoppingEntry = {
    entryId: 'occ:trip:stop-safeway:apple',
    pantryItemId: 'apple',
    stopId: 'stop:trip:safeway:1',
    name: 'Apple',
    quantity: 1,
    unit: 'unit',
    storeId: 'safeway',
    picked: false,
    addedAt: 150,
  };
  const safewayUpdated = { ...safeway, picked: true, pickedAt: 170 };
  const merged = mergeShoppingEntries([costco, safeway], [safewayUpdated], []);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((entry) => entry.entryId === costco.entryId)?.picked, true);
  assert.equal(merged.find((entry) => entry.entryId === safeway.entryId)?.picked, true);
});

test('legacy decode is deterministic and wire encoding preserves the RLS-compatible legacy shape', () => {
  const legacy = {
    shopperId: 'owner',
    status: 'shopping_store',
    tripId: 'trip',
    startedAt: 1,
    storeQueue: ['costco'],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: [{
      itemId: 'apple',
      name: 'Apple',
      quantity: 1,
      unit: 'unit',
      storeId: 'costco',
      picked: false,
      addedAt: 100,
    }],
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  } as unknown as SharedShoppingSession;

  const first = decodeShoppingSession(legacy);
  const second = decodeShoppingSession(legacy);
  assert.deepEqual(first, second);
  assert.equal(first.entries[0].entryId, 'apple');
  assert.equal(first.entries[0].pantryItemId, 'apple');
  assert.equal(first.entries[0].stopId, 'stop:trip:costco:1');

  const encoded = encodeShoppingSession(first) as unknown as {
    entries: Array<{ itemId: string; pantryItemId?: string; entryId?: string; stopId?: string }>;
  };
  assert.equal(encoded.entries[0].itemId, first.entries[0].entryId);
  assert.equal(encoded.entries[0].pantryItemId, undefined);
  assert.equal(encoded.entries[0].entryId, undefined);
  assert.equal(encoded.entries[0].stopId, undefined);
  assert.deepEqual(decodeShoppingSession(encoded as unknown as SharedShoppingSession), first);
});

test('new sibling wire rows carry stable occurrence and pantry identities', () => {
  const { session: base } = completedCostcoThenSafeway();
  const session = reduce(base, {
    type: 'ADD_ENTRY',
    entry: draft('apple', 'safeway'),
    now: 150,
  });
  const sibling = session.entries.find((entry) => entry.storeId === 'safeway')!;
  const encoded = encodeShoppingSession(session) as unknown as {
    entries: Array<{
      itemId: string;
      entryId?: string;
      pantryItemId?: string;
      stopId?: string;
    }>;
  };
  const wireSibling = encoded.entries.find((entry) => entry.itemId === sibling.entryId)!;

  assert.equal(wireSibling.entryId, sibling.entryId);
  assert.equal(wireSibling.pantryItemId, 'apple');
  assert.equal(wireSibling.stopId, sibling.stopId);
  assert.deepEqual(decodeShoppingSession(encoded as unknown as SharedShoppingSession), session);
});

test('repeat occurrence is an RLS-safe new row instead of a rewrite of the completed row', () => {
  let { session } = completedCostcoThenSafeway();
  const completed = session.entries.find((entry) => entry.pantryItemId === 'apple')!;
  session = reduce(session, {
    type: 'ADD_ENTRY',
    entry: draft('apple', 'safeway'),
    now: 150,
  });
  const next = session.entries.find((entry) => entry.storeId === 'safeway')!;
  const encoded = encodeShoppingSession(session) as unknown as {
    entries: Array<Record<string, unknown>>;
  };
  const completedWire = encoded.entries.find((entry) => entry.itemId === completed.entryId)!;
  const nextWire = encoded.entries.find((entry) => entry.itemId === next.entryId)!;

  assert.notEqual(completedWire.itemId, nextWire.itemId);
  assert.equal(completedWire.picked, true);
  assert.equal(nextWire.picked, false);
  assert.equal('pickedAt' in nextWire, false);
  assert.equal('outOfStockAt' in nextWire, false);
});

test('multiple occurrences keep identical IDs through persistence and restart', () => {
  let { session } = completedCostcoThenSafeway();
  session = reduce(session, {
    type: 'ADD_ENTRY',
    entry: draft('apple', 'safeway'),
    now: 150,
  });
  const persisted = JSON.stringify(encodeShoppingSession(session));
  const firstRestart = decodeShoppingSession(JSON.parse(persisted) as SharedShoppingSession);
  const secondRestart = decodeShoppingSession(
    JSON.parse(JSON.stringify(encodeShoppingSession(firstRestart))) as SharedShoppingSession,
  );

  assert.deepEqual(
    secondRestart.entries.map((entry) => entry.entryId).sort(),
    session.entries.map((entry) => entry.entryId).sort(),
  );
  assert.equal(secondRestart.entries.filter((entry) => entry.pantryItemId === 'apple').length, 2);
});

test('mixed legacy and new snapshots preserve sibling occurrences', () => {
  const legacy = decodeShoppingSession({
    shopperId: 'owner',
    status: 'shopping_store',
    tripId: 'trip',
    startedAt: 1,
    storeQueue: ['costco', 'safeway'],
    currentIndex: 1,
    skippedStoreIds: [],
    entries: [{
      itemId: 'apple',
      name: 'Apple',
      quantity: 1,
      unit: 'unit',
      storeId: 'costco',
      picked: true,
      pickedAt: 100,
      addedAt: 50,
    }],
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  } as unknown as SharedShoppingSession);
  const sibling: ShoppingEntry = {
    entryId: 'occ:trip:stop:trip:safeway:1:apple',
    pantryItemId: 'apple',
    stopId: 'stop:trip:safeway:1',
    name: 'Apple',
    quantity: 1,
    unit: 'unit',
    storeId: 'safeway',
    picked: false,
    addedAt: 150,
  };
  const merged = mergeShoppingEntries(legacy.entries, [sibling], []);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((entry) => entry.entryId), ['apple', sibling.entryId]);
});

test('inventory and price-history writes use pantryItemId, not entryId', () => {
  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const shopping = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(durable, /\.map\(\(entry\) => entry\.pantryItemId\)/);
  assert.match(shopping, /itemId: priceEntry\.pantryItemId/);
});

test('member removal tombstones the occurrence without deleting its canonical pantry item', () => {
  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const sessionStore = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.match(durable, /tombstoneShoppingOccurrence: \(entryId: string\) => void/);
  assert.match(sessionStore, /durable\.tombstoneShoppingOccurrence\(removedEntry\.entryId\)/);
  assert.match(sessionStore, /removedEntry\.entryId === removedEntry\.pantryItemId/);
});

test('occurrence diagnostics are gated and include reducer and merge identity decisions', () => {
  const sessionStore = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  const sync = readFileSync(join(process.cwd(), 'core/services/shoppingEntrySync.ts'), 'utf8');

  assert.match(sessionStore, /syncDiag\('shopping_occurrence_reduce'/);
  assert.match(sessionStore, /sessionId: next\.tripId/);
  assert.match(sessionStore, /storeName:/);
  assert.match(sync, /syncDiag\('shopping_occurrence_merge'/);
  assert.match(sync, /reason: 'same_entry_id'/);
});
