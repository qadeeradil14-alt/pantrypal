import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { emptyDurableState } from '../core/repositories/durableRepository';
import {
  classifySupabasePushError,
  createHouseholdPushCoordinator,
  durableStateSemanticFingerprint,
  PUSH_TIMEOUT_MS,
  type PushAttemptOutcome,
  withPushAbort,
} from '../core/services/householdPushCoordinator';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import type { DurableState, ItemTombstone, PantryItem } from '../types';

function item(id: string): PantryItem {
  return {
    id,
    name: id === 'ground-beef' ? 'Ground beef' : id,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId: 'costco',
    expiryDate: null,
    createdAt: 1,
    updatedAt: 1,
    statusUpdatedAt: 1,
    statusRevision: 1,
  };
}

function state(
  updatedAt: number,
  ids: string[] = ['ground-beef'],
  deletedItems: ItemTombstone[] = [],
): DurableState {
  return {
    ...emptyDurableState,
    items: ids.map(item),
    deletedItems,
    updatedAt,
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('semantic fingerprint ignores transport updatedAt and object/collection ordering', () => {
  const left = state(1, ['milk', 'ground-beef'], [
    { id: 'cheese', deletedAt: 4 },
    { id: 'apple', deletedAt: 3 },
  ]);
  const right = {
    ...state(999, ['ground-beef', 'milk'], [
      { id: 'apple', deletedAt: 3 },
      { id: 'cheese', deletedAt: 4 },
    ]),
    prefs: { ...left.prefs },
  };

  assert.equal(durableStateSemanticFingerprint(left), durableStateSemanticFingerprint(right));
  assert.notEqual(
    durableStateSemanticFingerprint(left),
    durableStateSemanticFingerprint({ ...right, deletedItems: [...right.deletedItems!, { id: 'new', deletedAt: 5 }] }),
  );
});

test('semantic fingerprint includes meaningful receipt and tombstone changes', () => {
  const base = state(1);
  const receiptChanged = {
    ...base,
    receipts: [{
      id: 'receipt',
      tripId: 'trip',
      storeId: 'costco',
      amount: 10,
      status: 'logged' as const,
      imageUri: null,
      createdAt: 1,
    }],
  };
  assert.notEqual(
    durableStateSemanticFingerprint(base),
    durableStateSemanticFingerprint(receiptChanged),
  );
});

test('semantic fingerprint ignores signed receipt URLs but detects semantic receipt content', () => {
  const base = state(1);
  const receipt = {
    id: 'receipt',
    tripId: 'trip',
    storeId: 'costco',
    amount: 10,
    status: 'logged' as const,
    imagePath: 'household/receipt.jpg',
    imageUri: 'https://signed.example/one',
    items: [{ name: 'Milk', quantity: 1, price: 5 }],
    createdAt: 1,
    updatedAt: 2,
  };
  const withReceipt = { ...base, receipts: [receipt] };
  const refreshedUrl = {
    ...withReceipt,
    updatedAt: 999,
    receipts: [{ ...receipt, imageUri: 'https://signed.example/two' }],
  };

  assert.equal(
    durableStateSemanticFingerprint(withReceipt),
    durableStateSemanticFingerprint(refreshedUrl),
  );
  assert.notEqual(
    durableStateSemanticFingerprint(withReceipt),
    durableStateSemanticFingerprint({
      ...withReceipt,
      receipts: [{ ...receipt, amount: 11 }],
    }),
  );
  assert.notEqual(
    durableStateSemanticFingerprint(withReceipt),
    durableStateSemanticFingerprint({
      ...withReceipt,
      receipts: [{ ...receipt, items: [{ name: 'Milk', quantity: 2, price: 10 }] }],
    }),
  );
});

test('semantic fingerprint detects assignment, active-session, trip, receipt, and tombstone changes', () => {
  const base = state(1);
  const variants: DurableState[] = [
    {
      ...base,
      shoppingStoreAssignments: [{
        id: 'milk:costco', pantryItemId: 'milk', storeId: 'costco', active: true, updatedAt: 2,
      }],
    },
    {
      ...base,
      activeSession: {
        status: 'shopping_store', tripId: 'trip', startedAt: 1, storeQueue: ['costco'],
        currentIndex: 0, skippedStoreIds: [], entries: [], removedEntryIds: [], receipts: [], completedTrip: null,
      },
      activeTripId: 'trip',
      shoppingEpoch: 1,
    },
    {
      ...base,
      trips: [{
        id: 'trip', storeIdsVisited: ['costco'], skippedStoreIds: [], itemsBought: 1,
        itemsRemaining: 0, itemsOutOfStock: 0, receiptIds: [], totalSpent: 5,
        breakdown: [], purchasedItems: [{ itemId: 'milk', name: 'Milk', storeId: 'costco', price: 5 }],
        startedAt: 1, completedAt: 2, duration: 1,
      }],
    },
    {
      ...base,
      receipts: [{
        id: 'receipt', tripId: 'trip', storeId: 'costco', amount: 5,
        status: 'logged', items: [{ name: 'Milk', quantity: 1, price: 5 }], createdAt: 2,
      }],
    },
    { ...base, deletedItems: [{ id: 'milk', deletedAt: 2 }] },
  ];

  for (const variant of variants) {
    assert.notEqual(durableStateSemanticFingerprint(base), durableStateSemanticFingerprint(variant));
  }
});

test('Supabase status-zero transport errors are network failures while RLS remains permanent', () => {
  assert.equal(classifySupabasePushError({ message: 'TypeError: Network request failed', code: '' }, 0), 'network');
  assert.equal(classifySupabasePushError({ message: 'new row violates row-level security', code: '42501' }, 403), 'permanent');
  assert.equal(classifySupabasePushError({ message: 'JWT expired', code: 'PGRST301' }, 401), 'permanent');
});

test('a Supabase status-zero result enters the two-second offline backoff', async () => {
  const timers: number[] = [];
  const transportError = { message: 'TypeError: Network request failed', code: '' };
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => state(1),
    attempt: async () => classifySupabasePushError(transportError, 0) === 'network'
      ? { type: 'network-failure', error: transportError }
      : { type: 'permanent-error', error: transportError },
    installSuccess: async () => { throw new Error('unexpected success'); },
    setTimer: (_callback, ms) => {
      timers.push(ms);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', state(1));

  assert.deepEqual(timers, [2_000]);
  assert.equal(coordinator.inspect('household').phase, 'offline-backoff');
  assert.equal(coordinator.inspect('household').dirty, true);
});

test('push timeout aborts the underlying GET or PATCH request', async () => {
  assert.equal(PUSH_TIMEOUT_MS, 10_000);
  let aborted = false;
  const parent = new AbortController();
  await assert.rejects(
    withPushAbort(parent.signal, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      });
    }), 10),
    /push timed out after 10ms/,
  );
  assert.equal(aborted, true);
});

test('push timeout releases even if a mocked transport ignores abort', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    withPushAbort(new AbortController().signal, () => new Promise(() => {}), 10),
    /push timed out after 10ms/,
  );
  assert.ok(Date.now() - startedAt < 100);
});

test('snapshot GET and PATCH both attach the coordinator AbortSignal', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const attempt = source.slice(
    source.indexOf('async function performHouseholdPushAttempt'),
    source.indexOf('function preserveLocalReceiptUris'),
  );
  assert.match(attempt, /\.select\('state, updated_at'\)[\s\S]*?\.abortSignal\(requestSignal\)/);
  assert.match(attempt, /\.update\(\{ state: encodeShoppingState\(snapshot\), updated_at: writeAt \}\)[\s\S]*?\.abortSignal\(requestSignal\)/);
});

test('one household has one active push and the newest pending snapshot wins', async () => {
  let latest = state(1);
  let active = 0;
  let maxActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const submitted: number[] = [];
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      submitted.push(snapshot.updatedAt);
      if (submitted.length === 1) await gate;
      active -= 1;
      return { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt };
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = serverState;
      return { acknowledgedState: serverState, latestState: latest };
    },
  });

  void coordinator.enqueue('household', latest);
  await settle();
  latest = state(2, ['ground-beef', 'milk']);
  void coordinator.enqueue('household', latest);
  latest = state(3, ['ground-beef', 'milk', 'cheese']);
  void coordinator.enqueue('household', latest);
  release();
  await coordinator.whenSettled('household');

  assert.equal(maxActive, 1);
  assert.deepEqual(submitted, [1, 3]);
  assert.equal(coordinator.inspect('household').phase, 'idle');
});

test('pending replacement unions tombstones instead of dropping prior mutations', async () => {
  let latest = state(1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const submitted: DurableState[] = [];
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      submitted.push(snapshot);
      if (submitted.length === 1) await gate;
      return { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt };
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = serverState;
      return { acknowledgedState: serverState, latestState: latest };
    },
  });

  void coordinator.enqueue('household', latest);
  await settle();
  const deletedAt = Date.now();
  latest = state(2, ['ground-beef'], [{ id: 'milk', deletedAt }]);
  void coordinator.enqueue('household', latest);
  latest = state(3, ['ground-beef', 'cheese'], []);
  void coordinator.enqueue('household', latest);
  release();
  await coordinator.whenSettled('household');

  assert.deepEqual(submitted.at(-1)?.deletedItems, [{ id: 'milk', deletedAt }]);
  assert.deepEqual(submitted.at(-1)?.items.map(({ id }) => id).sort(), ['cheese', 'ground-beef']);
});

test('six CAS conflicts use short jitter and contention delay, never offline backoff', async () => {
  const delays: number[] = [];
  const timers: number[] = [];
  let attempts = 0;
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => state(1),
    attempt: async (): Promise<PushAttemptOutcome> => {
      attempts += 1;
      return { type: 'conflict' };
    },
    installSuccess: async () => { throw new Error('unexpected success'); },
    random: () => 0,
    delay: async (ms) => { delays.push(ms); },
    setTimer: (_callback, ms) => {
      timers.push(ms);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', state(1));
  await coordinator.whenSettled('household');

  assert.equal(attempts, 6);
  assert.deepEqual(delays, [25, 25, 25, 25, 25]);
  assert.deepEqual(timers, [200]);
  const inspected = coordinator.inspect('household');
  assert.equal(inspected.phase, 'contended');
  assert.equal(inspected.offlineDelayMs, 0);
  assert.equal(inspected.dirty, true);
});

test('more than six CAS conflicts execute a contention retry and then succeed', async () => {
  const timers: Array<{ callback: () => void; ms: number }> = [];
  let attempts = 0;
  let latest = state(1);
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      attempts += 1;
      return attempts <= 6
        ? { type: 'conflict' } as const
        : { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt } as const;
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = serverState;
      return { acknowledgedState: serverState, latestState: latest };
    },
    random: () => 0,
    delay: async () => {},
    setTimer: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', latest);
  assert.equal(coordinator.inspect('household').phase, 'contended');
  timers[0].callback();
  await settle();
  await coordinator.whenSettled('household');

  assert.equal(attempts, 7);
  assert.equal(coordinator.inspect('household').phase, 'idle');
  assert.deepEqual(timers.map(({ ms }) => ms), [200]);
});

test('a mutation queued during contention delay is included in the contention retry', async () => {
  const timers: Array<() => void> = [];
  const submitted: DurableState[] = [];
  let latest = state(1);
  let attempts = 0;
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      attempts += 1;
      submitted.push(snapshot);
      return attempts <= 6
        ? { type: 'conflict' } as const
        : { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt } as const;
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = serverState;
      return { acknowledgedState: serverState, latestState: latest };
    },
    random: () => 0,
    delay: async () => {},
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', latest);
  const deletedAt = Date.now();
  latest = state(2, ['ground-beef'], [{ id: 'milk', deletedAt }]);
  await coordinator.enqueue('household', latest);
  timers[0]();
  await settle();
  await coordinator.whenSettled('household');

  assert.deepEqual(submitted.at(-1)?.deletedItems, [{ id: 'milk', deletedAt }]);
});

test('network failures preserve pending state and use 2/4/8/16/30 second backoff', async () => {
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => state(1),
    attempt: async () => ({ type: 'network-failure', error: new Error('offline') }),
    installSuccess: async () => { throw new Error('unexpected success'); },
    setTimer: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', state(1));
  for (let index = 0; index < 4; index += 1) {
    await coordinator.whenSettled('household');
    timers.at(-1)!.callback();
    await settle();
  }
  await coordinator.whenSettled('household');

  assert.deepEqual(timers.map(({ ms }) => ms), [2_000, 4_000, 8_000, 16_000, 30_000]);
  assert.equal(coordinator.inspect('household').dirty, true);
  assert.ok(coordinator.inspect('household').pendingSnapshot);
});

test('a successful connectivity wake preserves a mutation queued during offline backoff', async () => {
  let latest = state(1);
  let attempts = 0;
  const timers: number[] = [];
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      attempts += 1;
      return attempts === 1
        ? { type: 'network-failure', error: new Error('offline') }
        : { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt };
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = serverState;
      return { acknowledgedState: serverState, latestState: latest };
    },
    setTimer: (_callback, ms) => {
      timers.push(ms);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', latest);
  latest = state(2, ['ground-beef', 'milk']);
  await coordinator.enqueue('household', latest);
  await coordinator.wake('household');
  await coordinator.whenSettled('household');

  assert.equal(attempts, 2);
  assert.deepEqual(latest.items.map(({ id }) => id), ['ground-beef', 'milk']);
  assert.equal(coordinator.inspect('household').phase, 'idle');
});

test('ignored abort creates a transport barrier so a timeout retry never overlaps', async () => {
  const timers: Array<() => void> = [];
  const releases: Array<() => void> = [];
  let activeTransports = 0;
  let maxActiveTransports = 0;
  let attempts = 0;
  const latest = state(1);
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot, signal) => {
      attempts += 1;
      activeTransports += 1;
      maxActiveTransports = Math.max(maxActiveTransports, activeTransports);
      const transport = new Promise<void>((resolve) => {
        releases.push(() => {
          activeTransports -= 1;
          resolve();
        });
      });
      try {
        await withPushAbort(signal, () => transport, 5);
        return { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt } as const;
      } catch (error) {
        return {
          type: 'network-failure',
          error,
          transportSettled: error instanceof Error && 'transportSettled' in error
            ? (error as Error & { transportSettled: Promise<void> }).transportSettled
            : undefined,
        } as const;
      }
    },
    installSuccess: async (_householdId, _submitted, serverState) => ({
      acknowledgedState: serverState,
      latestState: serverState,
    }),
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', latest);
  timers[0]();
  await settle();
  assert.equal(attempts, 1);
  releases[0]();
  await settle();
  assert.equal(attempts, 2);
  assert.equal(maxActiveTransports, 1);
  releases[1]();
  await coordinator.whenSettled('household');
});

test('restart recovers dirty durable work into a fresh coordinator', async () => {
  const deletedAt = Date.now();
  const persisted = state(2, ['ground-beef'], [{ id: 'milk', deletedAt }]);
  let uploadedDeletedItems: ItemTombstone[] = [];
  const restarted = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => persisted,
    attempt: async (_householdId, snapshot) => {
      uploadedDeletedItems = snapshot.deletedItems ?? [];
      return { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt };
    },
    installSuccess: async (_householdId, _submitted, serverState) => ({
      acknowledgedState: serverState,
      latestState: serverState,
    }),
  });

  await restarted.enqueue('household', persisted);
  assert.deepEqual(uploadedDeletedItems, [{ id: 'milk', deletedAt }]);
});

test('permanent failures retain dirty state without contention or offline timers', async () => {
  const timers: number[] = [];
  const errors: unknown[] = [];
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => state(1),
    attempt: async () => ({ type: 'permanent-error', error: new Error('RLS') }),
    installSuccess: async () => { throw new Error('unexpected success'); },
    onPermanentError: (_householdId, error) => errors.push(error),
    setTimer: (_callback, ms) => {
      timers.push(ms);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });

  await coordinator.enqueue('household', state(1));

  assert.equal(coordinator.inspect('household').phase, 'idle');
  assert.equal(coordinator.inspect('household').dirty, true);
  assert.equal(timers.length, 0);
  assert.equal(errors.length, 1);
});

test('reset aborts an old generation and prevents its late success from installing', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let installs = 0;
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => state(1),
    attempt: async (_householdId, snapshot) => {
      await gate;
      return { type: 'success', serverState: snapshot, updatedAt: snapshot.updatedAt };
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      installs += 1;
      return { acknowledgedState: serverState, latestState: serverState };
    },
  });

  const pending = coordinator.enqueue('household', state(1));
  await settle();
  coordinator.reset();
  release();
  await pending;

  assert.equal(installs, 0);
});

test('semantic convergence suppresses redundant attempts', async () => {
  let attempts = 0;
  let latest = state(1);
  const coordinator = createHouseholdPushCoordinator({
    readLatestSnapshot: async () => latest,
    attempt: async (_householdId, snapshot) => {
      attempts += 1;
      return { type: 'success', serverState: { ...snapshot, updatedAt: 50 }, updatedAt: 50 };
    },
    installSuccess: async (_householdId, _submitted, serverState) => {
      latest = { ...serverState, updatedAt: 51 };
      return { acknowledgedState: serverState, latestState: latest };
    },
  });

  await coordinator.enqueue('household', latest);
  await coordinator.whenSettled('household');
  await coordinator.enqueue('household', { ...latest, updatedAt: 99 });
  await coordinator.whenSettled('household');

  assert.equal(attempts, 1);
});

test('deterministic two-device stress preserves 19 alternating tombstones and converges', async () => {
  const ids = ['ground-beef', ...Array.from({ length: 19 }, (_, index) => `delete-${index + 1}`)];
  const deletedAt = Date.now();
  let server = state(1, ids);
  let serverVersion = 1;
  let conflictsRemaining = 8;
  let activeA = 0;
  let activeB = 0;
  let maxA = 0;
  let maxB = 0;
  let patchCount = 0;
  let virtualMs = 0;
  let localA = state(2, ids);
  let localB = state(3, ids);
  for (let index = 1; index < ids.length; index += 1) {
    const target = index % 2 === 1 ? localA : localB;
    const next = state(
      target.updatedAt + 2,
      target.items.map(({ id }) => id).filter((id) => id !== ids[index]),
      [...(target.deletedItems ?? []), { id: ids[index], deletedAt: deletedAt + index }],
    );
    if (index % 2 === 1) localA = next;
    else localB = next;
  }
  let latestA = localA;
  let latestB = localB;

  const makeCoordinator = (device: 'A' | 'B') => createHouseholdPushCoordinator({
    readLatestSnapshot: async () => device === 'A' ? latestA : latestB,
    attempt: async (_householdId, submitted) => {
      if (device === 'A') { activeA += 1; maxA = Math.max(maxA, activeA); }
      else { activeB += 1; maxB = Math.max(maxB, activeB); }
      await Promise.resolve();
      if (device === 'A') activeA -= 1;
      else activeB -= 1;
      if (conflictsRemaining > 0) {
        conflictsRemaining -= 1;
        return { type: 'conflict' } as const;
      }
      serverVersion += 1;
      server = { ...mergeDurableSnapshotForPush(server, submitted), updatedAt: serverVersion };
      patchCount += 1;
      return { type: 'success', serverState: server, updatedAt: serverVersion } as const;
    },
    installSuccess: async (_householdId, _submitted, stored) => {
      if (device === 'A') latestA = stored;
      else latestB = stored;
      return { acknowledgedState: stored, latestState: stored };
    },
    random: () => 0,
    delay: async (ms) => { virtualMs += ms; },
  });
  const a = makeCoordinator('A');
  const b = makeCoordinator('B');

  await Promise.all([a.enqueue('household', localA), b.enqueue('household', localB)]);
  await Promise.all([a.whenSettled('household'), b.whenSettled('household')]);
  latestA = mergeDurableSnapshotForPush(latestA, server);
  latestB = mergeDurableSnapshotForPush(latestB, server);
  await Promise.all([a.enqueue('household', latestA), b.enqueue('household', latestB)]);
  await Promise.all([a.whenSettled('household'), b.whenSettled('household')]);

  assert.equal(server.deletedItems?.length, 19);
  assert.deepEqual(server.items.map(({ name }) => name), ['Ground beef']);
  assert.equal(maxA, 1);
  assert.equal(maxB, 1);
  assert.equal(virtualMs, 200);
  assert.ok(virtualMs < 15_000);
  assert.equal(patchCount, 3);
  const patchesAtConvergence = patchCount;
  await Promise.all([a.enqueue('household', { ...server, updatedAt: 100 }), b.enqueue('household', { ...server, updatedAt: 101 })]);
  await Promise.all([a.whenSettled('household'), b.whenSettled('household')]);
  assert.equal(patchCount, patchesAtConvergence);
});
