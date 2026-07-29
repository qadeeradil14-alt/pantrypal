import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import { shoppingGroups } from '../core/services/shoppingGroups';
import {
  foldRemoteActiveSession,
  reconcileShoppingSession,
} from '../core/services/shoppingEntrySync';
import { newestRemainingOccurrenceStoreId } from '../core/services/shoppingOccurrence';
import type { PantryItem, SharedShoppingSession } from '../types';

// While a trip is active the grouped store view reads shopping occurrences
// (pantryItemId + stopId), not PantryItem.storeId. PantryItem.storeId is a
// single scalar, so adding Apple at a second store reassigns it away from the
// first — which used to collapse Apple@Costco and Apple@Safeway into one row
// and make Costco disappear. These tests pin the occurrence-derived view.

function mk(id: string, name: string, storeId: string | null): PantryItem {
  return {
    id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
    storeId, expiryDate: null, createdAt: 0, updatedAt: 0,
  };
}

function startAt(items: PantryItem[], now = 1000): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now,
    shopperId: 'owner',
    entries: items.map((i) => ({
      pantryItemId: i.id, name: i.name, quantity: i.quantity,
      unit: i.unit, storeId: i.storeId!, picked: false,
    })),
  });
}

function completeStore(s: ShoppingSession, now: number): ShoppingSession {
  return reduce(reduce(s, { type: 'FINISH_STORE', now }), { type: 'SKIP_RECEIPT', now: now + 1 });
}

/** What AddItemSheet does: reassign the existing item, then add the occurrence. */
function addAtCurrentStore(
  s: ShoppingSession,
  items: PantryItem[],
  id: string,
  name: string,
  storeId: string,
  now: number,
): { session: ShoppingSession; items: PantryItem[] } {
  const nextItems = items.map((i) => (i.id === id ? { ...i, storeId } : i));
  const session = reduce(s, {
    type: 'ADD_ENTRY',
    now,
    entry: { pantryItemId: id, name, quantity: 1, unit: 'unit', storeId, picked: false },
  });
  return { session, items: nextItems };
}

/** Flatten groups to `store -> item names` for readable assertions. */
function view(groups: ReturnType<typeof shoppingGroups>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of groups) out[g.storeId] = g.items.map((i) => i.name);
  return out;
}

// ── Same item under two stores ────────────────────────────────────────────────

function costcoThenSafeway() {
  let items = [mk('apple', 'Apple', 'costco'), mk('banana', 'Banana', 'costco')];
  let s = startAt(items);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });
  for (const [id, name] of [['apple', 'Apple'], ['banana', 'Banana']] as const) {
    const r = addAtCurrentStore(s, items, id, name, 'safeway', 3000);
    s = r.session;
    items = r.items;
  }
  return { session: s, items };
}

test('Apple appears under both Costco and Safeway simultaneously', () => {
  const { session, items } = costcoThenSafeway();

  // The pantry item itself now points only at Safeway — that is expected, and
  // exactly why the view must not be derived from it.
  assert.equal(items.find((i) => i.id === 'apple')!.storeId, 'safeway');

  const grouped = view(shoppingGroups(session, items));
  assert.ok(grouped.costco?.includes('Apple'), 'Apple still listed under Costco');
  assert.ok(grouped.safeway?.includes('Apple'), 'Apple also listed under Safeway');
});

test('Banana appears under both Costco and Safeway simultaneously', () => {
  const { session, items } = costcoThenSafeway();
  const grouped = view(shoppingGroups(session, items));

  assert.ok(grouped.costco?.includes('Banana'), 'Banana still listed under Costco');
  assert.ok(grouped.safeway?.includes('Banana'), 'Banana also listed under Safeway');
});

test('Costco → Safeway yields two groups and four independent occurrences', () => {
  const { session, items } = costcoThenSafeway();
  const groups = shoppingGroups(session, items);

  assert.equal(groups.length, 2, 'Costco and Safeway are both present');
  assert.deepEqual(groups.map((g) => g.storeId), ['costco', 'safeway'], 'groups follow queue order');
  assert.equal(
    groups.reduce((n, g) => n + g.items.length, 0),
    4,
    'four independent shopping occurrences',
  );
  const entryIds = groups.flatMap((g) => g.items.map((i) => i.entryId));
  assert.equal(new Set(entryIds).size, 4, 'every occurrence has a distinct entryId');
});

// ── Three stores ──────────────────────────────────────────────────────────────

test('the same item spans three stores as three occurrences', () => {
  let items = [mk('apple', 'Apple', 'costco')];
  let s = startAt(items);

  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });
  let r = addAtCurrentStore(s, items, 'apple', 'Apple', 'safeway', 3000);
  s = r.session; items = r.items;

  s = completeStore(s, 4000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'target' });
  r = addAtCurrentStore(s, items, 'apple', 'Apple', 'target', 5000);
  s = r.session; items = r.items;

  const groups = shoppingGroups(s, items);
  assert.deepEqual(groups.map((g) => g.storeId), ['costco', 'safeway', 'target']);
  assert.deepEqual(
    groups.map((g) => g.items.map((i) => i.name)),
    [['Apple'], ['Apple'], ['Apple']],
    'Apple is an independent occurrence at each of the three stops',
  );
  assert.equal(items.find((i) => i.id === 'apple')!.storeId, 'target', 'pantry schema untouched: still one scalar storeId');
});

// ── Idle falls back to the pantry plan ────────────────────────────────────────

test('with no active trip the view falls back to pantry storeId grouping', () => {
  const items = [mk('apple', 'Apple', 'costco'), mk('bread', 'Bread', 'safeway')];
  const grouped = view(shoppingGroups(initialSession, items));

  assert.deepEqual(grouped, { costco: ['Apple'], safeway: ['Bread'] });
});

test('a revisited store renders as two separate groups', () => {
  let items = [mk('apple', 'Apple', 'costco')];
  let s = startAt(items);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'costco' });
  const r = addAtCurrentStore(s, items, 'milk', 'Milk', 'costco', 3000);
  s = r.session;
  items = [...r.items, mk('milk', 'Milk', 'costco')];

  const groups = shoppingGroups(s, items);
  assert.equal(groups.length, 2, 'each visit to Costco is its own group');
  assert.deepEqual(groups.map((g) => g.storeId), ['costco', 'costco']);
  assert.notEqual(groups[0].key, groups[1].key, 'groups are keyed by stopId, not storeId');
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.name)), [['Apple'], ['Milk']]);
});

test('removing either store occurrence preserves the sibling and a valid pantry store', () => {
  const { session } = costcoThenSafeway();
  const [costco, safeway] = session.entries.filter((entry) => entry.pantryItemId === 'apple');

  const withoutSafeway = reduce(session, {
    type: 'REMOVE_ENTRY',
    entryId: safeway.entryId,
    now: 4000,
  });
  assert.equal(withoutSafeway.entries.some((entry) => entry.entryId === costco.entryId), true);
  assert.equal(newestRemainingOccurrenceStoreId(withoutSafeway.entries, 'apple'), 'costco');

  const withoutCostco = reduce(session, {
    type: 'REMOVE_ENTRY',
    entryId: costco.entryId,
    now: 4000,
  });
  assert.equal(withoutCostco.entries.some((entry) => entry.entryId === safeway.entryId), true);
  assert.equal(newestRemainingOccurrenceStoreId(withoutCostco.entries, 'apple'), 'safeway');
});

test('removing one repeated-store visit leaves the other stop independent', () => {
  let items = [mk('apple', 'Apple', 'costco')];
  let session = startAt(items);
  session = completeStore(session, 2000);
  session = reduce(session, { type: 'START_MANUAL_STORE', storeId: 'costco' });
  const added = addAtCurrentStore(session, items, 'apple', 'Apple', 'costco', 3000);
  session = added.session;
  const [first, second] = session.entries.filter((entry) => entry.pantryItemId === 'apple');

  const removed = reduce(session, {
    type: 'REMOVE_ENTRY',
    entryId: second.entryId,
    now: 4000,
  });
  assert.equal(removed.entries.some((entry) => entry.entryId === first.entryId), true);
  assert.equal(removed.entries.some((entry) => entry.entryId === second.entryId), false);
});

// ── The active-trip render path must not read PantryItem.storeId ──────────────

const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

test('the in-trip stops overview is derived from shopping occurrences', () => {
  assert.match(
    screen,
    /function TripStopsOverview[\s\S]{0,600}?shoppingGroups\(session, \[\]\)/,
    'TripStopsOverview must group session occurrences, not pantry items',
  );
});

test('the grouped store view no longer maps a storeId-keyed plan', () => {
  assert.doesNotMatch(
    screen,
    /planEntries/,
    'planEntries was the PantryItem.storeId grouping — the view now uses planGroups',
  );
  assert.match(screen, /planGroups\.map/, 'the grouped list renders from planGroups');
});

test('arriving at an empty new stop keeps the previous stop on screen', () => {
  const items = [mk('apple', 'Apple', 'costco'), mk('banana', 'Banana', 'costco')];
  let s = startAt(items);
  s = completeStore(s, 2000);
  s = reduce(s, { type: 'START_MANUAL_STORE', storeId: 'safeway' });

  // Safeway holds no occurrences yet, but both stops remain visible.
  const groups = shoppingGroups(s, items);
  assert.deepEqual(groups.map((g) => g.storeId), ['costco', 'safeway']);
  assert.deepEqual(groups[0].items.map((i) => i.name), ['Apple', 'Banana']);
  assert.deepEqual(groups[1].items, []);

  // The overview must therefore gate on stop count, not group count, or the
  // whole section vanishes and takes Costco with it.
  assert.equal(s.storeQueue.length, 2, 'two stops exist even though one is empty');
  assert.match(
    screen,
    /if \(session\.storeQueue\.length <= 1\) return null;/,
    'TripStopsOverview must hide only for a genuinely single-stop trip',
  );
});

test('the in-trip edit sheet labels the stop being shopped, not the item’s store', () => {
  const editSheet = readFileSync(
    join(process.cwd(), 'components/shopping/ShoppingItemEditSheet.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    screen,
    /store=\{editingItem\?\.storeId \? storeById\(editingItem\.storeId\) : undefined\}/,
    "the edit sheet must not label rows with the pantry item's own storeId",
  );
  assert.match(
    screen,
    /<View key=\{occurrence\.entryId!\}>/,
    'active overview rows must use occurrence entryId',
  );
  assert.match(
    editSheet,
    /const occurrenceItem = item && store[\s\S]{0,100}?storeId: store\.id/,
    'the nested store picker must also select the occurrence stop',
  );
  assert.match(editSheet, /<StorePickerSheet[\s\S]{0,80}?item=\{occurrenceItem\}/);
});

test('REMOVE_ENTRY restores PantryItem.storeId from a surviving occurrence', () => {
  const sessionStore = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  assert.match(
    sessionStore,
    /newestRemainingOccurrenceStoreId\(next\.entries, removedEntry\.pantryItemId\)/,
  );
});

// ── Owner / member sync still converges ───────────────────────────────────────

test('owner and member converge on the same grouped view', () => {
  const { session: owner, items } = costcoThenSafeway();
  // The member's device holds an older copy of the same trip.
  const member = startAt([mk('apple', 'Apple', 'costco'), mk('banana', 'Banana', 'costco')]);

  const merged = foldRemoteActiveSession(
    member as unknown as SharedShoppingSession,
    owner as unknown as SharedShoppingSession,
  ) as unknown as ShoppingSession;

  assert.deepEqual(
    view(shoppingGroups(merged, items)),
    view(shoppingGroups(owner, items)),
    'the merged session renders the same groups as the owner',
  );
  assert.equal(merged.entries.length, 4, 'all four occurrences survive the merge');
});

// ── Offline reconnect still converges ─────────────────────────────────────────

test('reconnecting reconciles without collapsing occurrences', () => {
  const { session, items } = costcoThenSafeway();

  const reconciled = reconcileShoppingSession(
    session as unknown as SharedShoppingSession,
    items,
  ) as unknown as ShoppingSession;

  assert.equal(reconciled.entries.length, 4, 'reconcile preserves all four occurrences');
  assert.deepEqual(
    view(shoppingGroups(reconciled, items)),
    { costco: ['Apple', 'Banana'], safeway: ['Apple', 'Banana'] },
    'both stores still render after reconnect',
  );
  assert.deepEqual(reconciled.storeQueue, ['costco', 'safeway'], 'no phantom stop was appended');
});
