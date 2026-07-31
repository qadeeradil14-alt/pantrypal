/**
 * Regression suite: the OTA 449 "ghost Sam's Club" post-trip bug.
 *
 * Root cause (see investigation): assignItemToStore/assignItemsToStore only
 * ever ACTIVATE the new store's assignment — they never retire an item's
 * OTHER active assignment left behind at an earlier store whose stop already
 * completed this trip, unbought. clearShoppingEntries only ever deactivates
 * the assignment matching the entry it's clearing (correct in isolation —
 * that's what makes "milk at both Lidl and Aldi" work), so the stale,
 * already-closed-stop assignment survives and gets planted back on the item
 * once the OTHER assignment is cleared, resurrecting a finished store's
 * "ready to shop" plan after the trip ends.
 *
 * Fix: store/durable-store.ts's new `retireStaleCompletedAssignments`,
 * wired into both assignItemToStore and assignItemsToStore. It deactivates
 * an item's other active assignments ONLY when that assignment's store has
 * an already-completed stop in the CURRENT running trip — never touching a
 * still-open store's assignment, so the deliberate multi-store case is
 * unaffected.
 *
 * durable-store.ts itself cannot be imported standalone (AsyncStorage/Expo
 * deps), so — following the exact convention already established in
 * tests/shopping-cross-store-reassignment-guard.test.ts's `clearPurchased`
 * helper — `assignItemToStoreMirror`, `assignItemsToStoreMirror`, and
 * `clearShoppingEntriesMirror` below are transcriptions of durable-store.ts's
 * assignItemToStore / assignItemsToStore / clearShoppingEntries bodies,
 * including the new retireStaleCompletedAssignments call, using the REAL
 * exported pure functions (assignShoppingItemToStore, deactivateShoppingItemStore,
 * hasCompletedStopForStore, purchasedAtStoreThisTrip/purchasedThisTrip,
 * shoppingEntryDraftsFromAssignments) rather than reimplementing their logic.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  hasCompletedStopForStore,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  purchasedAtStoreThisTrip,
  purchasedThisTrip,
} from '../core/services/shoppingDuplicateGuard';
import {
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type { PantryItem, ShoppingStoreAssignment } from '../types';

const SAMS = 'store-sams-club';
const PETCO = 'store-petco';

const mk = (id: string, name: string, storeId: string | null): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
});

// ── Mirrors of store/durable-store.ts, including the new fix ─────────────────

/** Mirrors the new retireStaleCompletedAssignments helper exactly. */
function retireStaleCompletedAssignments(
  assignments: ShoppingStoreAssignment[],
  session: ShoppingSession | null,
  pantryItemId: string,
  newStoreId: string,
): ShoppingStoreAssignment[] {
  if (!session) return assignments;
  return assignments
    .filter((a) => a.pantryItemId === pantryItemId && a.active && a.storeId !== newStoreId)
    .reduce(
      (current, stale) =>
        hasCompletedStopForStore(session, stale.storeId)
          ? deactivateShoppingItemStore(current, pantryItemId, stale.storeId)
          : current,
      assignments,
    );
}

/** Mirrors assignItemToStore, canAssignToStore stubbed to true (allowRepurchase path already proven separately). */
function assignItemToStoreMirror(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  session: ShoppingSession | null,
  id: string,
  storeId: string,
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[] } {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return { items, assignments };
  const nextAssignments = retireStaleCompletedAssignments(
    assignShoppingItemToStore(assignments, item.id, storeId),
    session,
    item.id,
    storeId,
  );
  return {
    assignments: nextAssignments,
    items: items.map((candidate) => candidate.id === id ? { ...candidate, storeId } : candidate),
  };
}

/** Mirrors assignItemsToStore's assignment reduce for a set of ids, mayAssign stubbed true. */
function assignItemsToStoreMirror(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  session: ShoppingSession | null,
  ids: string[],
  storeId: string,
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[] } {
  const idSet = new Set(ids);
  const nextAssignments = ids.reduce((current, id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item
      ? retireStaleCompletedAssignments(
          assignShoppingItemToStore(current, item.id, storeId),
          session,
          item.id,
          storeId,
        )
      : current;
  }, assignments);
  return {
    assignments: nextAssignments,
    items: items.map((item) => idSet.has(item.id) ? { ...item, storeId } : item),
  };
}

/** Mirrors clearShoppingEntries exactly (unchanged by this fix). */
function clearShoppingEntriesMirror(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  entries: { pantryItemId: string; storeId: string }[],
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[] } {
  if (!entries.length) return { items, assignments };
  const pantryItemIds = new Set(entries.map((e) => e.pantryItemId));
  const nextAssignments = entries.reduce(
    (current, entry) => deactivateShoppingItemStore(current, entry.pantryItemId, entry.storeId),
    assignments,
  );
  const remainingStoreByItem = new Map<string, string>();
  for (const a of nextAssignments) {
    if (a.active && pantryItemIds.has(a.pantryItemId)) remainingStoreByItem.set(a.pantryItemId, a.storeId);
  }
  return {
    assignments: nextAssignments,
    items: items.map((item) =>
      pantryItemIds.has(item.id)
        ? {
            ...item,
            status: remainingStoreByItem.has(item.id) ? item.status : 'stocked',
            storeId: remainingStoreByItem.get(item.id) ?? null,
          }
        : item,
    ),
  };
}

// ── 1-5. Full scenario: item unpicked at A, A completes, bought at B, trip finishes ──

function runGhostScenario(useplural: boolean) {
  let items: PantryItem[] = [
    mk('apple', 'Apple', SAMS),
    mk('cod', 'Cod', SAMS),
    mk('dogfood', 'Dog food', PETCO),
  ];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'apple', SAMS, 1);
  assignments = assignShoppingItemToStore(assignments, 'cod', SAMS, 1);
  assignments = assignShoppingItemToStore(assignments, 'dogfood', PETCO, 1);

  let session: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1000,
    entries: shoppingEntryDraftsFromAssignments(items, assignments),
  });

  // Shop Sam's Club: buy Apple, leave Cod UNPICKED.
  for (const e of session.entries.filter((e) => e.storeId === SAMS && e.pantryItemId !== 'cod')) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1100 });
  }
  session = reduce(session, { type: 'FINISH_STORE', now: 1200 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1201, amount: 40, status: 'logged' });
  {
    const stopId = currentStopId(session)!;
    const picked = session.entries.filter((e) => e.stopId === stopId && e.picked);
    ({ items, assignments } = clearShoppingEntriesMirror(items, assignments, picked));
  }

  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });
  assert.equal(session.storeQueue[session.currentIndex], PETCO);

  // At Petco: Cod was left unpicked at Sam's Club, so no duplicate alert fires
  // (purchasedAtStoreThisTrip/purchasedThisTrip both require `picked`).
  assert.equal(purchasedAtStoreThisTrip(session, 'cod', 'Cod', PETCO), null);
  assert.equal(purchasedThisTrip(session, 'cod', 'Cod'), null);

  // Re-add Cod at Petco — the fix under test.
  ({ items, assignments } = useplural
    ? assignItemsToStoreMirror(items, assignments, session, ['cod'], PETCO)
    : assignItemToStoreMirror(items, assignments, session, 'cod', PETCO));

  session = reduce(session, {
    type: 'ADD_ENTRY', now: 1300,
    entry: { pantryItemId: 'cod', name: 'Cod', quantity: 1, unit: 'unit', storeId: PETCO, picked: false },
  });

  // Shop Petco: buy Dog food and Cod.
  for (const e of session.entries.filter((e) => e.storeId === PETCO)) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1400 });
  }
  session = reduce(session, { type: 'FINISH_STORE', now: 1500 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1501, amount: 15, status: 'logged' });
  {
    const stopId = currentStopId(session)!;
    const picked = session.entries.filter((e) => e.stopId === stopId && e.picked);
    ({ items, assignments } = clearShoppingEntriesMirror(items, assignments, picked));
  }

  session = reduce(session, { type: 'FINISH_TRIP', now: 1600 });
  assert.equal(session.status, 'trip_summary');

  return { session, items, assignments };
}

test('assignItemToStore: stale Sam\'s Club assignment is retired when Cod is re-added at Petco', () => {
  const { items, assignments } = runGhostScenario(false);
  const cod = items.find((i) => i.id === 'cod')!;
  const samsAssignment = assignments.find((a) => a.id === 'shopping-store:cod:store-sams-club')!;
  const petcoAssignment = assignments.find((a) => a.id === 'shopping-store:cod:store-petco')!;

  assert.equal(samsAssignment.active, false, 'the stale Sam\'s Club assignment must be inactive');
  assert.equal(petcoAssignment.active, false, 'the Petco assignment must be inactive after purchase and clear');
  assert.equal(cod.storeId, null, 'Cod must have no store assignment after the trip');
  assert.equal(cod.status, 'stocked', 'Cod must be marked stocked, not left low/expiring');
});

test('assignItemToStore: idle shopping plan contains no ghost Sam\'s Club Cod', () => {
  const { items, assignments } = runGhostScenario(false);
  const drafts = shoppingEntryDraftsFromAssignments(items, assignments);
  assert.ok(
    !drafts.some((d) => d.pantryItemId === 'cod'),
    'Cod must not resurface in the idle "ready to shop" plan for any store',
  );
});

test('assignItemsToStore (plural): same fix applies', () => {
  const { items, assignments } = runGhostScenario(true);
  const cod = items.find((i) => i.id === 'cod')!;
  const samsAssignment = assignments.find((a) => a.id === 'shopping-store:cod:store-sams-club')!;
  assert.equal(samsAssignment.active, false, 'assignItemsToStore must also retire the stale Sam\'s Club assignment');
  assert.equal(cod.storeId, null);
  assert.equal(cod.status, 'stocked');
  const drafts = shoppingEntryDraftsFromAssignments(items, assignments);
  assert.ok(!drafts.some((d) => d.pantryItemId === 'cod'), 'no ghost via the plural path either');
});

// ── 6. Same item at two STILL-OPEN stores remains a legitimate, unaffected need ──

test('reassigning to a second store while the first store\'s stop is still open does NOT retire it', () => {
  let items: PantryItem[] = [mk('milk', 'Milk', 'lidl')];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'milk', 'lidl', 1);

  // A trip is running with Lidl still pending (never started, never completed) —
  // e.g. Aldi is the active stop, Lidl hasn't been visited yet.
  let session: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1000,
    entries: [
      { pantryItemId: 'placeholder', name: 'Placeholder', quantity: 1, unit: 'unit', storeId: 'aldi', picked: false },
      { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'lidl', picked: false },
    ],
  });
  assert.equal(session.storeQueue[session.currentIndex], 'aldi');
  assert.equal(hasCompletedStopForStore(session, 'lidl'), false, 'Lidl\'s stop has not completed');

  // Deliberately assign Milk to Aldi too (the legitimate two-open-stores case).
  ({ items, assignments } = assignItemToStoreMirror(items, assignments, session, 'milk', 'aldi'));

  const lidlAssignment = assignments.find((a) => a.id === 'shopping-store:milk:lidl')!;
  assert.equal(lidlAssignment.active, true, 'Lidl\'s still-open assignment must remain active');
  assert.deepEqual(
    shoppingEntryDraftsFromAssignments(items, assignments).map((d) => d.storeId).sort(),
    ['aldi', 'lidl'],
    'Milk is legitimately wanted at both still-open stores',
  );
});

test('reassigning to a second store with no active trip at all does NOT retire anything', () => {
  let items: PantryItem[] = [mk('milk', 'Milk', 'lidl')];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'milk', 'lidl', 1);

  // No trip running (Home-tab store reassignment outside any active session).
  ({ items, assignments } = assignItemToStoreMirror(items, assignments, null, 'milk', 'aldi'));

  const lidlAssignment = assignments.find((a) => a.id === 'shopping-store:milk:lidl')!;
  assert.equal(lidlAssignment.active, true, 'with no active session, nothing is retired');
});

// ── 7. Wiring: the fix is present in durable-store.ts, applied to both functions ──

test('durable-store.ts wires retireStaleCompletedAssignments into both assignItemToStore and assignItemsToStore', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(source, /const retireStaleCompletedAssignments = /);
  assert.match(source, /hasCompletedStopForStore\(session, stale\.storeId\)/);

  const assignItemsBody = source.slice(
    source.indexOf('assignItemsToStore: (ids, storeId, options)'),
    source.indexOf('assignItemToStore: (id, storeId, options)'),
  );
  assert.match(assignItemsBody, /retireStaleCompletedAssignments\(/, 'assignItemsToStore must call the fix');

  const assignItemBody = source.slice(source.indexOf('assignItemToStore: (id, storeId, options)'));
  assert.match(
    assignItemBody.slice(0, assignItemBody.indexOf('\n    },')),
    /retireStaleCompletedAssignments\(/,
    'assignItemToStore must call the fix',
  );

  // clearShoppingEntries itself must remain untouched — the fix must not
  // broaden it to clear all assignments (that was explicitly rejected as
  // the riskier alternative).
  const clearBody = source.slice(
    source.indexOf('clearShoppingEntries: (entries)'),
    source.indexOf('assignItemsToStore: (ids, storeId, options)'),
  );
  assert.doesNotMatch(clearBody, /retireStaleCompletedAssignments/, 'clearShoppingEntries must stay unchanged');
});
