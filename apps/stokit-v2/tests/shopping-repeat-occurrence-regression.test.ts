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
  itemId: string,
  storeId: string,
  addedAt: number,
  overrides: Partial<ShoppingEntry> = {},
): ShoppingEntry => ({
  itemId,
  name: itemId,
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
  removedItemIds: [],
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

const repeat = (value: ShoppingEntry[]): ShoppingEntry =>
  value.find((candidate) => candidate.itemId === 'tomatoes')!;

test('same item across three shopping occurrences always resolves to the third occurrence', () => {
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
    const winner = repeat(merged);
    assert.equal(winner.storeId, 'target');
    assert.equal(winner.addedAt, 300);
    assert.equal(winner.picked, false);
    assert.equal('pickedAt' in winner, false);
    assert.equal('outOfStockAt' in winner, false);
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

  assert.equal(merged.length, 301);
  assert.equal(new Set(merged.map((value) => value.itemId)).size, 301);
  assert.deepEqual(repeat(merged), newRepeat);
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

  assert.deepEqual(repeat(memberAfterPull.entries), current);
  assert.deepEqual(repeat(serverAfterMemberPush.activeSession!.entries), current);
  assert.deepEqual(ownerAfterPull.entries, memberAfterPull.entries);
});

test('offline member reconnect cannot overwrite a newer repeat occurrence', () => {
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
  const merged = repeat(reconnectPush.activeSession!.entries);

  assert.equal(merged.storeId, 'costco');
  assert.equal(merged.addedAt, 300);
  assert.equal(merged.picked, false);
  assert.equal('pickedAt' in merged, false);
});

test('addedAt alone defines occurrence; completion timestamps only order the same occurrence', () => {
  const olderOccurrenceWithLaterTap = entry('tomatoes', 'sams', 100, {
    picked: true,
    pickedAt: 9_000,
  });
  const newerOccurrence = entry('tomatoes', 'costco', 300);
  const occurrenceWinner = repeat(
    mergeShoppingEntries(
      [olderOccurrenceWithLaterTap],
      [newerOccurrence],
      [],
    ),
  );

  assert.deepEqual(occurrenceWinner, newerOccurrence);

  const earlierTap = entry('tomatoes', 'costco', 300, {
    picked: true,
    pickedAt: 400,
  });
  const laterTap = entry('tomatoes', 'costco', 300, {
    picked: false,
    pickedAt: 500,
  });
  const tapWinner = repeat(
    mergeShoppingEntries([earlierTap], [laterTap], []),
  );

  assert.equal(tapWinner.addedAt, 300);
  assert.equal(tapWinner.picked, false);
  assert.equal(tapWinner.pickedAt, 500);
});
