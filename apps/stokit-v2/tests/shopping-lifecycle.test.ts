import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { initialSession, reduce, type ShoppingSession } from '../core/shopping-machine';
import {
  resolveHydratedShoppingSession,
  resetShoppingLifecycleState,
  shoppingTransitionTrace,
} from '../core/services/shoppingLifecycle';
import { emptyDurableState } from '../core/repositories/durableRepository';
import type { DurableState, PantryItem, ShoppingEntry } from '../types';

const entry: ShoppingEntry = {
  itemId: 'tuna',
  name: 'Tuna',
  quantity: 1,
  unit: 'lb',
  storeId: 'sams-club',
  picked: false,
};

const activeSession = reduce(initialSession, {
  type: 'START_TRIP',
  entries: [entry],
  now: 100,
});

const lowItem: PantryItem = {
  id: 'tuna',
  name: 'Tuna',
  quantity: 1,
  unit: 'lb',
  status: 'low',
  storageLocation: 'pantry',
  storeId: 'sams-club',
  expiryDate: null,
  createdAt: 1,
  updatedAt: 1,
};

test('durable active session wins when standalone session storage is idle', () => {
  const resolved = resolveHydratedShoppingSession(initialSession, activeSession);

  assert.equal(resolved.status, 'shopping_store');
  assert.equal(resolved.tripId, activeSession.tripId);
});

test('durable trip completion prevents stale standalone storage from resurrecting Sam\'s Club', () => {
  const resolved = resolveHydratedShoppingSession(activeSession, null);

  assert.deepEqual(resolved, initialSession);
});

test('malformed persisted session is quarantined to idle', () => {
  const resolved = resolveHydratedShoppingSession(
    activeSession,
    {} as ShoppingSession,
  );

  assert.deepEqual(resolved, initialSession);
});

test('reset clears shopping items and active session in one durable state transition', () => {
  const state: DurableState = {
    ...emptyDurableState,
    items: [lowItem],
    activeSession,
    updatedAt: 50,
  };

  const reset = resetShoppingLifecycleState(state, 200);

  assert.equal(reset.activeSession, null);
  assert.equal(reset.items[0].status, 'stocked');
  assert.equal(reset.items[0].storeId, null);
  assert.equal(reset.items[0].updatedAt, 200);
});

test('repeated reset is idempotent', () => {
  const state: DurableState = {
    ...emptyDurableState,
    items: [lowItem],
    activeSession,
    updatedAt: 50,
  };

  const first = resetShoppingLifecycleState(state, 200);
  const second = resetShoppingLifecycleState(first, 300);

  assert.deepEqual(second, first);
});

test('full lifecycle trace records every state transition through idle', () => {
  const transitions: string[] = [];
  let session: ShoppingSession = initialSession;
  const dispatch = (event: Parameters<typeof reduce>[1]) => {
    const next = reduce(session, event);
    transitions.push(shoppingTransitionTrace('local', event.type, session, next));
    session = next;
  };

  dispatch({ type: 'START_TRIP', entries: [entry], now: 100 });
  dispatch({ type: 'SET_PICK', itemId: entry.itemId, picked: true });
  dispatch({ type: 'FINISH_STORE', now: 200 });
  dispatch({ type: 'SKIP_RECEIPT', now: 210 });
  dispatch({ type: 'ACKNOWLEDGE_SUMMARY' });
  dispatch({ type: 'FINISH_TRIP', now: 300 });
  dispatch({ type: 'END_TRIP' });

  assert.deepEqual(
    transitions.map((line) => line.match(/from=([^ ]+) to=([^ ]+)/)?.slice(1)),
    [
      ['idle', 'shopping_store'],
      ['shopping_store', 'shopping_store'],
      ['shopping_store', 'receipt_prompt'],
      ['receipt_prompt', 'store_summary'],
      ['store_summary', 'continue_prompt'],
      ['continue_prompt', 'trip_summary'],
      ['trip_summary', 'idle'],
    ],
  );
  assert.match(transitions[0], /route=unknown/);
  assert.match(transitions[0], /device=unknown/);
  assert.match(transitions[0], /sequence=0/);
  assert.match(transitions[0], /version=0/);
  assert.match(transitions[0], /entityIds=t_100,tuna,sams-club/);
  assert.match(transitions[0], /error=none/);
});

test('boot hydration orders durable convergence before session hydration', () => {
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');
  const durableStore = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const durable = layout.indexOf('await hydrateDurable()');
  const session = layout.indexOf('await hydrateSession()');
  const initialSync = durableStore.indexOf('await startSyncEngine()');
  const ready = durableStore.indexOf('set({ hydrated: true })', initialSync);

  assert.ok(durable >= 0);
  assert.ok(session > durable);
  assert.ok(initialSync >= 0);
  assert.ok(ready > initialSync);
  assert.match(layout, /const hydratedSession = useSessionStore/);
  assert.match(layout, /const ready =[^;]*hydratedSession/);
});

test('reset action updates both stores through the lifecycle boundary', () => {
  const sessionStore = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  const shoppingScreen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(sessionStore, /resetShopping:\s*\(\)\s*=>/);
  assert.match(sessionStore, /durable\.resetShoppingList\(\)/);
  assert.match(sessionStore, /set\(\{ session: initialSession/);
  assert.match(shoppingScreen, /onPress:\s*resetShopping/);
});

test('shopping tab remains mounted and renders the idle planner after reset', () => {
  const tabLayout = readFileSync(join(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');
  const shoppingScreen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(tabLayout, /name="shopping"/);
  assert.match(shoppingScreen, /if \(session\.status === 'trip_summary'\)/);
  assert.match(shoppingScreen, /const planEntries = Array\.from\(plan\.entries\(\)\)/);
  assert.doesNotMatch(shoppingScreen, /router\.(?:replace|dismiss|back)\([^)]*RESET/);
});

test('rejected trip start releases the one-shot guard for retry', () => {
  const shoppingScreen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(shoppingScreen, /useSessionStore\.getState\(\)\.session\.tripId !== tripId/);
  assert.match(shoppingScreen, /resetShoppingTripStartGuard\(tripId\)/);
  assert.match(shoppingScreen, /tripStartIdRef\.current = null/);
});
