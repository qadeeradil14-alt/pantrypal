import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduce,
  initialSession,
  stopIdForQueueIndex,
  currentStoreId,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  foldRemoteActiveSession,
  reconcileShoppingSession,
} from '../core/services/shoppingEntrySync';
import type { PantryItem, SharedShoppingSession } from '../types';

// Regression suite for "Safeway takes over Costco".
//
// Completing a stop used to null item.storeId for every unpicked / out-of-stock
// item at that stop, as the only way to stop the finished store from being
// re-queued by the item→entry sync paths. Because the Shopping tab's plan
// groups strictly by item.storeId, that erased the completed store from the
// shopping list the instant it was completed — the next store then appeared to
// replace it. session.completedStopIds now blocks reactivation directly, so
// items keep their store assignment and completed stops stay visible.

function item(id: string, name: string, storeId: string | null): PantryItem {
  return {
    id,
    name,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** The Shopping tab's `plan` derivation: group low/expiring items by storeId. */
function shoppingList(items: PantryItem[]): Record<string, string[]> {
  const byStore: Record<string, string[]> = {};
  for (const it of items) {
    if (it.status !== 'low' && it.status !== 'expiring') continue;
    if (!it.storeId) continue;
    byStore[it.storeId] = [...(byStore[it.storeId] ?? []), it.name];
  }
  return byStore;
}

function startAt(storeId: string, items: PantryItem[], now = 1000): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now,
    shopperId: 'owner',
    entries: items.map((i) => ({
      pantryItemId: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      storeId: i.storeId!,
      picked: false,
    })),
  });
}

function completeStore(session: ShoppingSession, now: number): ShoppingSession {
  return reduce(reduce(session, { type: 'FINISH_STORE', now }), {
    type: 'SKIP_RECEIPT',
    now: now + 1,
  });
}

// ── 1. Costco → Safeway ───────────────────────────────────────────────────────

test('Costco stays in the trip and on the shopping list after Safeway is added', () => {
  const items = [item('apple', 'Apple', 'costco'), item('banana', 'Banana', 'costco')];
  let s = startAt('costco', items);
  const costcoStop = stopIdForQueueIndex(s, 0);

  s = completeStore(s, 2000);
  assert.deepEqual(s.completedStopIds, [costcoStop], 'completing Costco records its stop');

  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });

  assert.equal(currentStoreId(s), 'safeway');
  assert.deepEqual(s.storeQueue, ['costco', 'safeway'], 'Safeway is appended, it does not replace Costco');
  assert.equal(
    s.entries.filter((e) => e.stopId === costcoStop).length,
    2,
    'both Costco occurrences survive the move to Safeway',
  );
  // The durable items are untouched by the reducer, and session-store no longer
  // nulls them — so the shopping list still groups them under Costco.
  assert.deepEqual(shoppingList(items), { costco: ['Apple', 'Banana'] });
});

test('an item still assigned to the completed store does not reopen it', () => {
  const items = [item('apple', 'Apple', 'costco')];
  let s = startAt('costco', items);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });

  const before = s;
  s = reduce(s, {
    type: 'ADD_ENTRY',
    now: 3000,
    entry: { pantryItemId: 'apple', name: 'Apple', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  assert.equal(s, before, 're-adding an already-shopped item is a no-op');
  assert.deepEqual(s.storeQueue, ['costco', 'safeway'], 'no phantom second Costco occurrence');
});

// ── 2. Three stores ───────────────────────────────────────────────────────────

test('three stores each complete independently and all stay in the queue', () => {
  const items = [
    item('apple', 'Apple', 'costco'),
    item('bread', 'Bread', 'safeway'),
    item('cheese', 'Cheese', 'target'),
  ];
  let s = startAt('costco', items);
  assert.deepEqual(s.storeQueue, ['costco', 'safeway', 'target']);

  const stops = [0, 1, 2].map((i) => stopIdForQueueIndex(s, i));

  s = completeStore(s, 2000);
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  assert.equal(currentStoreId(s), 'safeway');

  s = completeStore(s, 3000);
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  assert.equal(currentStoreId(s), 'target');

  s = completeStore(s, 4000);

  assert.deepEqual(s.completedStopIds, stops, 'all three stops recorded in visit order');
  assert.deepEqual(s.storeQueue, ['costco', 'safeway', 'target'], 'queue never grew phantom occurrences');
  assert.deepEqual(shoppingList(items), {
    costco: ['Apple'],
    safeway: ['Bread'],
    target: ['Cheese'],
  }, 'every store remains on the shopping list');
});

// ── 3. Revisiting Costco ──────────────────────────────────────────────────────

test('a newly assigned item stays planning-only until the completed store is explicitly revisited', () => {
  let s = startAt('costco', [item('apple', 'Apple', 'costco')]);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });

  s = reduce(s, {
    type: 'ADD_ENTRY',
    now: 3000,
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  assert.deepEqual(s.storeQueue, ['costco', 'safeway']);
  assert.equal(s.entries.some((entry) => entry.pantryItemId === 'milk'), false);

  s = completeStore(s, 3001);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'costco' });
  s = reduce(s, {
    type: 'ADD_ENTRY',
    now: 3002,
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  assert.deepEqual(s.storeQueue, ['costco', 'safeway', 'costco']);
  const revisitStop = stopIdForQueueIndex(s, 2);
  assert.notEqual(revisitStop, stopIdForQueueIndex(s, 0), 'the revisit is a distinct occurrence');
  assert.equal(
    s.entries.find((e) => e.pantryItemId === 'milk')?.stopId,
    revisitStop,
    'Milk joins the revisit, not the completed stop',
  );
  assert.equal(
    s.entries.find((e) => e.pantryItemId === 'apple')?.stopId,
    stopIdForQueueIndex(s, 0),
    'Apple stays on the original completed stop',
  );
});

test('an explicit revisit of a completed store is always allowed', () => {
  let s = startAt('costco', [item('apple', 'Apple', 'costco')]);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'costco' });

  assert.equal(currentStoreId(s), 'costco');
  assert.deepEqual(s.storeQueue, ['costco', 'costco']);
  assert.equal(s.completedStopIds.length, 1, 'only the first occurrence is completed');
});

// ── 4. Owner / member sync ────────────────────────────────────────────────────

test('completedStopIds unions across peers so a stale member cannot reopen a stop', () => {
  const items = [item('apple', 'Apple', 'costco')];
  const started = startAt('costco', items);
  // Owner finished Costco and moved on to Safeway.
  const owner = reduce(completeStore(started, 2000), {
    type: 'START_MANUAL_STORE',
    storeId: 'safeway',
  });
  // The member's device still holds the pre-completion copy of the same trip.
  const member = started;

  const merged = foldRemoteActiveSession(
    member as unknown as SharedShoppingSession,
    owner as unknown as SharedShoppingSession,
  ) as unknown as ShoppingSession;

  assert.deepEqual(
    merged.completedStopIds,
    [stopIdForQueueIndex(started, 0)],
    "the owner's completion survives the merge with a stale member copy",
  );

  // The member now reconciles against its own item list, where Apple is still
  // assigned to Costco. That must not reopen the stop the owner just closed.
  const reconciled = reconcileShoppingSession(
    merged as unknown as SharedShoppingSession,
    items,
  ) as unknown as ShoppingSession;

  assert.deepEqual(reconciled.storeQueue, ['costco', 'safeway'], 'no phantom Costco revisit from the stale peer');
  assert.deepEqual(shoppingList(items), { costco: ['Apple'] }, 'Costco stays on the shared shopping list');
});

// ── 5. Offline → reconnect ────────────────────────────────────────────────────

test('reconciling after reconnect does not re-queue a completed store', () => {
  const items = [item('apple', 'Apple', 'costco'), item('banana', 'Banana', 'costco')];
  let s = startAt('costco', items);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });

  // Reconnect: the full item list arrives again, both items still on Costco.
  const reconciled = reconcileShoppingSession(
    s as unknown as SharedShoppingSession,
    items,
  ) as unknown as ShoppingSession;

  assert.deepEqual(reconciled.storeQueue, ['costco', 'safeway'], 'reconcile does not append Costco again');
  assert.equal(
    reconciled.entries.filter((e) => e.storeId === 'costco').length,
    2,
    'exactly one occurrence per item remains at Costco',
  );
  assert.deepEqual(
    reconciled.completedStopIds,
    [stopIdForQueueIndex(s, 0)],
    'reconcile preserves the completion record rather than dropping it',
  );
  assert.deepEqual(shoppingList(items), { costco: ['Apple', 'Banana'] });
});

test('a peer that completed a different stop contributes it to the union', () => {
  const items = [item('apple', 'Apple', 'costco'), item('bread', 'Bread', 'safeway')];
  const started = startAt('costco', items);
  const costcoStop = stopIdForQueueIndex(started, 0);
  const safewayStop = stopIdForQueueIndex(started, 1);

  // Owner closed Costco and advanced to Safeway.
  let owner = completeStore(started, 2000);
  owner = reduce(owner, { type: 'CONTINUE_TRIP' });
  owner = reduce(owner, { type: 'ADVANCE_STORE' });

  // A member's copy that (implausibly but defensively) records only Safeway.
  const member: ShoppingSession = { ...started, completedStopIds: [safewayStop] };

  const merged = foldRemoteActiveSession(
    member as unknown as SharedShoppingSession,
    owner as unknown as SharedShoppingSession,
  ) as unknown as ShoppingSession;

  assert.deepEqual(
    [...merged.completedStopIds].sort(),
    [costcoStop, safewayStop].sort(),
    'both peers’ completions are unioned, never replaced',
  );
});

test('a legacy session without completedStopIds still reconciles without crashing', () => {
  const items = [item('apple', 'Apple', 'costco')];
  const s = startAt('costco', items);
  const legacy = { ...s } as Partial<ShoppingSession>;
  delete legacy.completedStopIds;

  const reconciled = reconcileShoppingSession(
    legacy as unknown as SharedShoppingSession,
    items,
  ) as unknown as ShoppingSession;

  assert.deepEqual(reconciled.completedStopIds, [], 'absent completedStopIds decodes to empty');
  assert.deepEqual(reconciled.storeQueue, ['costco']);
});
