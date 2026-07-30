import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  currentStoreId,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { resolveHydratedShoppingSession } from '../core/services/shoppingSessionHydration';
import type { SharedShoppingSession, ShoppingEntryDraft } from '../types';

const entries: ShoppingEntryDraft[] = [
  {
    pantryItemId: 'apple',
    name: 'Apple',
    quantity: 2,
    unit: 'unit',
    storeId: 'costco',
    picked: false,
  },
  {
    pantryItemId: 'banana',
    name: 'Banana',
    quantity: 3,
    unit: 'unit',
    storeId: 'costco',
    picked: false,
  },
];

function completedFinalStore(): ShoppingSession {
  let session = reduce(initialSession, {
    type: 'START_TRIP',
    entries,
    now: 100,
    shopperId: 'owner',
  });
  for (const entry of session.entries) {
    session = reduce(session, {
      type: 'SET_PICK',
      entryId: entry.entryId,
      picked: true,
      now: 110,
    });
  }
  session = reduce(session, {
    type: 'FINISH_STORE',
    stopId: currentStopId(session)!,
    now: 120,
  });
  return reduce(session, { type: 'SKIP_RECEIPT', now: 130 });
}

test('reopening the final store reactivates the exact stop without rebuilding its occurrences', () => {
  const completed = completedFinalStore();
  const stopId = currentStopId(completed)!;
  const entriesBefore = structuredClone(completed.entries);
  const reopened = reduce(completed, {
    type: 'REOPEN_STORE',
    stopId,
    now: 140,
  });

  assert.equal(reopened.status, 'shopping_store');
  assert.equal(currentStopId(reopened), stopId);
  assert.equal(currentStoreId(reopened), 'costco');
  assert.deepEqual(reopened.completedStopIds, []);
  assert.deepEqual(reopened.entries, entriesBefore);
  assert.equal(reopened.completedTrip, null);
  assert.deepEqual(reopened.storeQueue, ['costco']);
});

test('reopening the current stop is an in-place undo; reopening an earlier stop creates a new occurrence instead', () => {
  let session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [
      entries[0],
      { ...entries[1], storeId: 'safeway' },
    ],
    now: 200,
    shopperId: 'owner',
  });
  session = reduce(session, { type: 'FINISH_STORE', stopId: currentStopId(session)!, now: 210 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 220 });
  const firstStopId = currentStopId(session)!;
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });
  session = reduce(session, { type: 'FINISH_STORE', stopId: currentStopId(session)!, now: 230 });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 240 });
  const finalStopId = currentStopId(session)!;

  // Reopening the CURRENT stop (finalStopId, costco's second entry — the one
  // the shopper is resting at) is the original in-place undo: same stopId,
  // firstStopId's completion untouched.
  const reopened = reduce(session, {
    type: 'REOPEN_STORE',
    stopId: finalStopId,
    now: 250,
  });

  assert.deepEqual(reopened.completedStopIds, [firstStopId]);
  assert.equal(currentStopId(reopened), finalStopId);
  assert.equal(reopened.status, 'shopping_store');

  // Reopening the EARLIER, non-current stop (firstStopId) from this same
  // store_summary resting position never rewinds into it — it creates a NEW,
  // independent occurrence instead, leaving firstStopId itself completed.
  const revisited = reduce(session, { type: 'REOPEN_STORE', stopId: firstStopId, now: 250 });

  assert.equal(revisited.status, 'shopping_store');
  assert.notEqual(currentStopId(revisited), firstStopId, 'a new stop identity, not the original');
  assert.ok(revisited.completedStopIds.includes(firstStopId), 'the original first stop stays completed');
  assert.deepEqual(revisited.storeQueue, ['costco', 'costco', 'safeway']);
});

test('forgotten item joins the reopened stop and re-completion creates no duplicate identities', () => {
  const completed = completedFinalStore();
  const stopId = currentStopId(completed)!;
  const originalEntryIds = completed.entries.map((entry) => entry.entryId);
  let reopened = reduce(completed, {
    type: 'REOPEN_STORE',
    stopId,
    now: 140,
  });
  reopened = reduce(reopened, {
    type: 'ADD_ENTRY',
    now: 150,
    entry: {
      pantryItemId: 'milk',
      name: 'Milk',
      quantity: 1,
      unit: 'unit',
      storeId: 'costco',
      picked: false,
    },
  });

  assert.equal(reopened.entries.length, 3);
  assert.deepEqual(reopened.entries.slice(0, 2).map((entry) => entry.entryId), originalEntryIds);
  assert.equal(reopened.entries[2].stopId, stopId);
  assert.equal(new Set(reopened.entries.map((entry) => entry.entryId)).size, 3);
  assert.deepEqual(reopened.storeQueue, ['costco']);

  reopened = reduce(reopened, { type: 'FINISH_STORE', stopId, now: 160 });
  reopened = reduce(reopened, { type: 'SKIP_RECEIPT', now: 170 });

  assert.equal(reopened.status, 'store_summary');
  assert.deepEqual(reopened.completedStopIds, [stopId]);
  assert.equal(new Set(reopened.receipts.map((receipt) => receipt.id)).size, reopened.receipts.length);

  const ended = reduce(reopened, { type: 'FINISH_TRIP', now: 180 });
  assert.equal(ended.status, 'trip_summary');
  assert.equal(ended.completedTrip?.id, reopened.tripId);
});

test('explicit reopen wins over a stale peer completion, then re-completion wins in both merge directions', () => {
  const staleCompleted = completedFinalStore();
  const stopId = currentStopId(staleCompleted)!;
  const reopened = reduce(staleCompleted, {
    type: 'REOPEN_STORE',
    stopId,
    now: 140,
  });

  for (const merged of [
    foldRemoteActiveSession(
      reopened as unknown as SharedShoppingSession,
      staleCompleted as unknown as SharedShoppingSession,
    ),
    foldRemoteActiveSession(
      staleCompleted as unknown as SharedShoppingSession,
      reopened as unknown as SharedShoppingSession,
    ),
  ] as SharedShoppingSession[]) {
    assert.equal(merged.status, 'shopping_store');
    assert.deepEqual(merged.completedStopIds, []);
  }

  let recompleted = reduce(reopened, { type: 'FINISH_STORE', stopId, now: 150 });
  recompleted = reduce(recompleted, { type: 'SKIP_RECEIPT', now: 160 });
  const merged = foldRemoteActiveSession(
    reopened as unknown as SharedShoppingSession,
    recompleted as unknown as SharedShoppingSession,
  );

  assert.equal(merged.status, 'store_summary');
  assert.deepEqual(merged.completedStopIds, [stopId]);
  assert.equal(merged.receipts.length, 1);
  assert.equal(merged.receipts[0].createdAt, 160);
});

test('reopened active stop survives hydration and remains the durable Shopping session', () => {
  const completed = completedFinalStore();
  const reopened = reduce(completed, {
    type: 'REOPEN_STORE',
    stopId: currentStopId(completed)!,
    now: 140,
  });
  const restored = resolveHydratedShoppingSession(
    reopened,
    reopened,
    () => false,
  );

  assert.equal(restored.status, 'shopping_store');
  assert.equal(restored.tripId, reopened.tripId);
  assert.equal(currentStopId(restored), currentStopId(reopened));
  assert.deepEqual(restored.entries, reopened.entries);
});

test('Reopen store is a pre-commit Shopping action and never navigates to Home', () => {
  const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  const decision = screen.slice(
    screen.indexOf('function PostStoreDecision'),
    screen.indexOf('// ── Active trip shell'),
  );
  const tripSummary = screen.slice(screen.indexOf('function TripSummary'));

  // Named after the store now ("Reopen Costco") rather than the generic
  // "Reopen store", since the same screen also lists other stores to reopen.
  assert.match(decision, /label=\{`Reopen \$\{store\?\.name \?\? 'this store'\}`\}/);
  assert.match(decision, /type: 'REOPEN_STORE', stopId, now: Date\.now\(\)/);
  assert.doesNotMatch(decision, /router\.(push|replace)/);
  assert.doesNotMatch(tripSummary, /RESUME_TRIP|Reopen last store/);
});
