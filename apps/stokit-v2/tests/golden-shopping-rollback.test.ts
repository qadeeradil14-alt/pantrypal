import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialSession, reduce } from '../core/shopping-machine';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
  syncStateDigest,
} from '../core/services/replicaSync';
import { createRemoteShoppingSessionProjection } from '../core/services/shoppingSessionSyncPolicy';
import type { DurableState, PantryItem, SharedShoppingSession, ShoppingEntry } from '../types';

function emptyState(): DurableState {
  return {
    items: [], stores: [], priceHistory: [], receipts: [], trips: [], activity: [],
    prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 200 },
    activeSession: null, updatedAt: 0,
  };
}

function item(id: string, storeId: string): PantryItem {
  return {
    id, name: id, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
    storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
  };
}

function entry(id: string, storeId: string): ShoppingEntry {
  return { itemId: id, name: id, quantity: 1, unit: 'unit', storeId, picked: false };
}

function activeSession(tripId = 'trip-golden'): SharedShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    entries: [entry('milk', 'store-a'), entry('bread', 'store-b')],
    now: Number(tripId.replace(/\D/g, '')) || 100,
  });
}

test('Choose first store CTA starts directly without a remote preflight race', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /const handleStartShopping = \(\) => \{/);
  assert.doesNotMatch(source, /const handleStartShopping = async \(\) => \{[\s\S]*?await pullFromSupabase\(\)/);
  assert.match(source, /startTripAt\(entries\[0\]\[0\]\)/);
  assert.match(source, /startTripAt\(storeId\)/);
});

test('selected store and active trip persist through canonical serialization', () => {
  const session = activeSession('trip-100');
  const started = initializeReplicaState({ ...emptyState(), activeSession: session }, 'iphone');
  const reopened = JSON.parse(JSON.stringify(started)) as DurableState;
  const restored = mergeReplicaStates([reopened], 'iphone');

  assert.equal(restored.activeSession?.tripId, session.tripId);
  assert.equal(restored.activeSession?.storeQueue[0], 'store-a');
  assert.equal(restored.activeSession?.status, 'shopping_store');
});

test('choose store then select items cannot be cleared by an older queued remote projection', () => {
  const projection = createRemoteShoppingSessionProjection<SharedShoppingSession | null>();
  const staleClear = projection.issue();
  const started = activeSession('trip-150');
  const selected = reduce(started as ReturnType<typeof reduce>, {
    type: 'SET_PICK',
    itemId: 'milk',
    picked: true,
  });
  const projectedAfterLocalSelection = projection.resolve(staleClear, selected);

  assert.equal(projectedAfterLocalSelection?.status, 'shopping_store');
  assert.equal(projectedAfterLocalSelection?.tripId, started.tripId);
  assert.equal(projectedAfterLocalSelection?.storeQueue[0], 'store-a');
  assert.equal(projectedAfterLocalSelection?.entries.find((value) => value.itemId === 'milk')?.picked, true);

  const canonicalApply = projection.issue();
  assert.equal(projection.resolve(staleClear, null), undefined);
  const projected = projection.resolve(canonicalApply, selected);
  assert.equal(projected?.status, 'shopping_store');
  assert.equal(projected?.tripId, started.tripId);
  assert.equal(projected?.storeQueue[0], 'store-a');
  assert.equal(projected?.entries.find((value) => value.itemId === 'milk')?.picked, true);
});

test('remote same-trip reconciliation cannot make an item disappear', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.match(source, /previous\.tripId === normalized\.tripId/);
  assert.match(source, /mergeShoppingEntries\(previous\.entries, normalized\.entries, removedItemIds\)/);
});

test('trip start never notifies the household without explicit Notify Family', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.equal(source.match(/sendShoppingAlertOnce\(/g)?.length, 1);
  assert.doesNotMatch(source, /startTripAt\([^\n]+, true\)/);
  assert.doesNotMatch(source, /notifyHousehold:\s*notifyHousehold/);
});

test('force-close and reopen restores the current canonical active trip', () => {
  const durableSource = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const session = activeSession('trip-200');
  const canonical = initializeReplicaState({
    ...emptyState(),
    items: [item('milk', 'store-a'), item('bread', 'store-b')],
    activeSession: session,
    updatedAt: 200,
  }, 'iphone');
  const reopened = JSON.parse(JSON.stringify(canonical)) as DurableState;

  const restored = mergeReplicaStates([reopened], 'iphone-reopen');

  assert.equal(restored.activeSession?.tripId, session.tripId);
  assert.deepEqual(restored.activeSession?.entries.map((value) => value.itemId).sort(), ['bread', 'milk']);
  assert.match(durableSource, /await runObservedOperation\('storage\.normalize'/);
  assert.match(durableSource, /persistQueue = persistQueue[\s\S]*storage\.remotePatch/);
  assert.doesNotMatch(durableSource, /void runObservedOperation\('storage\.remotePatch'/);
});

test('two devices converge active-trip quantity and checked state without item loss', () => {
  const seed = initializeReplicaState({ ...emptyState(), activeSession: activeSession('trip-300') }, 'seed');
  const iphoneBase = mergeReplicaStates([seed], 'iphone');
  const ipadBase = mergeReplicaStates([seed], 'ipad');
  const iphone = recordLocalMutation(iphoneBase, {
    ...iphoneBase,
    activeSession: {
      ...iphoneBase.activeSession!,
      entries: iphoneBase.activeSession!.entries.map((value) => value.itemId === 'milk' ? { ...value, picked: true } : value),
    },
  }, 'iphone', 'shopping.pick');
  const ipad = recordLocalMutation(ipadBase, {
    ...ipadBase,
    activeSession: {
      ...ipadBase.activeSession!,
      entries: ipadBase.activeSession!.entries.map((value) => value.itemId === 'bread' ? { ...value, quantity: 3 } : value),
    },
  }, 'ipad', 'shopping.quantity');

  const a = mergeReplicaStates([iphone, ipad], 'observer-a');
  const b = mergeReplicaStates([ipad, iphone], 'observer-b');

  assert.equal(syncStateDigest(a), syncStateDigest(b));
  assert.equal(a.activeSession?.entries.length, 2);
  assert.equal(a.activeSession?.entries.find((value) => value.itemId === 'milk')?.picked, true);
  assert.equal(a.activeSession?.entries.find((value) => value.itemId === 'bread')?.quantity, 3);
});

test('offline reconnect keeps the valid trip and ignores malformed session data without creating a quarantine tombstone', () => {
  const valid = initializeReplicaState({ ...emptyState(), activeSession: activeSession('trip-400') }, 'offline');
  const malformed = {
    ...initializeReplicaState(emptyState(), 'online'),
    activeSession: { ...activeSession('trip-400'), storeQueue: [] },
  } as DurableState;

  const merged = mergeReplicaStates([malformed, valid], 'reconnected');

  assert.equal(merged.activeSession?.tripId, valid.activeSession?.tripId);
  assert.equal(merged.activeSession?.entries.length, 2);
  assert.equal(merged.syncMeta?.sessionTombstones?.[valid.activeSession!.tripId!], undefined);
});
