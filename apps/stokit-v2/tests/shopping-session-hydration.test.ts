import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { initialSession, reduce, type ShoppingSession } from '../core/shopping-machine';
import {
  resolveHydratedShoppingSession,
  sameActiveShoppingSession,
} from '../core/services/shoppingSessionHydration';

function active(
  tripAt: number,
  pantryItemId: string,
  storeId = 'costco',
): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now: tripAt,
    shopperId: 'owner',
    entries: [{
      pantryItemId,
      name: pantryItemId,
      quantity: 1,
      unit: 'unit',
      storeId,
      picked: false,
    }],
  });
}

const neverClosed = () => false;

test('durable activeSession hydrates Shopping when the separate session key is missing', () => {
  const durable = active(100, 'apple');
  const resolved = resolveHydratedShoppingSession(null, durable, neverClosed);

  assert.equal(resolved.tripId, durable.tripId);
  assert.equal(resolved.entries[0].pantryItemId, 'apple');
});

test('same-trip persisted and durable sessions fold before first render', () => {
  const saved = active(100, 'apple');
  const durable = reduce(saved, {
    type: 'ADD_ENTRY',
    now: 200,
    entry: {
      pantryItemId: 'banana',
      name: 'banana',
      quantity: 1,
      unit: 'unit',
      storeId: 'costco',
      picked: false,
    },
  });
  const resolved = resolveHydratedShoppingSession(saved, durable, neverClosed);

  assert.deepEqual(
    resolved.entries.map((entry) => entry.pantryItemId).sort(),
    ['apple', 'banana'],
  );
  assert.equal(sameActiveShoppingSession(resolved, durable), true);
});

test('newer offline persisted session becomes the canonical durable upload session', () => {
  const staleDurable = active(100, 'apple');
  const newerSaved = active(200, 'banana', 'safeway');
  const resolved = resolveHydratedShoppingSession(newerSaved, staleDurable, neverClosed);

  assert.equal(resolved.tripId, newerSaved.tripId);
  assert.equal(sameActiveShoppingSession(resolved, staleDurable), false);
});

test('newer durable session defeats a stale session-key copy', () => {
  const staleSaved = active(100, 'apple');
  const newerDurable = active(200, 'banana', 'safeway');
  const resolved = resolveHydratedShoppingSession(staleSaved, newerDurable, neverClosed);

  assert.equal(resolved.tripId, newerDurable.tripId);
});

test('closed trips cannot hydrate from either persisted representation', () => {
  const closed = active(100, 'apple');
  const resolved = resolveHydratedShoppingSession(
    closed,
    closed,
    (tripId) => tripId === closed.tripId,
  );

  assert.equal(resolved.status, 'idle');
});

test('boot orders durable before session hydration and gates the first render on both', () => {
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');
  assert.match(layout, /await hydrateDurable\(\);[\s\S]{0,80}finally \{[\s\S]{0,80}await hydrateSession\(\);/);
  assert.match(layout, /hydratedDurable && hydratedSession && hydratedHousehold/);
});

test('hydration mirrors a changed canonical session into the durable upload source', () => {
  const sessionStore = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  assert.match(
    sessionStore,
    /if \(!sameActiveShoppingSession\(durable\.activeSession, activeCanonical\)\)/,
  );
  assert.match(
    sessionStore,
    /durable\.setActiveSession\(activeCanonical, 'HYDRATE_SESSION'\)/,
  );
});
