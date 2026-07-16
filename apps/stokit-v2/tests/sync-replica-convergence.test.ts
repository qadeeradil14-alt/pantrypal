import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
  syncStateDigest,
} from '../core/services/replicaSync';
import type { DurableState, PantryItem, SharedShoppingSession } from '../types';

function emptyState(): DurableState {
  return {
    items: [],
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs: {
      householdName: 'Home',
      defaultUnit: 'unit',
      expiringWindowDays: 3,
      weeklyBudget: 200,
    },
    activeSession: null,
    updatedAt: 0,
  };
}

function item(index: number): PantryItem {
  return {
    id: `item-${index}`,
    name: `Item ${index}`,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId: 'store-1',
    expiryDate: null,
    createdAt: index + 1,
    updatedAt: index + 1,
  };
}

function addItemsRapidly(state: DurableState, replicaId: string, count: number): DurableState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    const next = { ...current, items: [item(index), ...current.items], updatedAt: index + 1 };
    current = recordLocalMutation(current, next, replicaId, 'item.create');
  }
  return current;
}

function shoppingSession(count: number, tripId = 'trip-1'): SharedShoppingSession {
  return {
    status: 'shopping_store',
    tripId,
    startedAt: 1,
    storeQueue: ['store-1'],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: Array.from({ length: count }, (_, index) => ({
      itemId: `item-${index}`,
      name: `Item ${index}`,
      quantity: 1,
      unit: 'unit' as const,
      storeId: 'store-1',
      picked: false,
    })),
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  };
}

test('100 rapid item creates converge without missing or duplicate items', () => {
  const owner = addItemsRapidly(initializeReplicaState(emptyState(), 'owner-device'), 'owner-device', 100);
  const member = initializeReplicaState(emptyState(), 'member-device');
  const merged = mergeReplicaStates([member, owner], 'member-device');

  assert.equal(merged.items.length, 100);
  assert.equal(new Set(merged.items.map((entry) => entry.id)).size, 100);
  assert.deepEqual(new Set(merged.items.map((entry) => entry.id)), new Set(owner.items.map((entry) => entry.id)));
});

test('simultaneous edits, deletes, and creates converge independent of merge order', () => {
  const seeded = addItemsRapidly(initializeReplicaState(emptyState(), 'seed-device'), 'seed-device', 100);
  let owner = mergeReplicaStates([seeded], 'owner-device');
  let member = mergeReplicaStates([seeded], 'member-device');

  const ownerNext = {
    ...owner,
    items: owner.items
      .filter((entry) => Number(entry.id.split('-')[1]) % 4 !== 0)
      .map((entry) => Number(entry.id.split('-')[1]) % 4 === 1
        ? { ...entry, quantity: entry.quantity + 2, updatedAt: 200 }
        : entry),
    updatedAt: 200,
  };
  owner = recordLocalMutation(owner, ownerNext, 'owner-device', 'stress.owner');

  const memberNext = {
    ...member,
    items: [
      item(100),
      ...member.items.map((entry) => Number(entry.id.split('-')[1]) % 4 === 2
        ? { ...entry, storeId: 'store-2', updatedAt: 201 }
        : entry),
    ],
    updatedAt: 201,
  };
  member = recordLocalMutation(member, memberNext, 'member-device', 'stress.member');

  const ownerFirst = mergeReplicaStates([owner, member], 'device-a');
  const memberFirst = mergeReplicaStates([member, owner], 'device-b');
  assert.equal(syncStateDigest(ownerFirst), syncStateDigest(memberFirst));
  assert.equal(new Set(ownerFirst.items.map((entry) => entry.id)).size, ownerFirst.items.length);
  for (let index = 0; index < 100; index += 4) {
    assert.equal(ownerFirst.items.some((entry) => entry.id === `item-${index}`), false);
  }
  assert.ok(ownerFirst.items.some((entry) => entry.id === 'item-100'));
  assert.equal(syncStateDigest(ownerFirst), syncStateDigest(mergeReplicaStates([ownerFirst, owner, member], 'device-c')));
});

test('concurrent shopping entry changes merge per item and rapid uncheck wins locally', () => {
  const seeded = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(10) }, 'seed-device');
  let owner = mergeReplicaStates([seeded], 'owner-device');
  let member = mergeReplicaStates([seeded], 'member-device');

  owner = recordLocalMutation(owner, {
    ...owner,
    activeSession: {
      ...owner.activeSession!,
      entries: owner.activeSession!.entries.map((entry) => entry.itemId === 'item-0' ? { ...entry, picked: true } : entry),
    },
  }, 'owner-device', 'shopping.pick');
  member = recordLocalMutation(member, {
    ...member,
    activeSession: {
      ...member.activeSession!,
      entries: member.activeSession!.entries.map((entry) => entry.itemId === 'item-1' ? { ...entry, quantity: 4 } : entry),
    },
  }, 'member-device', 'shopping.quantity');

  let merged = mergeReplicaStates([owner, member], 'observer-device');
  assert.equal(merged.activeSession?.entries.find((entry) => entry.itemId === 'item-0')?.picked, true);
  assert.equal(merged.activeSession?.entries.find((entry) => entry.itemId === 'item-1')?.quantity, 4);

  const unchecked = recordLocalMutation(merged, {
    ...merged,
    activeSession: {
      ...merged.activeSession!,
      entries: merged.activeSession!.entries.map((entry) => entry.itemId === 'item-0' ? { ...entry, picked: false } : entry),
    },
  }, 'observer-device', 'shopping.uncheck');
  merged = mergeReplicaStates([owner, member, unchecked], 'owner-device');
  assert.equal(merged.activeSession?.entries.find((entry) => entry.itemId === 'item-0')?.picked, false);
});

test('shopping reset converges without resurrecting a stale active store', () => {
  const seeded = initializeReplicaState({
    ...emptyState(),
    items: [item(0)],
    activeSession: shoppingSession(1),
  }, 'seed-device');
  const stale = mergeReplicaStates([seeded], 'stale-device');
  const resetBase = mergeReplicaStates([seeded], 'reset-device');
  const reset = recordLocalMutation(resetBase, {
    ...resetBase,
    items: resetBase.items.map((entry) => ({ ...entry, status: 'stocked', storeId: null })),
    activeSession: null,
  }, 'reset-device', 'shopping.reset');

  const merged = mergeReplicaStates([stale, reset], 'observer-device');

  assert.equal(merged.activeSession, null);
  assert.equal(merged.items[0].status, 'stocked');
  assert.equal(merged.items[0].storeId, null);
});

test('malformed trip A does not destroy a valid concurrent trip B', () => {
  const tripA = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-a') }, 'device-a');
  const corruptedA = {
    ...tripA,
    activeSession: { ...tripA.activeSession!, storeQueue: [] },
  };
  const tripB = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-b') }, 'device-b');

  const aFirst = mergeReplicaStates([corruptedA, tripB], 'observer-a');
  const bFirst = mergeReplicaStates([tripB, corruptedA], 'observer-b');

  assert.equal(aFirst.activeSession?.tripId, 'trip-b');
  assert.equal(bFirst.activeSession?.tripId, 'trip-b');
  assert.equal(syncStateDigest(aFirst), syncStateDigest(bFirst));
  assert.ok(aFirst.syncMeta?.sessionTombstones?.['trip-a']);
  assert.equal(aFirst.syncMeta?.sessionTombstones?.['trip-b'], undefined);
});

test('malformed local active session quarantines its valid remote twin with the same trip id', () => {
  const remote = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-a') }, 'device-1');
  const corrupted = {
    ...remote,
    activeSession: { ...remote.activeSession!, storeQueue: [] },
  };

  const merged = mergeReplicaStates([corrupted, remote], 'device-1');

  assert.equal(merged.activeSession, null);
  assert.ok(merged.syncMeta?.sessionTombstones?.['trip-a']);
});

test('force-close and reopen preserves a valid session outside the quarantined trip lineage', () => {
  const tripA = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-a') }, 'device-a');
  const quarantinedA = initializeReplicaState({
    ...tripA,
    activeSession: { ...tripA.activeSession!, storeQueue: [] },
  }, 'device-a');
  const tripB = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-b') }, 'device-b');
  const reopenedA = JSON.parse(JSON.stringify(quarantinedA)) as DurableState;
  const reopenedB = JSON.parse(JSON.stringify(tripB)) as DurableState;

  const merged = mergeReplicaStates([reopenedA, reopenedB], 'reopened-device');

  assert.equal(merged.activeSession?.tripId, 'trip-b');
});

test('realtime merge preserves a valid session from a different trip lineage', () => {
  const tripA = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-a') }, 'device-a');
  const realtimeMalformedA = {
    ...tripA,
    activeSession: { ...tripA.activeSession!, storeQueue: [] },
  };
  const localTripB = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-b') }, 'device-b');

  const firstRealtimePull = mergeReplicaStates([localTripB, realtimeMalformedA], 'device-b');
  const echoedRealtimePull = mergeReplicaStates([firstRealtimePull, realtimeMalformedA], 'device-b');

  assert.equal(firstRealtimePull.activeSession?.tripId, 'trip-b');
  assert.equal(echoedRealtimePull.activeSession?.tripId, 'trip-b');
});

test('offline reconnect preserves a valid session outside the quarantined trip lineage', () => {
  const tripA = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-a') }, 'online-device');
  const onlineMalformedA = {
    ...tripA,
    activeSession: { ...tripA.activeSession!, status: 'shopping_store' as const, tripId: 'trip-a', storeQueue: [] },
  };
  const offlineTripB = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1, 'trip-b') }, 'offline-device');

  const onlineFirst = mergeReplicaStates([onlineMalformedA, offlineTripB], 'online-device');
  const offlineFirst = mergeReplicaStates([offlineTripB, onlineMalformedA], 'offline-device');

  assert.equal(onlineFirst.activeSession?.tripId, 'trip-b');
  assert.equal(offlineFirst.activeSession?.tripId, 'trip-b');
  assert.equal(syncStateDigest(onlineFirst), syncStateDigest(offlineFirst));
});

test('offline post-reset shopping transitions cannot resurrect a deleted trip on reconnect', () => {
  const seeded = initializeReplicaState({
    ...emptyState(),
    items: [item(0)],
    activeSession: shoppingSession(1),
  }, 'seed-device');
  let stale = mergeReplicaStates([seeded], 'stale-device');
  const resetBase = mergeReplicaStates([seeded], 'reset-device');
  const reset = recordLocalMutation(resetBase, {
    ...resetBase,
    items: resetBase.items.map((entry) => ({ ...entry, status: 'stocked', storeId: null })),
    activeSession: null,
  }, 'reset-device', 'shopping.reset');

  for (let index = 0; index < 4; index += 1) {
    stale = recordLocalMutation(stale, {
      ...stale,
      activeSession: {
        ...stale.activeSession!,
        currentIndex: index + 1,
        status: index % 2 === 0 ? 'receipt_prompt' : 'shopping_store',
      },
    }, 'stale-device', `shopping.offline.${index}`);
  }

  const merged = mergeReplicaStates([reset, stale], 'observer-device');

  assert.equal(merged.activeSession, null);
  assert.equal(merged.items[0].storeId, null);
});

test('both devices can reset the same trip and converge without a ghost store', () => {
  const seeded = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1) }, 'seed-device');
  const ownerBase = mergeReplicaStates([seeded], 'owner-device');
  const memberBase = mergeReplicaStates([seeded], 'member-device');
  const owner = recordLocalMutation(ownerBase, { ...ownerBase, activeSession: null }, 'owner-device', 'shopping.reset');
  const member = recordLocalMutation(memberBase, { ...memberBase, activeSession: null }, 'member-device', 'shopping.reset');

  const ownerFirst = mergeReplicaStates([owner, member], 'observer-a');
  const memberFirst = mergeReplicaStates([member, owner], 'observer-b');

  assert.equal(ownerFirst.activeSession, null);
  assert.equal(memberFirst.activeSession, null);
  assert.equal(syncStateDigest(ownerFirst), syncStateDigest(memberFirst));
});

test('a new trip can start after the deleted trip tombstone converges', () => {
  const seeded = initializeReplicaState({ ...emptyState(), activeSession: shoppingSession(1) }, 'seed-device');
  const resetBase = mergeReplicaStates([seeded], 'reset-device');
  const reset = recordLocalMutation(resetBase, { ...resetBase, activeSession: null }, 'reset-device', 'shopping.reset');
  const converged = mergeReplicaStates([seeded, reset], 'owner-device');
  const nextSession = { ...shoppingSession(1), tripId: 'trip-2', startedAt: 2 };
  const restarted = recordLocalMutation(
    converged,
    { ...converged, activeSession: nextSession },
    'owner-device',
    'shopping.start',
  );

  const merged = mergeReplicaStates([reset, restarted], 'observer-device');

  assert.equal(merged.activeSession?.tripId, 'trip-2');
  assert.equal(merged.activeSession?.status, 'shopping_store');
});

test('a planning device promotes the household active trip when it pulls a missed replica update', () => {
  let iphone = initializeReplicaState({ ...emptyState(), items: [item(0)] }, 'iphone-device');
  for (let index = 0; index < 8; index += 1) {
    iphone = recordLocalMutation(iphone, {
      ...iphone,
      items: iphone.items.map((entry) => ({ ...entry, quantity: entry.quantity + 1 })),
    }, 'iphone-device', `item.quantity.${index}`);
  }

  const ipadBase = mergeReplicaStates([iphone], 'ipad-device');
  const ipadActive = recordLocalMutation(ipadBase, {
    ...ipadBase,
    activeSession: { ...shoppingSession(1), tripId: 'shared-trip', startedAt: 100 },
  }, 'ipad-device', 'shopping.START_TRIP');

  const merged = mergeReplicaStates([iphone, ipadActive], 'iphone-device');

  assert.equal(iphone.activeSession, null);
  assert.equal(merged.activeSession?.tripId, 'shared-trip');
  assert.equal(merged.activeSession?.status, 'shopping_store');
});

test('offline changes survive serialization and converge after reconnect', () => {
  const base = addItemsRapidly(initializeReplicaState(emptyState(), 'seed-device'), 'seed-device', 20);
  let offline = mergeReplicaStates([base], 'offline-device');
  let online = mergeReplicaStates([base], 'online-device');

  offline = recordLocalMutation(offline, {
    ...offline,
    items: offline.items.filter((entry) => entry.id !== 'item-3'),
    updatedAt: 500,
  }, 'offline-device', 'item.delete');
  offline = JSON.parse(JSON.stringify(offline)) as DurableState;

  online = recordLocalMutation(online, {
    ...online,
    items: online.items.map((entry) => entry.id === 'item-4' ? { ...entry, quantity: 9 } : entry),
    updatedAt: 501,
  }, 'online-device', 'item.quantity');

  const a = mergeReplicaStates([offline, online], 'offline-device');
  const b = mergeReplicaStates([online, offline], 'online-device');
  assert.equal(syncStateDigest(a), syncStateDigest(b));
  assert.equal(a.items.some((entry) => entry.id === 'item-3'), false);
  assert.equal(a.items.find((entry) => entry.id === 'item-4')?.quantity, 9);
});

test('seeded concurrent random operations converge without ghosts or duplicates', () => {
  const base = addItemsRapidly(initializeReplicaState(emptyState(), 'seed-device'), 'seed-device', 100);
  let owner = mergeReplicaStates([base], 'owner-device');
  let member = mergeReplicaStates([base], 'member-device');
  let seed = 321;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let operation = 0; operation < 250; operation += 1) {
    const replicaId = operation % 2 === 0 ? 'owner-device' : 'member-device';
    const current = replicaId === 'owner-device' ? owner : member;
    const target = Math.floor(random() * 125);
    const mode = Math.floor(random() * 4);
    let items = current.items;
    if (mode === 0) {
      items = items.filter((entry) => entry.id !== `item-${target}`);
    } else if (mode === 1) {
      items = items.map((entry) => entry.id === `item-${target}`
        ? { ...entry, quantity: operation + 2, updatedAt: 1_000 + operation }
        : entry);
    } else if (mode === 2) {
      items = items.map((entry) => entry.id === `item-${target}`
        ? { ...entry, status: entry.status === 'low' ? 'stocked' : 'low', updatedAt: 1_000 + operation }
        : entry);
    } else if (!items.some((entry) => entry.id === `item-${target}`)) {
      items = [{ ...item(target), createdAt: 1_000 + operation, updatedAt: 1_000 + operation }, ...items];
    }
    const next = recordLocalMutation(current, { ...current, items }, replicaId, `stress.${mode}`);
    if (replicaId === 'owner-device') owner = next;
    else member = next;
  }

  const ownerFirst = mergeReplicaStates([base, owner, member], 'observer-a');
  const memberFirst = mergeReplicaStates([member, owner, base], 'observer-b');
  assert.equal(syncStateDigest(ownerFirst), syncStateDigest(memberFirst));
  assert.equal(ownerFirst.items.length, new Set(ownerFirst.items.map((entry) => entry.id)).size);
  assert.equal(syncStateDigest(ownerFirst), syncStateDigest(mergeReplicaStates([memberFirst, ownerFirst], 'observer-c')));
});

test('database migration preserves replica recovery while runtime uses one canonical queue', () => {
  const migrationsDir = join(process.cwd(), '../../supabase/migrations');
  const migrationName = readdirSync(migrationsDir).find((name) => name.includes('deterministic_household_sync'));
  const migration = migrationName ? readFileSync(join(migrationsDir, migrationName), 'utf8') : '';
  const enginePath = join(process.cwd(), 'core/services/syncEngine.ts');
  const engine = existsSync(enginePath) ? readFileSync(enginePath, 'utf8') : '';

  assert.match(migration, /create table if not exists public\.household_sync_replicas/i);
  assert.match(migration, /primary key \(household_id, user_id, replica_id\)/i);
  assert.match(migration, /is_household_member\(household_id\)/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.household_sync_replicas/i);
  assert.match(engine, /household_sync_replicas/);
  assert.match(engine, /SUBSCRIBED/);
  assert.match(engine, /canonicalSyncQueue/);
  assert.match(engine, /CANONICAL_CLOUD_TABLE/);
  assert.doesNotMatch(engine, /from\(REPLICA_TABLE\)\.upsert/);
});
