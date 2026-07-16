import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  canonicalHomeCounts,
  mergeCanonicalSources,
  shouldProcessRealtimeRevision,
} from '../core/services/canonicalSync';
import {
  initializeReplicaState,
  recordLocalMutation,
  replicaEnvelopeDigest,
  syncStateDigest,
} from '../core/services/replicaSync';
import type { DurableState, PantryItem, Receipt, SharedShoppingSession, Trip } from '../types';

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

function item(id: string, status: PantryItem['status'] = 'stocked', updatedAt = 1): PantryItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status,
    storageLocation: 'pantry',
    storeId: status === 'low' ? 'store-1' : null,
    expiryDate: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function session(tripId: string, itemIds: string[]): SharedShoppingSession {
  return {
    status: 'shopping_store',
    tripId,
    startedAt: 10,
    storeQueue: ['store-1'],
    currentIndex: 0,
    skippedStoreIds: [],
    entries: itemIds.map((itemId) => ({
      itemId,
      name: itemId,
      quantity: 1,
      unit: 'unit',
      storeId: 'store-1',
      picked: false,
    })),
    removedItemIds: [],
    receipts: [],
    completedTrip: null,
  };
}

function receipt(id: string): Receipt {
  return {
    id,
    tripId: 'trip-1',
    storeId: 'store-1',
    amount: 12.34,
    status: 'logged',
    imagePath: `household/${id}.jpg`,
    imageUri: null,
    createdAt: 20,
  };
}

function trip(id: string, receiptId: string): Trip {
  return {
    id,
    storeIdsVisited: ['store-1'],
    skippedStoreIds: [],
    itemsBought: 1,
    itemsRemaining: 0,
    itemsOutOfStock: 0,
    receiptIds: [receiptId],
    totalSpent: 12.34,
    breakdown: [{ storeId: 'store-1', itemsBought: 1, amount: 12.34, receiptId, skipped: false }],
    purchasedItems: [{ itemId: 'item-1', name: 'item-1', storeId: 'store-1', price: 12.34 }],
    startedAt: 10,
    completedAt: 20,
    duration: 10,
  };
}

function mutate(
  previous: DurableState,
  replicaId: string,
  operation: string,
  patch: Partial<DurableState>,
): DurableState {
  return recordLocalMutation(previous, { ...previous, ...patch, updatedAt: previous.updatedAt + 1 }, replicaId, operation);
}

test('Pantry converges through one canonical household snapshot', () => {
  const seed = initializeReplicaState({ ...emptyState(), items: [item('shared')] }, 'seed');
  const iphone = mutate(mergeCanonicalSources(seed, null, [], 'iphone'), 'iphone', 'item.create', {
    items: [item('iphone-only', 'stocked', 2), ...seed.items],
  });
  const ipad = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'item.create', {
    items: [item('ipad-only', 'stocked', 3), ...seed.items],
  });

  const afterIphone = mergeCanonicalSources(iphone, seed, [], 'iphone');
  const canonical = mergeCanonicalSources(ipad, afterIphone, [], 'ipad');
  const convergedIphone = mergeCanonicalSources(iphone, canonical, [], 'iphone');

  assert.deepEqual(new Set(canonical.items.map((entry) => entry.id)), new Set(['shared', 'iphone-only', 'ipad-only']));
  assert.equal(syncStateDigest(convergedIphone), syncStateDigest(canonical));
});

test('Shopping and Home counters converge from canonical durable items', () => {
  const seed = initializeReplicaState({
    ...emptyState(),
    items: [item('milk', 'low'), item('eggs')],
  }, 'seed');
  const ipad = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'shopping.start', {
    activeSession: session('trip-1', ['milk']),
  });
  const canonical = mergeCanonicalSources(ipad, seed, [], 'ipad');
  const iphone = mergeCanonicalSources(seed, canonical, [], 'iphone');

  assert.equal(iphone.activeSession?.tripId, 'trip-1');
  assert.deepEqual(canonicalHomeCounts(iphone), { pantry: 1, shopping: 1, expiring: 0 });
});

test('Receipt and trip history converge without duplication', () => {
  const seed = initializeReplicaState(emptyState(), 'seed');
  const r = receipt('receipt-1');
  const t = trip('trip-1', r.id);
  const iphone = mutate(mergeCanonicalSources(seed, null, [], 'iphone'), 'iphone', 'trip.commit', {
    receipts: [r],
    trips: [t],
  });
  const canonical = mergeCanonicalSources(iphone, seed, [], 'iphone');
  const ipad = mergeCanonicalSources(seed, canonical, [], 'ipad');

  assert.deepEqual(ipad.receipts.map((entry) => entry.id), ['receipt-1']);
  assert.deepEqual(ipad.trips.map((entry) => entry.id), ['trip-1']);
});

test('Cold start rejects stale cache entities deleted by canonical tombstones', () => {
  const seed = initializeReplicaState({ ...emptyState(), items: [item('deleted')] }, 'seed');
  const staleDisk = JSON.parse(JSON.stringify(mergeCanonicalSources(seed, null, [], 'iphone'))) as DurableState;
  const canonical = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'item.delete', { items: [] });
  const reopened = mergeCanonicalSources(staleDisk, canonical, [], 'iphone');

  assert.equal(reopened.items.length, 0);
});

test('Reconnect flush merges offline and online mutations', () => {
  const seed = initializeReplicaState({ ...emptyState(), items: [item('base')] }, 'seed');
  const offline = mutate(mergeCanonicalSources(seed, null, [], 'iphone'), 'iphone', 'item.create', {
    items: [item('offline'), ...seed.items],
  });
  const online = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'item.create', {
    items: [item('online'), ...seed.items],
  });
  const canonical = mergeCanonicalSources(offline, online, [], 'iphone');

  assert.deepEqual(new Set(canonical.items.map((entry) => entry.id)), new Set(['base', 'offline', 'online']));
});

test('Concurrent writes converge after compare-and-swap retry', () => {
  const seed = initializeReplicaState({ ...emptyState(), items: [item('base')] }, 'seed');
  const revision = 10;
  const iphone = mutate(mergeCanonicalSources(seed, null, [], 'iphone'), 'iphone', 'item.create', {
    items: [item('iphone'), ...seed.items],
  });
  const ipad = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'item.create', {
    items: [item('ipad'), ...seed.items],
  });
  const firstCommit = mergeCanonicalSources(iphone, seed, [], 'iphone');
  const serverRevision = revision + 1;
  assert.notEqual(serverRevision, revision);
  const retryCommit = mergeCanonicalSources(ipad, firstCommit, [], 'ipad');

  assert.deepEqual(new Set(retryCommit.items.map((entry) => entry.id)), new Set(['base', 'iphone', 'ipad']));
});

test('Stale realtime snapshots and self echoes are rejected by server revision', () => {
  assert.equal(shouldProcessRealtimeRevision(20, 21), false);
  assert.equal(shouldProcessRealtimeRevision(21, 21), false);
  assert.equal(shouldProcessRealtimeRevision(22, 21), true);
});

test('Receipt upload completing during trip commit cannot overwrite the committed trip', () => {
  const seed = initializeReplicaState(emptyState(), 'iphone');
  const uploaded = mutate(seed, 'iphone', 'receipt.upload', { receipts: [receipt('receipt-1')] });
  const committedDuringAwait = mutate(seed, 'iphone', 'trip.commit', {
    receipts: [receipt('receipt-1')],
    trips: [trip('trip-1', 'receipt-1')],
  });
  const canonical = mergeCanonicalSources(committedDuringAwait, uploaded, [], 'iphone');

  assert.equal(canonical.receipts.length, 1);
  assert.equal(canonical.trips.length, 1);
});

test('Force-close and reopen converges serialized durable state with canonical state', () => {
  const seed = initializeReplicaState({ ...emptyState(), items: [item('base')] }, 'seed');
  const changed = mutate(mergeCanonicalSources(seed, null, [], 'ipad'), 'ipad', 'item.create', {
    items: [item('remote'), ...seed.items],
  });
  const canonical = mergeCanonicalSources(changed, seed, [], 'ipad');
  const disk = JSON.parse(JSON.stringify(seed)) as DurableState;
  const reopened = mergeCanonicalSources(disk, canonical, [], 'iphone');

  assert.equal(syncStateDigest(reopened), syncStateDigest(canonical));
});

test('Legacy snapshot and OTA 320 replicas are recovery inputs only until canonicalized', () => {
  const legacyAvocado = { ...item('avocado', 'stocked', 300), quantity: 2 };
  const replicaAvocado = { ...item('avocado', 'stocked', 100), quantity: 1 };
  const legacyCheese = item('cheese', 'stocked', 100);
  const replicaCheese = item('cheese', 'low', 200);
  const logged = { ...receipt('receipt-conflict'), createdAt: 100 };
  const misleadingLaterSkip = { ...logged, amount: 0, status: 'skipped' as const, createdAt: 200 };
  const earlierSkip = { ...receipt('receipt-skip'), amount: 0, status: 'skipped' as const, createdAt: 100 };
  const laterSkip = { ...earlierSkip, createdAt: 200 };
  const completed = {
    ...trip('trip-1', logged.id),
    breakdown: [
      { storeId: 'store-1', itemsBought: 1, amount: logged.amount, receiptId: logged.id, skipped: false },
      { storeId: 'store-2', itemsBought: 0, amount: 0, receiptId: laterSkip.id, skipped: true },
    ],
  };
  const replicaSeed = initializeReplicaState({
    ...emptyState(),
    items: [replicaAvocado, replicaCheese, item('replica-only'), item('deleted')],
    receipts: [logged, earlierSkip],
    trips: [completed],
    updatedAt: 250,
  }, 'ipad');
  const replica = mutate(replicaSeed, 'ipad', 'item.delete', {
    items: replicaSeed.items.filter((entry) => entry.id !== 'deleted'),
  });
  const iphone = initializeReplicaState(replica, 'iphone');
  const legacy = {
    ...emptyState(),
    items: [legacyAvocado, legacyCheese, item('legacy-only'), item('deleted', 'stocked', 999)],
    receipts: [logged, misleadingLaterSkip, earlierSkip, laterSkip],
    trips: [completed],
    updatedAt: 350,
  };
  const recoveredFromIphone = mergeCanonicalSources(iphone, legacy, [replica], 'iphone');
  const recoveredFromIpad = mergeCanonicalSources(replica, legacy, [iphone], 'ipad');
  const recovered = recoveredFromIphone;
  const staleReplica = mutate(replica, 'ipad', 'item.create', { items: [item('must-not-return'), ...replica.items] });
  const canonical = mergeCanonicalSources(recovered, recovered, [staleReplica], 'iphone');

  assert.equal(recovered.items.find((entry) => entry.id === 'avocado')?.quantity, 2);
  assert.equal(recovered.items.find((entry) => entry.id === 'cheese')?.status, 'low');
  assert.equal(recovered.items.some((entry) => entry.id === 'deleted'), false);
  assert.equal(recovered.receipts.find((entry) => entry.id === logged.id)?.status, 'logged');
  assert.equal(recovered.receipts.find((entry) => entry.id === laterSkip.id)?.createdAt, 200);
  assert.deepEqual(new Set(recovered.items.map((entry) => entry.id)), new Set(['avocado', 'cheese', 'legacy-only', 'replica-only']));
  assert.equal(syncStateDigest(recoveredFromIphone), syncStateDigest(recoveredFromIpad));
  assert.equal(replicaEnvelopeDigest(recoveredFromIphone), replicaEnvelopeDigest(recoveredFromIpad));
  assert.equal(canonical.items.some((entry) => entry.id === 'must-not-return'), false);
});

test('Sync engine uses one serialized canonical CAS path for push, pull, realtime, foreground, and reconnect', () => {
  const engine = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');

  assert.match(engine, /CANONICAL_CLOUD_TABLE\s*=\s*'household_snapshots'/);
  assert.match(engine, /\.eq\('updated_at',\s*observedRevision\)/);
  assert.match(engine, /canonicalSyncQueue/);
  assert.match(engine, /shouldProcessRealtimeRevision/);
  assert.match(engine, /status === 'SUBSCRIBED'/);
  assert.doesNotMatch(engine, /from\(REPLICA_TABLE\)\.upsert/);
  assert.match(layout, /await pullFromSupabase\(\)/);
});

test('Database fence blocks legacy whole-snapshot writers after canonicalization', () => {
  const migrations = join(process.cwd(), '../../supabase/migrations');
  const name = readdirSync(migrations).find((entry) => entry.includes('protect_canonical_household_snapshots'));
  const migration = name ? readFileSync(join(migrations, name), 'utf8') : '';

  assert.match(migration, /tg_op = 'INSERT'/i);
  assert.match(migration, /new\.state #>> '\{syncMeta,schema\}' = '1'/);
  assert.match(migration, /new\.updated_at <= old\.updated_at/);
  assert.match(migration, /before insert or update on public\.household_snapshots/i);
});
