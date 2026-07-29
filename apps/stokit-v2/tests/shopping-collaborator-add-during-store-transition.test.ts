/**
 * P0 regression: items a stay-home collaborator adds to a late-added stop
 * disappeared — both on the collaborator's own device and on the shopper's.
 *
 * Root cause: session-store.ts's applyRemoteSession and durable-store.ts's
 * gateRemoteActiveSession only merged an incoming remote session per-entry
 * when BOTH sides reported the exact same `status` (e.g. both
 * 'shopping_store'). The active shopper's device legitimately advances
 * through receipt_prompt / store_summary / next_store_ready / shopping_store
 * (next stop) — a same-trip status mismatch that is completely normal, not a
 * sign of a stale snapshot. Any mismatch fell through to a blind replace with
 * the remote session, discarding any entry the collaborator had just added
 * locally before it round-tripped through Supabase.
 *
 * Fix: core/services/shoppingEntrySync.ts now exports foldRemoteActiveSession,
 * a single shared fold used by both call sites. It merges (never blind-
 * replaces) any pairing that shares a tripId and where the local side isn't
 * already terminal (idle/trip_summary) — regardless of exact status equality.
 * Remote's status/currentIndex/storeQueue ordering stay authoritative for
 * trip progression; only entries/storeQueue get a non-destructive union.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduce,
  initialSession,
  currentStoreId,
  currentStoreEntries,
  type ShoppingSession,
} from '../core/shopping-machine';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { findDuplicateStore } from '../core/services/storeDuplicates';
import type { ShoppingEntryDraft } from '../types';

const NOW = 1_700_000_000_000;

function threeStoreEntries(): ShoppingEntryDraft[] {
  return [
    { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 's1', picked: false },
    { pantryItemId: 'eggs', name: 'Eggs', quantity: 1, unit: 'unit', storeId: 's2', picked: false },
    { pantryItemId: 'bread', name: 'Bread', quantity: 1, unit: 'unit', storeId: 's3', picked: false },
  ];
}

/** Shopper (Nargis) walks the full 3-store plan and lands on store_summary after the last one. */
function shopperThroughLastPlannedStop(now = NOW): ShoppingSession {
  let s = reduce(initialSession, { type: 'START_TRIP', now, shopperId: 'nargis', entries: threeStoreEntries() });
  s = reduce(s, { type: 'FINISH_STORE', now: now + 10 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: now + 11 });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  s = reduce(s, { type: 'FINISH_STORE', now: now + 20 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: now + 21 });
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'ADVANCE_STORE' });
  s = reduce(s, { type: 'FINISH_STORE', now: now + 30 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: now + 31 });
  return s; // store_summary, no pending stores
}

/** Shopper adds a 4th, unplanned stop mid-trip (the "Costco" scenario). */
function shopperAddsCostco(now = NOW): ShoppingSession {
  const s = shopperThroughLastPlannedStop(now);
  return reduce(s, { type: 'START_MANUAL_STORE', storeId: 'costco' });
}

test('[repro] the exact bug: shopper finishing the late stop before the collaborator\'s push round-trips wipes the collaborator\'s new item under the OLD narrow gate', () => {
  const nargisAfterAddingCostco = shopperAddsCostco();
  let abdul: ShoppingSession = { ...nargisAfterAddingCostco };
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });
  assert.ok(abdul.entries.some((e) => e.pantryItemId === 'tires'), 'sanity: Abdul has the item locally');

  const nargisFinishesCostco = reduce(nargisAfterAddingCostco, { type: 'FINISH_STORE', now: NOW + 40 });
  assert.notEqual(nargisFinishesCostco.status, abdul.status, 'sanity: statuses now differ (shopping_store vs receipt_prompt)');
  assert.equal(nargisFinishesCostco.tripId, abdul.tripId, 'sanity: still the same trip');

  // Reproduce the OLD gate's exact condition inline (the code no longer
  // contains this branch — this proves what would happen without the fix).
  const oldNarrowGateResult = nargisFinishesCostco.status === 'shopping_store'
    ? abdul // would have merged
    : nargisFinishesCostco; // blind replace — this is what actually shipped

  assert.equal(
    oldNarrowGateResult.entries.some((e) => e.pantryItemId === 'tires'),
    false,
    'confirms the OLD narrow status-equality gate loses the collaborator\'s item',
  );
});

test('[fixed] foldRemoteActiveSession preserves a collaborator\'s newly-added item across the shopper\'s status transitions', () => {
  const nargisAfterAddingCostco = shopperAddsCostco();
  assert.equal(currentStoreId(nargisAfterAddingCostco), 'costco');
  assert.equal(currentStoreEntries(nargisAfterAddingCostco).length, 0, 'sanity: "0 of 0" for the freshly-added stop');

  let abdul: ShoppingSession = { ...nargisAfterAddingCostco };
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  // Shopper finishes the Costco stop before Abdul's item has round-tripped back to her.
  const nargisFinishesCostco = reduce(nargisAfterAddingCostco, { type: 'FINISH_STORE', now: NOW + 40 });

  const abdulAfterPull = foldRemoteActiveSession(abdul, nargisFinishesCostco);
  assert.ok(abdulAfterPull.entries.some((e) => e.pantryItemId === 'tires'), 'item survives on the collaborator\'s own device');
  assert.equal(abdulAfterPull.status, 'receipt_prompt', 'shopper\'s progression is still authoritative');
  assert.equal(abdulAfterPull.storeQueue.join(','), 's1,s2,s3,costco');

  // Symmetric: the shopper eventually receives the collaborator's push too.
  const nargisAfterAbdulPush = foldRemoteActiveSession(nargisFinishesCostco, abdul);
  assert.ok(nargisAfterAbdulPush.entries.some((e) => e.pantryItemId === 'tires'), 'item reaches the shopper');
});

test('[fixed] a single item added by the collaborator survives', () => {
  const nargis = shopperAddsCostco();
  let abdul: ShoppingSession = { ...nargis };
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });
  const nargisMoved = reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 });
  const result = foldRemoteActiveSession(abdul, nargisMoved);
  assert.deepEqual(result.entries.map((e) => e.pantryItemId).sort(), ['bread', 'eggs', 'milk', 'tires']);
});

test('[fixed] several items added quickly all survive', () => {
  const nargis = shopperAddsCostco();
  let abdul: ShoppingSession = { ...nargis };
  for (const id of ['tires', 'oil', 'wipers', 'battery']) {
    abdul = reduce(abdul, {
      type: 'ADD_ENTRY',
      entry: { pantryItemId: id, name: id, quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
    });
  }
  const nargisMoved = reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 });
  const result = foldRemoteActiveSession(abdul, nargisMoved);
  for (const id of ['tires', 'oil', 'wipers', 'battery']) {
    assert.ok(result.entries.some((e) => e.pantryItemId === id), `${id} survives`);
  }
});

test('120 member additions cannot move a three-store shopper back to an earlier stop', () => {
  const base = reduce(initialSession, {
    type: 'START_TRIP',
    now: NOW,
    shopperId: 'nargis',
    entries: threeStoreEntries(),
  });
  let member = { ...base };
  let shopper = reduce(base, { type: 'FINISH_STORE', now: NOW + 10 });
  shopper = reduce(shopper, { type: 'SKIP_RECEIPT', now: NOW + 11 });
  shopper = reduce(shopper, { type: 'CONTINUE_TRIP' });
  shopper = reduce(shopper, { type: 'ADVANCE_STORE' });

  for (let i = 0; i < 60; i += 1) {
    member = reduce(member, {
      type: 'ADD_ENTRY',
      now: NOW + 100 + i,
      entry: {
        pantryItemId: `store-2-item-${i}`,
        name: `Store 2 item ${i}`,
        quantity: 1,
        unit: 'unit',
        storeId: 's2',
        picked: false,
      },
    });
    shopper = foldRemoteActiveSession(shopper, member);
  }
  assert.equal(shopper.currentIndex, 1);

  shopper = reduce(shopper, { type: 'FINISH_STORE', now: NOW + 200 });
  shopper = reduce(shopper, { type: 'SKIP_RECEIPT', now: NOW + 201 });
  shopper = reduce(shopper, { type: 'CONTINUE_TRIP' });
  shopper = reduce(shopper, { type: 'ADVANCE_STORE' });

  for (let i = 60; i < 120; i += 1) {
    member = reduce(member, {
      type: 'ADD_ENTRY',
      now: NOW + 300 + i,
      entry: {
        pantryItemId: `store-3-item-${i}`,
        name: `Store 3 item ${i}`,
        quantity: 1,
        unit: 'unit',
        storeId: 's3',
        picked: false,
      },
    });
    shopper = foldRemoteActiveSession(shopper, member);
  }

  assert.equal(shopper.currentIndex, 2, 'the shopper must remain at the third stop');
  assert.equal(shopper.status, 'shopping_store');
  assert.equal(shopper.entries.length, 123, 'all original and member-added entries survive');
});

test('[fixed] collaborator adding while shopper has already advanced to a later status still folds, never blind-replaces', () => {
  const nargis = shopperAddsCostco();
  let abdul: ShoppingSession = { ...nargis };
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });

  // Shopper races further ahead: finish -> skip receipt -> store_summary -> (no more pending) -> nothing left,
  // simulate her finishing the whole trip via FINISH_TRIP_EARLY analog isn't reachable here since no pending
  // stores remain; instead exercise SAVE_RECEIPT to land on store_summary, still same trip, still non-terminal.
  let nargisAhead = reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 });
  nargisAhead = reduce(nargisAhead, { type: 'SAVE_RECEIPT', amount: 42, status: 'logged', now: NOW + 41 });
  assert.equal(nargisAhead.status, 'store_summary');

  const result = foldRemoteActiveSession(abdul, nargisAhead);
  assert.ok(result.entries.some((e) => e.pantryItemId === 'tires'), 'item survives even against store_summary');
});

test('[fixed] a terminal local session (trip_summary) is never merged — the completed trip is preserved as-is', () => {
  const nargis = shopperAddsCostco();
  const completed = reduce(reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 }), {
    type: 'SKIP_RECEIPT',
    now: NOW + 41,
  });
  const finished = reduce(completed, { type: 'FINISH_TRIP', now: NOW + 42 });
  assert.equal(finished.status, 'trip_summary');

  const incomingRemote: ShoppingSession = { ...nargis, entries: [] };
  const result = foldRemoteActiveSession(finished, incomingRemote);
  assert.equal(result, incomingRemote, 'terminal local sessions fall through to the remote value unchanged, per existing clear/preserve policy upstream');
});

test('[fixed] app background/foreground during the write: rehydrating an older local snapshot against a newer durable session still keeps the local-only item', () => {
  // Mirrors session-store.ts's hydrateSession same-trip fold: `saved` = the
  // AsyncStorage blob written right before backgrounding (has the new item
  // locally), `durableSession` = what the app already advanced to before the
  // process was killed / backgrounded (e.g. after a pull arrived while away).
  const nargis = shopperAddsCostco();
  let saved: ShoppingSession = { ...nargis };
  saved = reduce(saved, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });
  const durableSession = reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 });

  const rehydrated = foldRemoteActiveSession(saved, durableSession);
  assert.ok(rehydrated.entries.some((e) => e.pantryItemId === 'tires'), 'item survives a background/foreground rehydrate race');
});

test('[fixed] items persist through a second, later fold (simulated app restart after the fix already applied)', () => {
  const nargis = shopperAddsCostco();
  let abdul: ShoppingSession = { ...nargis };
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco', picked: false },
  });
  const nargisMoved = reduce(nargis, { type: 'FINISH_STORE', now: NOW + 40 });
  const afterFirstPull = foldRemoteActiveSession(abdul, nargisMoved);
  // A second, later pull of the same remote state (e.g. after a restart) must not re-drop it.
  const afterSecondPull = foldRemoteActiveSession(afterFirstPull, nargisMoved);
  assert.ok(afterSecondPull.entries.some((e) => e.pantryItemId === 'tires'));
});

test('[fixed] near-identical store labels (Costco vs Costco Tire Service) do not collide — distinct ids are never merged as duplicates without a stronger identity signal', () => {
  // No placeId/address/coords on either side -> name-only comparison.
  const existing = [{
    id: 'store-costco-original',
    name: 'Costco',
    createdAt: 1,
    updatedAt: 1,
  }] as any;

  const duplicate = findDuplicateStore(existing, { name: 'Costco Tire Service', placeId: undefined, address: undefined, lat: undefined, lng: undefined });
  assert.equal(duplicate, undefined, '"Costco Tire Service" must not be silently matched onto the "Costco" store record');
});

test('[fixed] items attached to a distinct "Costco Tire Service" store id are never filtered into the "Costco" stop\'s list', () => {
  const nargis = shopperAddsCostco(); // her manual stop is storeId "costco"
  let abdul: ShoppingSession = { ...nargis };
  // Abdul mistakenly (or via a second, distinct store record) attaches an item
  // to a different id that merely shares a similar display name.
  abdul = reduce(abdul, {
    type: 'ADD_ENTRY',
    entry: { pantryItemId: 'tires', name: 'Tires', quantity: 1, unit: 'unit', storeId: 'costco-tire-service', picked: false },
  });

  // The item is tracked in the session (storeQueue gains the new id at the
  // END, not at the current position) but must NOT show up in the current
  // stop's ("costco") visible item list — proving why storeId identity, not
  // display-name similarity, is what the UI keys off.
  assert.equal(currentStoreId(abdul), 'costco');
  assert.equal(currentStoreEntries(abdul).some((e) => e.pantryItemId === 'tires'), false);
  assert.ok(abdul.storeQueue.includes('costco-tire-service'), 'the entry is not lost — just attributed to a different stop');
});
