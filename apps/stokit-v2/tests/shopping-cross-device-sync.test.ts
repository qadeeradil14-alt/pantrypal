import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { initialSession, reduce } from '../core/shopping-machine';
import { remoteShoppingSessionAction } from '../core/services/shoppingSessionSyncPolicy';
import type { ShoppingEntry } from '../types';

const tappedEntry: ShoppingEntry = {
  itemId: 'banana',
  name: 'Banana',
  quantity: 1,
  unit: 'unit',
  storeId: 'store-a',
  picked: false,
};

test('remote completed trip clears an active local shopping session', () => {
  assert.equal(remoteShoppingSessionAction(null), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'idle' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'trip_summary' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'shopping_store' }), 'apply');
});

test('remote trip end cannot leave persisted state to resurrect after restart', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.doesNotMatch(source, /remoteEnded\s*&&\s*ACTIVE_STATUSES/);
  assert.match(source, /const remoteAction = remoteShoppingSessionAction\(normalized,/);
  assert.match(source, /if \(remoteAction === 'clear'\)/);
  assert.match(source, /REMOTE_IGNORE_STALE_CLEAR/);
  assert.match(source, /set\(\{ session: initialSession \}\)/);
  assert.match(source, /AsyncStorage\.removeItem\(SESSION_KEY\)/);
});

test('shopping focus recovers a missed remote trip without racing the Start Shopping CTA', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /useFocusEffect/);
  assert.match(source, /runObservedOperation\('shopping\.focus\.sync', pullFromSupabase\)/);
  assert.doesNotMatch(source, /await pullFromSupabase\(\)/);
});

test('tapping an active-trip item edits only that item and stale remote idle cannot reset the trip', () => {
  const before = reduce(initialSession, { type: 'START_TRIP', entries: [tappedEntry], now: 100 });
  const afterTap = reduce(before, { type: 'TOGGLE_PICK', itemId: tappedEntry.itemId });
  const staleRemoteAction = remoteShoppingSessionAction(null, {
    activeTripId: before.tripId,
    activeSessionStamp: { clock: 20, replicaId: 'iphone' },
    sessionTombstones: {
      [before.tripId!]: { clock: 19, replicaId: 'ipad' },
      'older-trip': { clock: 30, replicaId: 'ipad' },
    },
  });

  assert.equal(afterTap.status, 'shopping_store');
  assert.equal(afterTap.tripId, before.tripId);
  assert.equal(afterTap.entries[0].picked, true);
  assert.equal(staleRemoteAction, 'ignore');
});

test('same-trip tombstone still authorizes an explicit remote trip clear', () => {
  assert.equal(remoteShoppingSessionAction(null, {
    activeTripId: 'trip-1',
    activeSessionStamp: { clock: 20, replicaId: 'iphone' },
    sessionTombstones: { 'trip-1': { clock: 21, replicaId: 'ipad' } },
  }), 'clear');
});

test('shopping item rows contain no trip-start or reset action', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  const plannerRow = source.slice(source.indexOf('{/* Assigned items'), source.indexOf('{shoppableCount > 0 &&'));
  const activeRow = source.slice(source.indexOf('style={({ pressed }) => [styles.pickRow'), source.indexOf('onLongPress', source.indexOf('style={({ pressed }) => [styles.pickRow')));

  assert.match(plannerRow, /setReassignItem\(full\)/);
  assert.match(activeRow, /TOGGLE_PICK/);
  assert.doesNotMatch(`${plannerRow}\n${activeRow}`, /START_TRIP|handleStartShopping|resetShopping/);
});
