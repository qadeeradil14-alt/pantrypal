/**
 * Regression suite: item-level duplicate protection.
 *
 * Reported: a shopper bought items at Lidl, completed the stop, then
 * accidentally added the same items again. Lidl silently reappeared as a
 * planning list, and once the remaining stores completed it showed up as
 * another stop with the repeated items.
 *
 * Root cause was not identity collision — addItem already dedupes by
 * normalized name and the assignment ledger is keyed by pantryItemId+storeId.
 * It was that completing a stop DEACTIVATES the purchased assignments
 * (clearShoppingEntries) while assignShoppingItemToStore REACTIVATES a
 * deactivated assignment unconditionally, with no awareness that the pair was
 * already bought on the running trip.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  currentStopId,
  initialSession,
  reduce,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  duplicatePurchaseMessage,
  isAlreadyPurchasedThisTrip,
  purchasedAtStoreThisTrip,
  shoppingDuplicateKey,
  UNLINKED_PANTRY_ITEM_ID,
} from '../core/services/shoppingDuplicateGuard';
import {
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  mergeShoppingStoreAssignments,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type { PantryItem, SharedShoppingSession, ShoppingStoreAssignment } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mk = (id: string, name: string, storeId: string | null): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
});

function homeLists(items: PantryItem[], assignments: ShoppingStoreAssignment[]): Record<string, string[]> {
  const by: Record<string, string[]> = {};
  for (const d of shoppingEntryDraftsFromAssignments(items, assignments)) {
    (by[d.storeId] ??= []).push(d.name);
  }
  return by;
}

/** Replicates durable-store.clearShoppingEntries for the purchased entries. */
function purchase(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  entries: { pantryItemId: string; storeId: string }[],
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[] } {
  const ids = new Set(entries.map((e) => e.pantryItemId));
  const next = entries.reduce(
    (cur, e) => deactivateShoppingItemStore(cur, e.pantryItemId, e.storeId, 500),
    assignments,
  );
  const remaining = new Map<string, string>();
  for (const a of next) if (a.active && ids.has(a.pantryItemId)) remaining.set(a.pantryItemId, a.storeId);
  return {
    assignments: next,
    items: items.map((i) => ids.has(i.id)
      ? { ...i, status: remaining.has(i.id) ? i.status : 'stocked' as const, storeId: remaining.get(i.id) ?? null }
      : i),
  };
}

/** Replicates durable-store.addItem's existing-item branch, guard included. */
function addItemWithGuard(
  state: { items: PantryItem[]; assignments: ShoppingStoreAssignment[] },
  session: SharedShoppingSession | null,
  name: string,
  storeId: string,
  quantity = 1,
  allowRepurchase = false,
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[]; reactivated: boolean } {
  const existing = state.items.find((i) => i.name.toLowerCase() === name.toLowerCase())!;
  const mayAssign = allowRepurchase
    || !isAlreadyPurchasedThisTrip(session, existing.id, name, storeId);
  return {
    items: state.items.map((i) => i.id === existing.id ? { ...i, quantity, status: 'low' as const } : i),
    assignments: mayAssign
      ? assignShoppingItemToStore(state.assignments, existing.id, storeId, 900)
      : state.assignments,
    reactivated: mayAssign,
  };
}

/** Trip through Lidl (bought, completed) with Aldi still pending. */
function lidlBoughtAndCompleted() {
  let items = [mk('milk', 'Milk', 'lidl'), mk('eggs', 'Eggs', 'lidl'), mk('rice', 'Rice', 'aldi')];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'milk', 'lidl', 10);
  assignments = assignShoppingItemToStore(assignments, 'eggs', 'lidl', 11);
  assignments = assignShoppingItemToStore(assignments, 'rice', 'aldi', 12);

  let s = reduce(initialSession, {
    type: 'START_TRIP',
    entries: shoppingEntryDraftsFromAssignments(items, assignments),
    now: 1000,
    shopperId: 'owner',
  });
  for (const e of s.entries.filter((e) => e.storeId === 'lidl')) {
    s = reduce(s, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: 1100 });
  }
  const lidlStop = currentStopId(s)!;
  const picked = s.entries.filter((e) => e.stopId === lidlStop && e.picked);
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 23.4, status: 'logged', now: 2001 });
  ({ items, assignments } = purchase(items, assignments, picked));
  return { session: s, items, assignments, lidlStop };
}

// ── 1 & 2. Pending duplicates: one entry, no quantity inflation ───────────────

test('adding a pending item twice to the same store keeps exactly one entry', () => {
  const items = [mk('milk', 'Milk', 'lidl')];
  let assignments = assignShoppingItemToStore([], 'milk', 'lidl', 10);
  const before = assignments;

  assignments = assignShoppingItemToStore(assignments, 'milk', 'lidl', 20);

  assert.equal(assignments, before, 'an already-active assignment is returned untouched');
  assert.equal(assignments.filter((a) => a.pantryItemId === 'milk' && a.storeId === 'lidl').length, 1);
  assert.deepEqual(homeLists(items, assignments), { lidl: ['Milk'] });
});

test('repeated taps set the quantity rather than accumulating it', () => {
  const state = { items: [mk('milk', 'Milk', 'lidl')], assignments: assignShoppingItemToStore([], 'milk', 'lidl', 10) };

  let next = addItemWithGuard(state, null, 'Milk', 'lidl', 3);
  next = addItemWithGuard(next, null, 'Milk', 'lidl', 3);
  next = addItemWithGuard(next, null, 'Milk', 'lidl', 3);

  assert.equal(next.items.find((i) => i.id === 'milk')!.quantity, 3, 'quantity is overwritten, never summed');
  assert.deepEqual(homeLists(next.items, next.assignments), { lidl: ['Milk'] }, 'still one row');
});

// ── 3 & 4. Already purchased: warn, and Dismiss changes nothing ───────────────

test('re-adding an item purchased at that store this trip is reported as a duplicate', () => {
  const { session, lidlStop } = lidlBoughtAndCompleted();

  const dup = purchasedAtStoreThisTrip(session, 'milk', 'Milk', 'lidl');

  assert.ok(dup, 'the purchase is detected');
  assert.equal(dup!.stopId, lidlStop, 'and is attributed to the completed stop');
  assert.equal(
    duplicatePurchaseMessage(['Milk'], 'Lidl'),
    'Milk was already bought at Lidl.',
  );
  assert.equal(
    duplicatePurchaseMessage(['Milk', 'Eggs'], 'Lidl'),
    'Milk and Eggs were already bought at Lidl.',
  );
});

test('Dismiss leaves state untouched and the completed store stays gone', () => {
  const { session, items, assignments } = lidlBoughtAndCompleted();
  const snapshot = JSON.stringify({ items, assignments });

  // Dismiss is simply "do not write" — the guard also refuses on its own.
  const next = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl');

  assert.equal(next.reactivated, false, 'the assignment is not silently reactivated');
  assert.equal(JSON.stringify({ items, assignments }), snapshot, 'no mutation occurred');
  assert.deepEqual(homeLists(items, assignments), { aldi: ['Rice'] }, 'Lidl does not return');
});

// ── 5. Explicit Add again ─────────────────────────────────────────────────────

test('explicit Add again creates one Home planning entry and no implicit revisit', () => {
  const { session, items, assignments } = lidlBoughtAndCompleted();

  const next = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl', 1, true);

  assert.equal(next.reactivated, true);
  assert.deepEqual(
    homeLists(next.items, next.assignments),
    { lidl: ['Milk'], aldi: ['Rice'] },
    'exactly one Lidl planning entry',
  );
  assert.equal(
    next.assignments.filter((a) => a.pantryItemId === 'milk' && a.storeId === 'lidl').length,
    1,
    'one canonical assignment, not a second row',
  );

  // OTA 442: it stays planning data — it cannot rejoin the completed stop.
  const before = session;
  const after = reduce(session, {
    type: 'ADD_ENTRY',
    now: 3000,
    entry: { pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'lidl', picked: false },
  });
  assert.equal(after, before, 'no implicit revisit of the completed Lidl stop');
  assert.deepEqual(after.storeQueue, ['lidl', 'aldi'], 'no phantom stop appended');
});

// ── 6 & 7. Correct non-merges ─────────────────────────────────────────────────

test('the same item at two different stores stays two valid entries', () => {
  const items = [mk('milk', 'Milk', 'lidl')];
  let assignments = assignShoppingItemToStore([], 'milk', 'lidl', 10);
  assignments = assignShoppingItemToStore(assignments, 'milk', 'aldi', 11);

  assert.deepEqual(homeLists(items, assignments), { lidl: ['Milk'], aldi: ['Milk'] });
  assert.notEqual(
    shoppingDuplicateKey('milk', 'Milk', 'lidl'),
    shoppingDuplicateKey('milk', 'Milk', 'aldi'),
    'the key is per-store',
  );
});

test('a purchase at one store does not mask the same item pending at another', () => {
  const { session } = lidlBoughtAndCompleted();

  assert.ok(isAlreadyPurchasedThisTrip(session, 'milk', 'Milk', 'lidl'));
  assert.equal(
    isAlreadyPurchasedThisTrip(session, 'milk', 'Milk', 'aldi'),
    false,
    'Aldi is untouched by the Lidl purchase',
  );
});

test('similar names with different pantryItemIds are never merged', () => {
  assert.notEqual(
    shoppingDuplicateKey('milk', 'Milk', 'lidl'),
    shoppingDuplicateKey('whole-milk', 'Whole Milk', 'lidl'),
  );
  const { session } = lidlBoughtAndCompleted();
  assert.equal(
    isAlreadyPurchasedThisTrip(session, 'whole-milk', 'Whole Milk', 'lidl'),
    false,
    'a genuinely different product is not blocked by Milk being bought',
  );
});

// ── 8. Fallback identity for unlinked items ───────────────────────────────────

test('items without a usable pantryItemId fall back to a normalized name', () => {
  // Receipt-scanned rows all share one sentinel id, so keying on it would make
  // every scanned product look identical.
  assert.notEqual(
    shoppingDuplicateKey(UNLINKED_PANTRY_ITEM_ID, 'Milk', 'lidl'),
    shoppingDuplicateKey(UNLINKED_PANTRY_ITEM_ID, 'Bread', 'lidl'),
    'two unlinked products stay distinct',
  );
  // Normalization is whitespace/case only — deliberately conservative.
  assert.equal(
    shoppingDuplicateKey(null, '  MILK  ', 'lidl'),
    shoppingDuplicateKey(undefined, 'milk', 'lidl'),
  );
  assert.notEqual(
    shoppingDuplicateKey(null, 'Milk', 'lidl'),
    shoppingDuplicateKey(null, 'Milks', 'lidl'),
  );
});

test('an unlinked scanned item purchased this trip is detected by name', () => {
  let s = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [{ pantryItemId: UNLINKED_PANTRY_ITEM_ID, name: 'Rotisserie Chicken', quantity: 1, unit: 'unit', storeId: 'lidl', picked: false }],
    now: 1000,
    shopperId: 'owner',
  });
  s = reduce(s, { type: 'SET_PICK', entryId: s.entries[0].entryId, picked: true, now: 1100 });
  s = reduce(s, { type: 'FINISH_STORE', now: 2000 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 2001 });

  assert.ok(isAlreadyPurchasedThisTrip(s, UNLINKED_PANTRY_ITEM_ID, 'Rotisserie Chicken', 'lidl'));
  assert.equal(
    isAlreadyPurchasedThisTrip(s, UNLINKED_PANTRY_ITEM_ID, 'Rotisserie Duck', 'lidl'),
    false,
    'a different scanned product is not swept up',
  );
});

// ── 9. Cross-device / offline convergence ─────────────────────────────────────

test('the same Add again from two devices converges to one assignment', () => {
  const { session, items, assignments } = lidlBoughtAndCompleted();

  // Both devices perform the same explicit re-add while offline.
  const deviceA = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl', 1, true);
  const deviceB = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl', 1, true);

  for (const merged of [
    mergeShoppingStoreAssignments(deviceA.assignments, deviceB.assignments),
    mergeShoppingStoreAssignments(deviceB.assignments, deviceA.assignments),
  ]) {
    assert.equal(
      merged.filter((a) => a.pantryItemId === 'milk' && a.storeId === 'lidl').length,
      1,
      'one canonical assignment regardless of merge direction',
    );
    // deviceA.items is the post-add pantry (Milk back to 'low'); the pre-add
    // `items` still has it 'stocked' from the purchase and would filter out.
    assert.deepEqual(homeLists(deviceA.items, merged), { lidl: ['Milk'], aldi: ['Rice'] });
  }
});

test('a replayed offline add is idempotent, not additive', () => {
  const { session, items, assignments } = lidlBoughtAndCompleted();

  let next = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl', 2, true);
  // The same logical write arriving again (tap retry / offline replay).
  next = addItemWithGuard(next, session, 'Milk', 'lidl', 2, true);

  assert.equal(next.items.find((i) => i.id === 'milk')!.quantity, 2, 'quantity did not inflate');
  assert.equal(
    next.assignments.filter((a) => a.pantryItemId === 'milk' && a.storeId === 'lidl').length,
    1,
  );
});

// ── 10. The reported end-state ────────────────────────────────────────────────

test('completing the remaining stores does not bring the purchased store back', () => {
  const { session, items, assignments } = lidlBoughtAndCompleted();

  // Accidental re-add (no explicit confirmation) — the guard refuses.
  const afterAdd = addItemWithGuard({ items, assignments }, session, 'Milk', 'lidl');
  const afterAdd2 = addItemWithGuard(afterAdd, session, 'Eggs', 'lidl');

  // Finish the rest of the trip.
  let s = reduce(session, { type: 'CHOOSE_NEXT_STORE', storeId: 'aldi' });
  const aldiEntries = s.entries.filter((e) => e.stopId === currentStopId(s));
  for (const e of aldiEntries) s = reduce(s, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: 4000 });
  s = reduce(s, { type: 'FINISH_STORE', now: 4100 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 4101 });
  const settled = purchase(afterAdd2.items, afterAdd2.assignments, aldiEntries);
  s = reduce(s, { type: 'FINISH_TRIP', now: 5000 });
  s = reduce(s, { type: 'END_TRIP' });

  assert.equal(s.status, 'idle');
  assert.deepEqual(
    homeLists(settled.items, settled.assignments),
    {},
    'no Lidl list reappears after the trip ends',
  );
});

// ── Guard placement ───────────────────────────────────────────────────────────

test('every assignment-reactivation path in the durable store is guarded', () => {
  const source = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');

  // The one predicate all reactivation paths must consult.
  assert.match(source, /const canAssignToStore = \(/);
  assert.match(source, /isAlreadyPurchasedThisTrip\(get\(\)\.activeSession/);

  // addItem's existing-item branch, bulk assign, and single assign all consult
  // the guard AND gate the storeId write on its answer — a refused
  // reactivation must leave item.storeId untouched too, or
  // activeShoppingStoreIds resurrects the store from the item alone on any
  // device with no local assignment record (the actual OTA 445 regression).
  assert.match(source, /const mayAssign = input\.storeId\s*\?\s*canAssignToStore\(/);
  assert.match(source, /storeId:\s*\(input\.storeId && mayAssign\)\s*\?\s*input\.storeId\s*:\s*existing\.storeId/);
  assert.match(source, /canAssignToStore\(item\.id, item\.name, storeId, options\?\.allowRepurchase\)/);
  assert.match(source, /idSet\.has\(item\.id\) && mayAssignMap\.get\(item\.id\)/);
  assert.match(source, /const mayAssign = storeId\s*\n\s*\? canAssignToStore\(item\.id, item\.name, storeId, options\?\.allowRepurchase\)/);
  assert.match(source, /const nextStoreId = storeId && !mayAssign \? item\.storeId : storeId/);
});

test('the add sheet asks before resurrecting a purchased store', () => {
  const sheet = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');

  assert.match(sheet, /purchasedAtStoreThisTrip\(/, 'duplicates are detected before writing');
  assert.match(sheet, /duplicatePurchaseMessage\(/);
  // Dismiss must reset the sheet's own state (selection/count/CTA), not just
  // close the native Alert — see shopping-cross-store-reassignment-guard.test.ts.
  assert.match(sheet, /text: 'Dismiss',\s*\n\s*style: 'cancel',/);
  assert.match(sheet, /onPress: \(\) => \{\s*\n\s*reset\(\);\s*\n\s*onClose\(\);\s*\n\s*\},/);
  assert.match(sheet, /text: 'Add again'/);
  // Only the explicit branch may override the guard.
  assert.match(sheet, /writeItems\(chosen, true\)/);
  assert.match(sheet, /writeItems\(chosen, false\)/);
});
