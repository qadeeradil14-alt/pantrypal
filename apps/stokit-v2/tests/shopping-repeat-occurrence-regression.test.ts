import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import {
  foldRemoteActiveSession,
  mergeShoppingEntries,
} from '../core/services/shoppingEntrySync';
import type {
  DurableState,
  SharedShoppingSession,
  ShoppingEntry,
} from '../types';

const entry = (
  pantryItemId: string,
  storeId: string,
  addedAt: number,
  overrides: Partial<ShoppingEntry> = {},
): ShoppingEntry => ({
  entryId: `${pantryItemId}:${storeId}`,
  pantryItemId,
  stopId: `stop:shared-trip:${storeId}:1`,
  name: pantryItemId,
  quantity: 1,
  unit: 'unit',
  storeId,
  picked: false,
  addedAt,
  ...overrides,
});

const session = (entries: ShoppingEntry[]): SharedShoppingSession => ({
  shopperId: 'owner',
  status: 'shopping_store',
  tripId: 'shared-trip',
  startedAt: 1,
  storeQueue: ['sams', 'costco', 'target'],
  currentIndex: 1,
  skippedStoreIds: [],
  entries,
  removedEntryIds: [],
  receipts: [],
  completedTrip: null,
});

const state = (
  activeSession: SharedShoppingSession,
  updatedAt: number,
): DurableState => ({
  items: [{
    id: 'tomatoes',
    name: 'tomatoes',
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId: 'costco',
    expiryDate: null,
    createdAt: 1,
    updatedAt,
  }],
  stores: [],
  priceHistory: [],
  receipts: [],
  trips: [],
  activity: [],
  prefs: {} as DurableState['prefs'],
  activeSession,
  updatedAt,
  deletedItems: [],
  closedTripIds: [],
});

const repeats = (value: ShoppingEntry[]): ShoppingEntry[] =>
  value.filter((candidate) => candidate.pantryItemId === 'tomatoes');

test('same item across three shopping occurrences preserves all three occurrences', () => {
  const first = entry('tomatoes', 'sams', 100, {
    picked: true,
    pickedAt: 150,
  });
  const second = entry('tomatoes', 'costco', 200, {
    outOfStock: true,
    outOfStockAt: 250,
  });
  const third = entry('tomatoes', 'target', 300);
  const orders = [
    [first, second, third],
    [first, third, second],
    [second, first, third],
    [second, third, first],
    [third, first, second],
    [third, second, first],
  ];

  for (const order of orders) {
    const merged = order.reduce<ShoppingEntry[]>(
      (current, next) => mergeShoppingEntries(current, [next], []),
      [],
    );
    assert.deepEqual(repeats(merged).map((value) => value.storeId).sort(), ['costco', 'sams', 'target']);
  }
});

test('a repeat item converges without dropping a large mixed-store batch', () => {
  const localBatch = Array.from({ length: 150 }, (_, index) =>
    entry(`local-${index}`, `store-${index % 12}`, 1_000 + index),
  );
  const remoteBatch = Array.from({ length: 150 }, (_, index) =>
    entry(`remote-${index}`, `store-${index % 12}`, 2_000 + index),
  );
  const oldRepeat = entry('tomatoes', 'sams', 100, {
    picked: true,
    pickedAt: 150,
  });
  const newRepeat = entry('tomatoes', 'costco', 300);

  const merged = mergeShoppingEntries(
    [...localBatch, oldRepeat],
    [...remoteBatch, newRepeat],
    [],
  );

  assert.equal(merged.length, 302);
  assert.equal(new Set(merged.map((value) => value.entryId)).size, 302);
  assert.deepEqual(repeats(merged), [newRepeat, oldRepeat]);
});

test('owner and member converge when the member still has the prior occurrence', () => {
  const prior = entry('tomatoes', 'sams', 100, {
    picked: true,
    pickedAt: 150,
  });
  const current = entry('tomatoes', 'costco', 300);
  const owner = session([current]);
  const member = session([prior]);

  const memberAfterPull = foldRemoteActiveSession(member, owner);
  const serverAfterMemberPush = mergeDurableSnapshotForPush(
    state(owner, 1_000),
    state(memberAfterPull, 1_100),
  );
  const ownerAfterPull = foldRemoteActiveSession(
    owner,
    serverAfterMemberPush.activeSession!,
  );

  assert.equal(repeats(memberAfterPull.entries).length, 2);
  assert.equal(repeats(serverAfterMemberPush.activeSession!.entries).length, 2);
  assert.deepEqual(ownerAfterPull.entries, memberAfterPull.entries);
});

test('offline member reconnect preserves both independent occurrences', () => {
  const staleOfflineMember = session([
    entry('tomatoes', 'sams', 100, {
      picked: true,
      pickedAt: 900,
    }),
  ]);
  const cloud = session([entry('tomatoes', 'costco', 300)]);

  const reconnectPush = mergeDurableSnapshotForPush(
    state(cloud, 1_000),
    state(staleOfflineMember, 2_000),
  );
  const merged = repeats(reconnectPush.activeSession!.entries);
  assert.deepEqual(merged.map((value) => value.storeId).sort(), ['costco', 'sams']);
});

test('entryId defines occurrence; timestamps only order versions of that occurrence', () => {
  const olderOccurrenceWithLaterTap = entry('tomatoes', 'sams', 100, {
    picked: true,
    pickedAt: 9_000,
  });
  const newerOccurrence = entry('tomatoes', 'costco', 300);
  const independent = mergeShoppingEntries(
    [olderOccurrenceWithLaterTap],
    [newerOccurrence],
    [],
  );
  assert.equal(repeats(independent).length, 2);

  const earlierTap = entry('tomatoes', 'costco', 300, {
    picked: true,
    pickedAt: 400,
  });
  const laterTap = entry('tomatoes', 'costco', 300, {
    picked: false,
    pickedAt: 500,
  });
  const tapWinner = repeats(
    mergeShoppingEntries([earlierTap], [laterTap], []),
  )[0];

  assert.equal(tapWinner.addedAt, 300);
  assert.equal(tapWinner.picked, false);
  assert.equal(tapWinner.pickedAt, 500);
});
