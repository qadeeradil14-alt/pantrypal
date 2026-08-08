/**
 * Regression suite: skipped/unbought stores resurrecting as an idle
 * "Ready to shop" plan after a trip closes (the OTA 451 field report).
 *
 * Root cause: session-store.ts's trip_summary commit block released an
 * unbought item's store by calling `updateItem(item.id, { storeId: null })`.
 * That writes only ONE of the two sources of truth. activeShoppingStoreIds
 * reads the assignment ledger in preference to item.storeId:
 *
 *     if (itemAssignments.length > 0) return [...new Set(assigned)];
 *     return item.storeId ? [item.storeId] : [];
 *
 * so with the ledger entry still `active`, nulling item.storeId was
 * effectively dead code — shoppingEntryDraftsFromAssignments kept rebuilding
 * that store's plan the instant the trip closed. Most visible for a store the
 * shopper explicitly SKIPPED, which reappeared as the active store, but it
 * applied to any item left unbought at any stop.
 *
 * Fix: durable-store.ts's new `releaseStoreAssignment(pantryItemId, storeId)`
 * deactivates the ledger entry AND repoints item.storeId (falling back to
 * another still-active store, exactly like clearShoppingEntries'
 * remainingStoreByItem). session-store.ts's trip_summary block now calls it
 * per unbought trip entry. The item keeps its `low` status — you still need
 * it — it just no longer belongs to a store from the finished trip.
 *
 * durable-store.ts cannot be imported standalone (AsyncStorage/Expo deps), so
 * — following the convention in shopping-cross-store-reassignment-guard.test.ts
 * — the relevant bodies are transcribed below on top of the REAL exported pure
 * helpers (deactivateShoppingItemStore, assignShoppingItemToStore,
 * activeShoppingStoreIds, shoppingEntryDraftsFromAssignments) and the REAL
 * reducer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  initialSession,
  pendingStops,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  activeShoppingStoreIds,
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import { resolveDuplicateState } from '../core/services/shoppingDuplicateGuard';
import type { PantryItem, SharedShoppingSession, ShoppingStoreAssignment } from '../types';

const A = 'store-a';
const B = 'store-b';
const C = 'store-c';

const mk = (id: string, name: string, storeId: string | null): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
});

let clock = 1000;
const tick = () => (clock += 1);

type World = { items: PantryItem[]; assignments: ShoppingStoreAssignment[] };

/** durable-store.ts clearShoppingEntries (unchanged by this fix). */
function clearShoppingEntries(w: World, entries: { pantryItemId: string; storeId: string }[]): World {
  if (!entries.length) return w;
  const ids = new Set(entries.map((e) => e.pantryItemId));
  const assignments = entries.reduce(
    (cur, e) => deactivateShoppingItemStore(cur, e.pantryItemId, e.storeId, tick()),
    w.assignments,
  );
  const remaining = new Map<string, string>();
  for (const a of assignments) if (a.active && ids.has(a.pantryItemId)) remaining.set(a.pantryItemId, a.storeId);
  return {
    assignments,
    items: w.items.map((i) => ids.has(i.id)
      ? { ...i, status: remaining.has(i.id) ? i.status : 'stocked' as const, storeId: remaining.get(i.id) ?? null }
      : i),
  };
}

/** durable-store.ts releaseStoreAssignment — THE FIX. */
function releaseStoreAssignment(w: World, pantryItemId: string, storeId: string): World {
  const item = w.items.find((c) => c.id === pantryItemId);
  if (!item) return w;
  const assignments = deactivateShoppingItemStore(w.assignments, pantryItemId, storeId, tick());
  const remaining = assignments.find((a) => a.active && a.pantryItemId === pantryItemId);
  const nextStoreId = remaining?.storeId ?? null;
  if (assignments === w.assignments && item.storeId === nextStoreId) return w;
  return {
    assignments,
    items: w.items.map((c) => c.id === pantryItemId ? { ...c, storeId: nextStoreId } : c),
  };
}

/**
 * session-store.ts trip_summary commit block, post OTA-453 fix.
 *
 * Classifies each entry by its OWN `picked` state, not by whether its
 * pantryItemId appears anywhere in the picked set. The same item can carry a
 * separate entry per store within one trip (picked at Store A, still pending
 * at Store B) — item-level classification wrongly swept the pending Store B
 * entry into "picked" and left its assignment permanently active, since
 * neither clearShoppingEntries nor releaseStoreAssignment ever reached it.
 */
function tripSummaryCleanup(w: World, next: ShoppingSession): World {
  const picked = next.entries.filter((e) => e.picked);
  const released = next.entries.filter((e) => !e.picked && e.pantryItemId !== '__quick_scan__');
  let out = clearShoppingEntries(w, picked.map((e) => ({ pantryItemId: e.pantryItemId, storeId: e.storeId })));
  for (const e of released) {
    out = releaseStoreAssignment(out, e.pantryItemId, e.storeId);
  }
  return out;
}

/** The Trip.releasedItems this same commit block now records, post-fix. */
function tripReleasedItems(next: ShoppingSession) {
  return next.entries
    .filter((e) => !e.picked && e.pantryItemId !== '__quick_scan__')
    .map((e) => ({ itemId: e.pantryItemId, name: e.name, storeId: e.storeId, price: 0 }));
}

/** session-store.ts store_summary block (per-stop, unchanged by this fix). */
function stopCleanup(w: World, s: ShoppingSession): World {
  const stopId = currentStopId(s)!;
  return clearShoppingEntries(w, s.entries.filter((e) => e.stopId === stopId && e.picked));
}

function completeStop(s: ShoppingSession, w: World, storeId: string, amount: number, pickAll = true) {
  let session = s;
  if (pickAll) {
    for (const e of session.entries.filter((e) => e.storeId === storeId && !e.picked)) {
      session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: tick() });
    }
  }
  session = reduce(session, { type: 'FINISH_STORE', now: tick() });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: tick(), amount, status: 'logged' });
  return { session, world: stopCleanup(w, session) };
}

/** Stores A, B, C. Complete A, skip B, complete C, finish trip. */
function runSkipScenario() {
  let world: World = {
    items: [mk('apple', 'Apple', A), mk('bread', 'Bread', B), mk('cheese', 'Cheese', C)],
    assignments: [],
  };
  for (const [id, store] of [['apple', A], ['bread', B], ['cheese', C]] as const) {
    world = { ...world, assignments: assignShoppingItemToStore(world.assignments, id, store, tick()) };
  }
  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: shoppingEntryDraftsFromAssignments(world.items, world.assignments),
  });

  ({ session, world } = completeStop(session, world, A, 10));
  session = reduce(session, { type: 'SKIP_STORE', storeId: B, now: tick() });
  const afterSkip = session;
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: C });
  ({ session, world } = completeStop(session, world, C, 20));
  const atFinalDecision = session;

  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  const completedTrip = session.completedTrip!;
  world = tripSummaryCleanup(world, session);
  session = reduce(session, { type: 'END_TRIP' });

  return { session, world, completedTrip, afterSkip, atFinalDecision };
}

// ── 1-3. Skipped store never resurrects ──────────────────────────────────────

test('1. skipped Store B never auto-activates after Store C completes', () => {
  const { atFinalDecision } = runSkipScenario();
  assert.notEqual(
    atFinalDecision.storeQueue[atFinalDecision.currentIndex], B,
    'B must never become the active store on its own',
  );
  assert.ok(atFinalDecision.skippedStoreIds.includes(B), 'B stays recorded as skipped');
  assert.deepEqual(
    pendingStops(atFinalDecision).map((s) => s.storeId), [],
    'a skipped store is not a pending stop',
  );
});

test('1b. the finished trip records B as skipped and never visited', () => {
  const { completedTrip } = runSkipScenario();
  assert.deepEqual(completedTrip.skippedStoreIds, [B]);
  assert.deepEqual(completedTrip.storeIdsVisited, [A, C]);
});

test('2. skipped Store B produces no idle plan after the trip closes (restart/hydration)', () => {
  const { world } = runSkipScenario();
  const drafts = shoppingEntryDraftsFromAssignments(world.items, world.assignments);
  assert.deepEqual(
    [...new Set(drafts.map((d) => d.storeId))], [],
    'THE FIX: no ghost store plan is rebuilt from the assignment ledger',
  );
  const bread = world.items.find((i) => i.id === 'bread')!;
  assert.deepEqual(activeShoppingStoreIds(bread, world.assignments), [],
    'the stale B assignment is deactivated, not merely shadowed by a nulled item.storeId');
  assert.equal(bread.storeId, null);
});

test('2b. an unbought item still reads as needed — it just has no store', () => {
  const { world } = runSkipScenario();
  const bread = world.items.find((i) => i.id === 'bread')!;
  assert.equal(bread.status, 'low', 'never bought, so it must NOT be marked stocked');
  assert.equal(bread.storeId, null, 'but it no longer belongs to the finished trip\'s store');
});

test('3. a stale remote push of the closed trip cannot restore the skipped store', () => {
  const { session, atFinalDecision } = runSkipScenario();
  const isClosedTripId = (tripId: string) => tripId === atFinalDecision.tripId;
  const merged = foldRemoteActiveSession(
    session as unknown as SharedShoppingSession,
    atFinalDecision as unknown as SharedShoppingSession,
    isClosedTripId,
  );
  assert.equal(merged.status, 'idle');
  assert.equal(merged.tripId, null);
});

// ── 4-5. Explicit restore paths still work ───────────────────────────────────

test('4. explicit UNSKIP_STORE restores Store B as a pending stop', () => {
  const { afterSkip } = runSkipScenario();
  assert.ok(afterSkip.skippedStoreIds.includes(B));
  const unskipped = reduce(afterSkip, { type: 'UNSKIP_STORE', storeId: B, now: tick() });
  assert.ok(!unskipped.skippedStoreIds.includes(B), 'B is no longer skipped');
  assert.ok(
    pendingStops(unskipped).some((s) => s.storeId === B),
    'B is selectable again after an explicit un-skip',
  );
});

test('5. explicit REOPEN_STORE behaviour is unchanged', () => {
  const { atFinalDecision } = runSkipScenario();
  const stopA = atFinalDecision.completedStopIds[0];
  const reopened = reduce(atFinalDecision, { type: 'REOPEN_STORE', stopId: stopA, now: tick() });
  assert.equal(reopened.status, 'shopping_store');
  assert.equal(reopened.storeQueue[reopened.currentIndex], A, 'reopening A activates a fresh A occurrence');
  assert.ok(reopened.skippedStoreIds.includes(B), 'reopening one store does not un-skip another');
});

// ── 6-8, 10-11. Repurchase paths ─────────────────────────────────────────────

/** Item bought at A; at B during the same trip the shopper adds it again. */
function runActiveTripRepurchase() {
  let world: World = { items: [mk('milk', 'Milk', A), mk('cheese', 'Cheese', B)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', A, tick()) };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'cheese', B, tick()) };
  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: shoppingEntryDraftsFromAssignments(world.items, world.assignments),
  });
  ({ session, world } = completeStop(session, world, A, 5));
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: B });
  return { session, world };
}

test('6. dismissing the duplicate warning mutates nothing', () => {
  const { world } = runActiveTripRepurchase();
  const before = JSON.stringify(world);
  // Dismiss calls reset()+onClose() only — it never reaches writeItems, so no
  // durable action runs at all. Source-guarded in
  // shopping-cross-store-reassignment-guard.test.ts; here we assert the state.
  assert.equal(JSON.stringify(world), before, 'no item or assignment write occurs on Dismiss');
});

test('7. active-trip "Add again" creates exactly one deliberate second-store need', () => {
  let { session, world } = runActiveTripRepurchase();
  world = {
    assignments: assignShoppingItemToStore(world.assignments, 'milk', B, tick()),
    items: world.items.map((i) => i.id === 'milk' ? { ...i, storeId: B, status: 'low' as const } : i),
  };
  session = reduce(session, {
    type: 'ADD_ENTRY', now: tick(),
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: B, picked: false },
  });
  const milk = world.items.find((i) => i.id === 'milk')!;
  assert.deepEqual(activeShoppingStoreIds(milk, world.assignments), [B],
    'exactly one active need, at the store the shopper chose');
  assert.equal(session.entries.filter((e) => e.pantryItemId === 'milk' && e.storeId === B).length, 1,
    'exactly one B occurrence is created');
});

test('10 + 11. after the repurchase is fulfilled the item is stocked, store-less, no duplicate active assignment', () => {
  let { session, world } = runActiveTripRepurchase();
  world = {
    assignments: assignShoppingItemToStore(world.assignments, 'milk', B, tick()),
    items: world.items.map((i) => i.id === 'milk' ? { ...i, storeId: B, status: 'low' as const } : i),
  };
  session = reduce(session, {
    type: 'ADD_ENTRY', now: tick(),
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: B, picked: false },
  });
  ({ session, world } = completeStop(session, world, B, 7));
  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  world = tripSummaryCleanup(world, session);

  const milk = world.items.find((i) => i.id === 'milk')!;
  assert.equal(milk.status, 'stocked');
  assert.equal(milk.storeId, null);
  assert.deepEqual(activeShoppingStoreIds(milk, world.assignments), []);
  assert.equal(world.assignments.filter((a) => a.active).length, 0, 'no duplicate active assignments survive');
  assert.deepEqual(shoppingEntryDraftsFromAssignments(world.items, world.assignments), []);
});

test('8. post-trip re-add creates exactly one new need and raises no duplicate alert', () => {
  // A finished trip leaves activeSession null; the guard is trip-scoped.
  assert.equal(resolveDuplicateState(null, 'milk', 'Milk', A), 'clear',
    'with no running trip nothing is a same-trip duplicate');
  const world: World = {
    items: [{ ...mk('milk', 'Milk', null), status: 'stocked' }],
    assignments: [{ id: `shopping-store:milk:${A}`, pantryItemId: 'milk', storeId: A, active: false, updatedAt: 5 }],
  };
  const after = {
    assignments: assignShoppingItemToStore(world.assignments, 'milk', A, tick()),
    items: world.items.map((i) => i.id === 'milk' ? { ...i, storeId: A, status: 'low' as const } : i),
  };
  assert.equal(after.assignments.filter((a) => a.active).length, 1, 'exactly one new need');
  assert.equal(shoppingEntryDraftsFromAssignments(after.items, after.assignments).length, 1,
    'exactly one new plan entry — not a resurrected trip');
});

// ── 9. Receipts/history immutable ────────────────────────────────────────────

test('9. the completed receipt/trip is untouched by the release cleanup', () => {
  const { completedTrip, session } = runSkipScenario();
  assert.equal(completedTrip.breakdown.find((b) => b.storeId === A)?.itemsBought, 1);
  assert.equal(completedTrip.breakdown.find((b) => b.storeId === C)?.itemsBought, 1);
  assert.equal(completedTrip.breakdown.find((b) => b.storeId === B)?.skipped, true);
  assert.equal(completedTrip.breakdown.find((b) => b.storeId === B)?.itemsBought, 0);
  assert.equal(completedTrip.receiptIds.length, 2, 'both logged receipts survive');
  assert.equal(session.status, 'idle', 'and the session itself is fully reset');
});

// ── 12. The critical non-regression: needs outside the trip must survive ─────

test('12. an assignment to a store OUTSIDE the finished trip is NOT released', () => {
  // Milk is wanted at A (in the trip) and at an unrelated store D (not in it).
  const D = 'store-d';
  let world: World = { items: [mk('milk', 'Milk', A)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', A, tick()) };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', D, tick()) };

  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: [{ pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: A, picked: false }],
  });
  // Trip runs but milk is never bought at A.
  session = reduce(session, { type: 'FINISH_STORE', now: tick() });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: tick() });
  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  world = tripSummaryCleanup(world, session);

  const milk = world.items.find((i) => i.id === 'milk')!;
  assert.deepEqual(activeShoppingStoreIds(milk, world.assignments), [D],
    'the out-of-trip need at D survives; only the trip\'s own store is released');
  assert.equal(milk.storeId, D, 'item.storeId falls back to the surviving store, not null');
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments(world.items, world.assignments).map((d) => d.storeId), [D],
  );
});

test('12b. mid-trip, two still-open stores for the same item are both untouched', () => {
  // The release only runs at trip close; nothing about the mid-trip
  // two-open-stores case changes.
  let world: World = { items: [mk('milk', 'Milk', A)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', A, tick()) };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', B, tick()) };
  const milk = world.items.find((i) => i.id === 'milk')!;
  assert.deepEqual(activeShoppingStoreIds(milk, world.assignments).sort(), [A, B].sort());
});

// ── 13. Cross-device convergence ─────────────────────────────────────────────

test('13. owner and member devices converge on the same post-trip state', () => {
  const owner = runSkipScenario();
  const member = runSkipScenario();
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments(owner.world.items, owner.world.assignments),
    shoppingEntryDraftsFromAssignments(member.world.items, member.world.assignments),
  );
  assert.deepEqual(
    owner.world.assignments.filter((a) => a.active).map((a) => a.id),
    member.world.assignments.filter((a) => a.active).map((a) => a.id),
  );
});

// ── 16-17. Legacy-state convergence and cost ─────────────────────────────────

test('16. a long-lived account with heavy history converges to the same plan as a clean one', () => {
  const N = 5000;
  const legacy: World = { items: [], assignments: [] };
  for (let i = 0; i < N; i++) {
    legacy.items.push({ ...mk(`item${i}`, `Item ${i}`, null), status: 'stocked' });
    legacy.assignments.push({
      id: `shopping-store:item${i}:store-x`, pantryItemId: `item${i}`,
      storeId: 'store-x', active: false, updatedAt: i,
    });
  }
  for (let i = 0; i < 5; i++) {
    legacy.items[i] = { ...legacy.items[i], status: 'low', storeId: A };
    legacy.assignments = assignShoppingItemToStore(legacy.assignments, `item${i}`, A, tick());
  }
  const clean: World = { items: [], assignments: [] };
  for (let i = 0; i < 5; i++) {
    clean.items.push(mk(`item${i}`, `Item ${i}`, A));
    clean.assignments = assignShoppingItemToStore(clean.assignments, `item${i}`, A, tick());
  }
  const legacyPlan = shoppingEntryDraftsFromAssignments(legacy.items, legacy.assignments);
  const cleanPlan = shoppingEntryDraftsFromAssignments(clean.items, clean.assignments);
  assert.equal(legacyPlan.length, cleanPlan.length, 'identical plan size');
  assert.deepEqual(
    legacyPlan.map((d) => `${d.pantryItemId}@${d.storeId}`).sort(),
    cleanPlan.map((d) => `${d.pantryItemId}@${d.storeId}`).sort(),
    'legacy history must not change the current plan',
  );
});

test('17. rebuilding the plan over a large historical ledger is not pathological', () => {
  const N = 5000;
  const items: PantryItem[] = [];
  let assignments: ShoppingStoreAssignment[] = [];
  for (let i = 0; i < N; i++) {
    items.push({ ...mk(`item${i}`, `Item ${i}`, null), status: 'stocked' });
    assignments.push({
      id: `shopping-store:item${i}:store-x`, pantryItemId: `item${i}`,
      storeId: 'store-x', active: false, updatedAt: i,
    });
  }
  for (let i = 0; i < 5; i++) {
    items[i] = { ...items[i], status: 'low', storeId: A };
    assignments = assignShoppingItemToStore(assignments, `item${i}`, A, tick());
  }
  const started = process.hrtime.bigint();
  const plan = shoppingEntryDraftsFromAssignments(items, assignments);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(plan.length, 5);
  assert.ok(ms < 250, `plan rebuild took ${ms}ms — expected well under 250ms for ${N} items`);
});

// ── Wiring guards ────────────────────────────────────────────────────────────

test('durable-store exposes releaseStoreAssignment and scopes it to one store', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(source, /releaseStoreAssignment: \(pantryItemId, storeId\) =>/);
  assert.match(source, /deactivateShoppingItemStore\(assignmentsBefore, pantryItemId, storeId\)/);
  // Must NOT reach for the whole-item variant, which would drop out-of-trip needs.
  const body = source.slice(
    source.indexOf('releaseStoreAssignment: (pantryItemId, storeId) =>'),
    source.indexOf('assignItemsToStore: (ids, storeId, options)'),
  );
  assert.doesNotMatch(body, /deactivateShoppingItemStores\(/,
    'releasing one store must never clear the item\'s entire ledger');
});

test('session-store releases unbought trip entries instead of only nulling item.storeId', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  const block = source.slice(
    source.indexOf("if (next.status === 'trip_summary'"),
    source.indexOf('set({ session: next });'),
  );
  assert.match(block, /durable\.releaseStoreAssignment\(entry\.pantryItemId, entry\.storeId\)/);
  assert.doesNotMatch(block, /updateItem\(item\.id, \{ storeId: null \}\)/,
    'the ledger-blind storeId-only write must not come back');
  assert.match(block, /!entry\.picked/,
    'each entry must be classified by its OWN picked state');
  assert.doesNotMatch(block, /pickedItemIds\.has\(entry\.pantryItemId\)/,
    'item-level membership must not decide which entries get released — the same ' +
    'item can have a separate, still-pending entry at a different store in the same trip');
});

// ── 18-25. OTA 453: same item, two stores, one trip — per-entry classification ──
//
// Two-device SyncDiag proof (owner + member logs, trip t_1786226031075):
// eggs-equivalent items picked at Store A stayed correctly cleared, but a
// SEPARATE, still-pending entry for the same pantryItemId at Store B
// (store_msgkppgg_1z) was excluded from release because its item was already
// in pickedItemIds from the Store A entry. B's assignment stayed active
// through clearShoppingEntries's before/after (verified byte-identical for
// that record) and was never recorded in Trip.releasedItems, so
// protectedByMostRecentClosedTrip had nothing to consult either. The member
// device's later full_apply then carried that stale active B assignment
// over from the owner. Fixed by classifying each entry by its own `picked`
// flag instead of pantryItemId membership.

/** Eggs needed at both A and B; picked at A, left pending at B; trip closes. */
function runSameItemTwoStoresScenario() {
  let world: World = { items: [mk('eggs', 'Eggs', A)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'eggs', A, tick()) };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'eggs', B, tick()) };

  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: shoppingEntryDraftsFromAssignments(world.items, world.assignments),
  });

  ({ session, world } = completeStop(session, world, A, 5)); // eggs picked + bought at A
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: B });
  // At B, eggs is NOT picked — the shopper skips buying it there this trip.
  session = reduce(session, { type: 'FINISH_STORE', now: tick() });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: tick() });
  world = stopCleanup(world, session); // no-op: nothing picked at B's stop

  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  const releasedItems = tripReleasedItems(session);
  world = tripSummaryCleanup(world, session);
  session = reduce(session, { type: 'END_TRIP' });

  return { session, world, releasedItems };
}

test('18. same item at Store A (picked) and Store B (unpicked) in one trip: B assignment is deactivated', () => {
  const { world } = runSameItemTwoStoresScenario();
  const eggs = world.items.find((i) => i.id === 'eggs')!;
  assert.deepEqual(
    activeShoppingStoreIds(eggs, world.assignments), [],
    'THE FIX: the still-pending B entry is no longer wrongly excluded from release',
  );
});

test('19. the B pairing is recorded in Trip.releasedItems', () => {
  const { releasedItems } = runSameItemTwoStoresScenario();
  assert.deepEqual(
    releasedItems.map((r) => ({ itemId: r.itemId, storeId: r.storeId })),
    [{ itemId: 'eggs', storeId: B }],
    'B must be recorded so protectedByMostRecentClosedTrip has something to consult',
  );
});

test('20. the A pairing (picked) is NOT recorded in Trip.releasedItems', () => {
  const { releasedItems } = runSameItemTwoStoresScenario();
  assert.ok(
    !releasedItems.some((r) => r.storeId === A),
    'a store where the item was actually bought must not appear as released',
  );
});

test('21. the A pairing (picked) stays deactivated — bought, not reopened', () => {
  const { world } = runSameItemTwoStoresScenario();
  // Status/storeId bookkeeping around a same-item-two-stores close is a
  // separate, pre-existing concern (out of scope — this fix only changes
  // WHICH entries get released, not clearShoppingEntries' own status logic).
  // What must hold is that A's own assignment record — the one this fix
  // must never touch — stays exactly as clearShoppingEntries left it: bought.
  const eggsAtA = world.assignments.find((a) => a.pantryItemId === 'eggs' && a.storeId === A);
  assert.equal(eggsAtA?.active, false, 'A remains treated as purchased — the trip did buy it');
  assert.equal(world.items.find((i) => i.id === 'eggs')!.storeId, null);
});

test('22. no ghost plan is rebuilt for either store after this trip closes', () => {
  const { world } = runSameItemTwoStoresScenario();
  assert.deepEqual(shoppingEntryDraftsFromAssignments(world.items, world.assignments), []);
});

test('23. single-store picked case is unchanged (regression guard)', () => {
  let world: World = { items: [mk('milk', 'Milk', A)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'milk', A, tick()) };
  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: shoppingEntryDraftsFromAssignments(world.items, world.assignments),
  });
  ({ session, world } = completeStop(session, world, A, 4));
  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  const releasedItems = tripReleasedItems(session);
  world = tripSummaryCleanup(world, session);

  const milk = world.items.find((i) => i.id === 'milk')!;
  assert.equal(milk.status, 'stocked');
  assert.deepEqual(activeShoppingStoreIds(milk, world.assignments), []);
  assert.deepEqual(releasedItems, [], 'a fully-picked single-store trip releases nothing');
});

test('24. single-store unpicked case is unchanged (regression guard)', () => {
  let world: World = { items: [mk('bread', 'Bread', A)], assignments: [] };
  world = { ...world, assignments: assignShoppingItemToStore(world.assignments, 'bread', A, tick()) };
  let session = reduce(initialSession, {
    type: 'START_TRIP', now: tick(), shopperId: 'owner',
    entries: shoppingEntryDraftsFromAssignments(world.items, world.assignments),
  });
  session = reduce(session, { type: 'FINISH_STORE', now: tick() });
  session = reduce(session, { type: 'SKIP_RECEIPT', now: tick() });
  session = reduce(session, { type: 'FINISH_TRIP', now: tick() });
  const releasedItems = tripReleasedItems(session);
  world = tripSummaryCleanup(world, session);

  const bread = world.items.find((i) => i.id === 'bread')!;
  assert.equal(bread.status, 'low', 'never bought, so it must NOT be marked stocked');
  assert.deepEqual(activeShoppingStoreIds(bread, world.assignments), []);
  assert.deepEqual(
    releasedItems.map((r) => ({ itemId: r.itemId, storeId: r.storeId })),
    [{ itemId: 'bread', storeId: A }],
  );
});

test('25. two-device replay of the exact SyncDiag scenario: Store B is inactive on both devices post-close', () => {
  const owner = runSameItemTwoStoresScenario();
  const member = runSameItemTwoStoresScenario();
  for (const { world } of [owner, member]) {
    const eggs = world.items.find((i) => i.id === 'eggs')!;
    assert.deepEqual(activeShoppingStoreIds(eggs, world.assignments), [],
      'Store B must never be active post-close on either replica');
  }
  assert.deepEqual(
    owner.world.assignments.filter((a) => a.active).map((a) => a.id),
    member.world.assignments.filter((a) => a.active).map((a) => a.id),
    'owner and member converge on the same (empty) active-assignment set',
  );
});
