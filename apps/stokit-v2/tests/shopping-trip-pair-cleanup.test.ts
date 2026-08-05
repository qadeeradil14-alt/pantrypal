import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStoreId,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  finalizeShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
  unpurchasedTripEntries,
} from '../core/services/shoppingStoreAssignments';
import type {
  PantryItem,
  ShoppingEntryDraft,
  ShoppingStoreAssignment,
  Trip,
} from '../types';

const COSTCO = 'store_ms5fnii2_z';
const SAFEWAY = 'store_ms5fna93_x';
const THIRD_STORE = 'store-third';
const EXACT_ITEMS = [
  ['item_ms6e5kt9_7', 'Apple'],
  ['item_ms4ycthl_f', 'Lemon'],
  ['item_ms51bkxw_w', 'Orange'],
  ['item_ms54skbx_16', 'Shrimp'],
  ['item_ms5fe22d_2', 'Tuna'],
] as const;

type World = {
  items: PantryItem[];
  assignments: ShoppingStoreAssignment[];
};

function item(id: string, name: string, storeId = COSTCO): PantryItem {
  return {
    id,
    name,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 1,
    updatedAt: 1,
    statusUpdatedAt: 1,
    statusRevision: 1,
  };
}

function entry(
  pantryItemId: string,
  name: string,
  storeId: string,
): ShoppingEntryDraft {
  return { pantryItemId, name, quantity: 1, unit: 'unit', storeId, picked: false };
}

function makeWorld(
  definitions: readonly (readonly [string, string])[],
  stores = [COSTCO, SAFEWAY],
): World {
  let assignments: ShoppingStoreAssignment[] = [];
  for (const [id] of definitions) {
    for (const storeId of stores) {
      assignments = assignShoppingItemToStore(assignments, id, storeId, 10 + assignments.length);
    }
  }
  return {
    items: definitions.map(([id, name]) => item(id, name)),
    assignments,
  };
}

function startTrip(definitions: readonly (readonly [string, string])[]): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now: 100,
    shopperId: 'owner',
    entries: [
      ...definitions.map(([id, name]) => entry(id, name, COSTCO)),
      ...definitions.map(([id, name]) => entry(id, name, SAFEWAY)),
    ],
  });
}

function completeCurrentStore(
  session: ShoppingSession,
  purchasedIds: ReadonlySet<string>,
  now: number,
): ShoppingSession {
  const storeId = currentStoreId(session);
  let next = session;
  for (const candidate of next.entries.filter(
    (shoppingEntry) => shoppingEntry.storeId === storeId && purchasedIds.has(shoppingEntry.pantryItemId),
  )) {
    next = reduce(next, { type: 'SET_PICK', entryId: candidate.entryId, picked: true, now: now++ });
  }
  next = reduce(next, { type: 'FINISH_STORE', now: now++ });
  return reduce(next, { type: 'SAVE_RECEIPT', amount: 10, status: 'logged', now });
}

function finishTwoStoreTrip(
  definitions: readonly (readonly [string, string])[],
  costcoPurchases: ReadonlySet<string>,
  safewayPurchases: ReadonlySet<string>,
): ShoppingSession {
  let session = startTrip(definitions);
  assert.equal(currentStoreId(session), COSTCO);
  session = completeCurrentStore(session, costcoPurchases, 200);
  session = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: SAFEWAY });
  assert.equal(currentStoreId(session), SAFEWAY);
  session = completeCurrentStore(session, safewayPurchases, 300);
  session = reduce(session, { type: 'FINISH_TRIP', now: 400 });
  assert.equal(session.status, 'trip_summary');
  assert.ok(session.completedTrip);
  return session;
}

function applyPairCleanup(world: World, session: ShoppingSession): World {
  const trip = session.completedTrip as Trip;
  let assignments = world.assignments;
  for (const shoppingEntry of unpurchasedTripEntries(session.entries, trip.purchasedItems)) {
    assignments = deactivateShoppingItemStore(
      assignments,
      shoppingEntry.pantryItemId,
      shoppingEntry.storeId,
      500,
    );
  }
  for (const purchased of trip.purchasedItems) {
    assignments = finalizeShoppingItemStore(
      assignments,
      purchased.itemId,
      purchased.storeId,
      trip.id,
      trip.completedAt,
    );
  }

  const purchasedItemIds = new Set(trip.purchasedItems.map((purchased) => purchased.itemId));
  const participantItemIds = new Set(session.entries.map((shoppingEntry) => shoppingEntry.pantryItemId));
  const items = world.items.map((candidate) => {
    if (!participantItemIds.has(candidate.id)) return candidate;
    const remaining = assignments.find(
      (assignment) => assignment.active && assignment.pantryItemId === candidate.id,
    );
    if (remaining) return { ...candidate, status: 'low' as const, storeId: remaining.storeId };
    if (!purchasedItemIds.has(candidate.id)) return { ...candidate, status: 'low' as const, storeId: null };
    return {
      ...candidate,
      status: 'stocked' as const,
      storeId: null,
      statusClosedTripId: trip.id,
    };
  });
  return { items, assignments };
}

function activePairs(world: World): string[] {
  return world.assignments
    .filter((assignment) => assignment.active)
    .map((assignment) => `${assignment.pantryItemId}@${assignment.storeId}`)
    .sort();
}

test('pre-fix defect: item-only cleanup skips Costco when the same item was purchased at Safeway', () => {
  const session = finishTwoStoreTrip(EXACT_ITEMS, new Set(), new Set(EXACT_ITEMS.map(([id]) => id)));
  const pickedItemIds = new Set(session.entries.filter((candidate) => candidate.picked).map((candidate) => candidate.pantryItemId));
  const oldReleasePairs = session.entries
    .filter((candidate) => !pickedItemIds.has(candidate.pantryItemId))
    .map((candidate) => `${candidate.pantryItemId}@${candidate.storeId}`);
  assert.deepEqual(oldReleasePairs, []);
  assert.equal(unpurchasedTripEntries(session.entries, session.completedTrip!.purchasedItems).length, 5);
});

test('A: exact Costco/Safeway field failure releases five unpurchased Costco pairs', () => {
  const purchasedAtSafeway = new Set(EXACT_ITEMS.map(([id]) => id));
  const session = finishTwoStoreTrip(EXACT_ITEMS, new Set(), purchasedAtSafeway);
  const final = applyPairCleanup(makeWorld(EXACT_ITEMS), session);

  assert.deepEqual(
    session.completedTrip!.purchasedItems.map(({ itemId, storeId }) => `${itemId}@${storeId}`).sort(),
    EXACT_ITEMS.map(([id]) => `${id}@${SAFEWAY}`).sort(),
  );
  assert.deepEqual(activePairs(final), []);
  assert.ok(final.items.every((candidate) => candidate.status === 'stocked' && candidate.storeId === null));
  assert.deepEqual(shoppingEntryDraftsFromAssignments(final.items, final.assignments), []);
  assert.equal(session.receipts.length, 2);
  assert.equal(session.completedTrip!.breakdown.length, 2);
});

test('B: reverse order releases Safeway when the pair was purchased only at Costco', () => {
  const definition = [EXACT_ITEMS[0]] as const;
  const session = finishTwoStoreTrip(definition, new Set([definition[0][0]]), new Set());
  const final = applyPairCleanup(makeWorld(definition), session);
  assert.deepEqual(activePairs(final), []);
  assert.equal(final.items[0].status, 'stocked');
  assert.equal(final.items[0].storeId, null);
});

test('C: partial overlap releases only each exact unpurchased sibling pair', () => {
  const definitions = [EXACT_ITEMS[0], EXACT_ITEMS[1]] as const;
  const session = finishTwoStoreTrip(
    definitions,
    new Set([definitions[0][0]]),
    new Set([definitions[1][0]]),
  );
  const released = unpurchasedTripEntries(session.entries, session.completedTrip!.purchasedItems)
    .map((candidate) => `${candidate.pantryItemId}@${candidate.storeId}`)
    .sort();
  assert.deepEqual(released, [
    `${definitions[0][0]}@${SAFEWAY}`,
    `${definitions[1][0]}@${COSTCO}`,
  ].sort());
});

test('D: assignment to a store outside the completed trip remains untouched', () => {
  const definition = [EXACT_ITEMS[0]] as const;
  const session = finishTwoStoreTrip(definition, new Set(), new Set([definition[0][0]]));
  const final = applyPairCleanup(makeWorld(definition, [COSTCO, SAFEWAY, THIRD_STORE]), session);
  assert.deepEqual(activePairs(final), [`${definition[0][0]}@${THIRD_STORE}`]);
  assert.equal(final.items[0].status, 'low');
  assert.equal(final.items[0].storeId, THIRD_STORE);
});

test('E: neither pair purchased releases both trip assignments but keeps the item low and unassigned', () => {
  const definition = [EXACT_ITEMS[0]] as const;
  const session = finishTwoStoreTrip(definition, new Set(), new Set());
  const final = applyPairCleanup(makeWorld(definition), session);
  assert.deepEqual(activePairs(final), []);
  assert.equal(final.items[0].status, 'low');
  assert.equal(final.items[0].storeId, null);
});

test('F: both pairs purchased are terminal and no assignment reopens', () => {
  const definition = [EXACT_ITEMS[0]] as const;
  const purchased = new Set([definition[0][0]]);
  const session = finishTwoStoreTrip(definition, purchased, purchased);
  const final = applyPairCleanup(makeWorld(definition), session);
  assert.deepEqual(unpurchasedTripEntries(session.entries, session.completedTrip!.purchasedItems), []);
  assert.deepEqual(activePairs(final), []);
  assert.equal(final.items[0].status, 'stocked');
  assert.equal(final.items[0].statusClosedTripId, session.completedTrip!.id);
});

test('G: trip_summary exposes no completed-trip store on Home', () => {
  const session = finishTwoStoreTrip(EXACT_ITEMS, new Set(), new Set(EXACT_ITEMS.map(([id]) => id)));
  const final = applyPairCleanup(makeWorld(EXACT_ITEMS), session);
  assert.equal(session.status, 'trip_summary');
  assert.deepEqual(shoppingEntryDraftsFromAssignments(final.items, final.assignments), []);
});

test('H: pair-cleaned state survives serialization and converges identically on a second device', () => {
  const session = finishTwoStoreTrip(EXACT_ITEMS, new Set(), new Set(EXACT_ITEMS.map(([id]) => id)));
  const local = applyPairCleanup(makeWorld(EXACT_ITEMS), session);
  const restarted = JSON.parse(JSON.stringify(local)) as World;
  const secondDevice = JSON.parse(JSON.stringify(restarted)) as World;
  assert.deepEqual(secondDevice, restarted);
  assert.deepEqual(activePairs(secondDevice), activePairs(local));
  assert.deepEqual(
    secondDevice.items.map(({ id, status, storeId }) => ({ id, status, storeId })),
    local.items.map(({ id, status, storeId }) => ({ id, status, storeId })),
  );
  assert.deepEqual(shoppingEntryDraftsFromAssignments(secondDevice.items, secondDevice.assignments), []);
});

test('session-store releases exact unpurchased pairs before commitTrip and does not rerun item cleanup afterward', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  const start = source.indexOf("if (next.status === 'trip_summary'");
  const block = source.slice(start, source.indexOf('\n    }', start) + 6);
  assert.match(block, /unpurchasedTripEntries\(next\.entries, next\.completedTrip\.purchasedItems\)/);
  assert.doesNotMatch(block, /pickedItemIds/);
  assert.ok(block.indexOf('releaseStoreAssignment') < block.indexOf('commitTrip'));
  assert.doesNotMatch(block.slice(block.indexOf('commitTrip')), /clearShoppingEntries/);
});
