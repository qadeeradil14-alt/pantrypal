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
import { tripStopsOverviewGroups } from '../core/services/shoppingGroups';

function startTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now: 1000,
    shopperId: 'owner',
    entries: [
      {
        pantryItemId: 'apple',
        name: 'Apple',
        quantity: 2,
        unit: 'unit',
        storeId: 'safeway',
        picked: false,
      },
      {
        pantryItemId: 'milk',
        name: 'Milk',
        quantity: 3,
        unit: 'unit',
        storeId: 'costco',
        picked: false,
      },
    ],
  });
}

test('current stop is excluded while remaining stops stay ordered', () => {
  const session = startTrip();

  assert.equal(currentStoreId(session), 'safeway');
  assert.deepEqual(
    tripStopsOverviewGroups(session).map((group) => ({
      storeId: group.storeId,
      classification: group.classification,
      isNext: group.isNext,
    })),
    [{ storeId: 'costco', classification: 'remaining', isNext: true }],
  );
});

test('finish action is guarded by the current stop id', () => {
  const session = startTrip();
  const activeStopId = currentStopId(session)!;

  assert.equal(
    reduce(session, { type: 'FINISH_STORE', now: 2000, stopId: 'stale-stop' }),
    session,
  );
  assert.equal(
    reduce(session, { type: 'FINISH_STORE', now: 2000, stopId: activeStopId }).status,
    'receipt_prompt',
  );
});

test('next stop activates and completed stop is classified without item loss', () => {
  const started = startTrip();
  const entriesBefore = structuredClone(started.entries);
  const safewayStopId = currentStopId(started)!;
  let session = reduce(started, {
    type: 'FINISH_STORE',
    now: 2000,
    stopId: safewayStopId,
  });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: 2100 });
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });

  assert.equal(currentStoreId(session), 'costco');
  assert.deepEqual(
    tripStopsOverviewGroups(session).map((group) => ({
      storeId: group.storeId,
      classification: group.classification,
      isNext: group.isNext,
    })),
    [{ storeId: 'safeway', classification: 'completed', isNext: false }],
  );
  assert.deepEqual(session.entries, entriesBefore);
});

test('Shopping UI names and targets the active store and auto-advances the ordered next stop', () => {
  const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(screen, /label=\{`Finish \$\{currentStoreName\}`\}/);
  assert.match(screen, /type: 'FINISH_STORE', now: Date\.now\(\), stopId: activeStopId/);
  assert.match(
    screen,
    /session\.status === 'next_store_ready'[\s\S]{0,300}?type: 'ADVANCE_STORE'/,
  );
});
