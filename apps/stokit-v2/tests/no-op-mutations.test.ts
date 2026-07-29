import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { changedFields, hasChangedFields } from '../core/services/changedFields';
import { reduce, type ShoppingSession } from '../core/shopping-machine/machine';

const session: ShoppingSession = {
  shopperId: 'owner',
  status: 'shopping_store',
  tripId: 'trip',
  startedAt: 1,
  storeQueue: ['store'],
  currentIndex: 0,
  skippedStoreIds: [],
  entries: [
    {
      entryId: 'item',
      pantryItemId: 'item',
      stopId: 'stop:trip:store:1',
      name: 'Milk',
      quantity: 1,
      unit: 'unit',
      storeId: 'store',
      picked: false,
    },
  ],
  removedEntryIds: [],
  receipts: [],
  completedTrip: null,
};

test('unchanged fields do not count as a durable mutation', () => {
  const current = { quantity: 1, status: 'low', storeId: 'store' };
  assert.equal(hasChangedFields(current, { quantity: 1 }), false);
  assert.deepEqual(changedFields(current, { quantity: 1, storeId: 'other' }), {
    storeId: 'other',
  });
});

test('quantity decrement at one preserves the exact shopping session object', () => {
  assert.equal(
    reduce(session, { type: 'UPDATE_QUANTITY', entryId: 'item', quantity: 0 }),
    session,
  );
});

test('quantity update for a missing item preserves the exact shopping session object', () => {
  assert.equal(
    reduce(session, { type: 'UPDATE_QUANTITY', entryId: 'missing', quantity: 2 }),
    session,
  );
});

test('every central durable mutation drops unchanged writes before persistence', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(source, /addItem:[\s\S]*?changedFields\(existing, candidate\)[\s\S]*?if \(!Object\.keys\(meaningfulPatch\)\.length\) return existing;/);
  assert.match(source, /updateItem:[\s\S]*?changedFields\(current, patch\)[\s\S]*?if \(!Object\.keys\(meaningfulPatch\)\.length\) return;/);
  assert.match(source, /setItemStatus:[\s\S]*?if \(!item \|\| item\.status === status\) return;/);
  assert.match(source, /assignItemsToStore:[\s\S]*?if \(!idSet\.size\) return;/);
  assert.match(source, /deleteItem:[\s\S]*?if \(!item\) return;/);
  assert.match(source, /updateStore:[\s\S]*?changedFields\(current, patch\)/);
  assert.match(source, /deleteStore:[\s\S]*?if \(!currentStore\) return;/);
  assert.match(source, /removeTrip:[\s\S]*?if \(!trip && !existingReceiptIds\.length\) return;/);
  assert.match(source, /closeTrip:[\s\S]*?if \(get\(\)\.closedTripIds\?\.some\(\(entry\) => entry\.id === tripId\)\) return;/);
  assert.match(source, /updateReceipt:[\s\S]*?changedFields\(current, patch\)/);
  assert.match(source, /updatePrefs:[\s\S]*?hasChangedFields\(get\(\)\.prefs, patch\)/);
  assert.match(source, /resetShoppingList:[\s\S]*?if \(!get\(\)\.items\.some\([\s\S]*?\)\) return;/);
});

test('release config does not request microphone access for photo-only receipt scanning', () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'app.json'), 'utf8'),
  ) as {
    expo: {
      android: { blockedPermissions?: string[] };
      plugins: unknown[];
    };
  };
  const camera = config.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
  ) as [string, { recordAudioAndroid?: boolean }] | undefined;
  assert.equal(camera?.[1].recordAudioAndroid, false);
  assert.ok(
    config.expo.android.blockedPermissions?.includes('android.permission.RECORD_AUDIO'),
  );
});
