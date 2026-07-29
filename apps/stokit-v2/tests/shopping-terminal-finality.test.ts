import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import { mergeDurableSnapshotForPush } from '../core/services/mergeDurableSnapshot';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { resolveHydratedShoppingSession } from '../core/services/shoppingSessionHydration';
import type { DurableState, Receipt, SharedShoppingSession, Trip } from '../types';

function activeTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    shopperId: 'owner',
    now: 100,
    entries: [
      { pantryItemId: 'apple', name: 'Apple', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
      { pantryItemId: 'banana', name: 'Banana', quantity: 1, unit: 'unit', storeId: 'safeway', picked: false },
    ],
  });
}

function finishTrip(): { active: ShoppingSession; terminal: ShoppingSession; trip: Trip; receipts: Receipt[] } {
  let session = activeTrip();
  const active = structuredClone(session);
  session = reduce(session, { type: 'FINISH_STORE', stopId: currentStopId(session)!, now: 110 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 120 });
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });
  session = reduce(session, { type: 'FINISH_STORE', stopId: currentStopId(session)!, now: 130 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 140 });
  const terminal = reduce(session, { type: 'FINISH_TRIP', now: 150 });
  return {
    active,
    terminal,
    trip: terminal.completedTrip!,
    receipts: terminal.receipts,
  };
}

const prefs = {
  householdName: 'Home',
  defaultUnit: 'unit' as const,
  expiringWindowDays: 3,
  weeklyBudget: 0,
};

function snapshot(
  activeSession: SharedShoppingSession | null,
  trips: Trip[],
  receipts: Receipt[],
  updatedAt: number,
  closed = trips.map((trip) => ({ id: trip.id, deletedAt: trip.completedAt })),
): DurableState {
  return {
    items: [],
    stores: [],
    priceHistory: [],
    receipts,
    trips,
    activity: [],
    prefs,
    activeSession,
    updatedAt,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: closed,
  };
}

function assertTerminalWins(completed: DurableState, stale: DurableState): DurableState {
  const merged = mergeDurableSnapshotForPush(completed, stale);
  assert.equal(merged.activeSession, null);
  assert.equal(merged.trips.length, 1);
  assert.equal(merged.receipts.length, 2);
  return merged;
}

test('final store completion survives end-trip and restart hydration', () => {
  const { active, terminal, trip } = finishTrip();
  const ended = reduce(terminal, { type: 'END_TRIP' });
  assert.equal(ended.status, 'idle');
  const hydrated = resolveHydratedShoppingSession(active, null, (id) => id === trip.id);
  assert.equal(hydrated.status, 'idle');
  assert.equal(hydrated.entries.length, 0);
});

test('trip commit writes history, receipt identities, tombstone, and null session atomically', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const start = source.lastIndexOf('commitTrip: (trip, receipts) => {');
  const commit = source.slice(start, source.indexOf('removeTrip:', start));
  const stateWrite = commit.slice(commit.indexOf('set((s) => ({'), commit.indexOf('}));') + 4);
  assert.match(stateWrite, /trips:/);
  assert.match(stateWrite, /receipts:/);
  assert.match(stateWrite, /activeSession: null/);
  assert.match(stateWrite, /closedTripIds:/);
  assert.equal((stateWrite.match(/set\(/g) ?? []).length, 1);
});

test('peer reconnect cannot restore a stale active session', () => {
  const { active, trip, receipts } = finishTrip();
  assertTerminalWins(snapshot(null, [trip], receipts, 200), snapshot(active, [], [], 300, []));
});

test('delayed realtime active payload loses to terminal completion', () => {
  const { active, trip, receipts } = finishTrip();
  assertTerminalWins(snapshot(null, [trip], receipts, 300), snapshot(active, [], [], 100, []));
});

test('outbox retry with a newer envelope cannot restore a completed trip', () => {
  const { active, trip, receipts } = finishTrip();
  const terminal = snapshot(null, [trip], receipts, 200);
  const retried = snapshot(active, [], [], 999, []);
  const once = assertTerminalWins(terminal, retried);
  assertTerminalWins(once, retried);
});

test('owner completion beats a stale member session', () => {
  const { active, trip, receipts } = finishTrip();
  assertTerminalWins(snapshot(null, [trip], receipts, 200), snapshot(active, [], [], 400, []));
});

test('member completion beats a stale owner session', () => {
  const { active, trip, receipts } = finishTrip();
  assertTerminalWins(snapshot(active, [], [], 400, []), snapshot(null, [trip], receipts, 200));
});

test('terminal completion beats an older pre-commit REOPEN_STORE event', () => {
  const { terminal, trip, receipts } = finishTrip();
  const stopId = currentStopId(terminal)!;
  const storeSummary = { ...terminal, status: 'store_summary', completedTrip: null } as ShoppingSession;
  const reopened = reduce(storeSummary, { type: 'REOPEN_STORE', stopId, now: 145 });
  assertTerminalWins(snapshot(null, [trip], receipts, 200), snapshot(reopened, [], [], 300, []));
});

test('explicit pre-commit REOPEN_STORE still wins over stale store completion', () => {
  const { terminal } = finishTrip();
  const stopId = currentStopId(terminal)!;
  const completed = { ...terminal, status: 'store_summary', completedTrip: null } as ShoppingSession;
  const reopened = reduce(completed, { type: 'REOPEN_STORE', stopId, now: 160 });
  const folded = foldRemoteActiveSession(
    completed as SharedShoppingSession,
    reopened as SharedShoppingSession,
  );
  assert.equal(folded.status, 'shopping_store');
  assert.equal(currentStopId(folded as ShoppingSession), stopId);
});

test('repeated stale merges preserve one trip and each receipt identity once', () => {
  const { active, trip, receipts } = finishTrip();
  const terminal = snapshot(null, [trip], receipts, 200);
  const stale = snapshot(active, [], [], 400, []);
  const once = assertTerminalWins(terminal, stale);
  const twice = assertTerminalWins(once, stale);
  assert.deepEqual(twice.trips.map(({ id }) => id), [trip.id]);
  assert.equal(new Set(twice.receipts.map(({ id }) => id)).size, receipts.length);
});

test('closed trip hydration exposes no active store', () => {
  const { active, trip } = finishTrip();
  const hydrated = resolveHydratedShoppingSession(active, active, (id) => id === trip.id);
  assert.equal(hydrated.status, 'idle');
  assert.equal(currentStopId(hydrated), null);
});
