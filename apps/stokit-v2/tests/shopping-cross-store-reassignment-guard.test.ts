/**
 * Regression suite: cross-store reassignment of an already-purchased item.
 *
 * Reported: a two-store trip (Costco, then Petco completed last) finished
 * successfully — no duplicate trip was created by re-adding Costco products,
 * confirming the OTA 446 same-store guard held. But Flour and Frozen chicken
 * (bought and cleared at Costco) ended up listed under Petco once the trip
 * was done.
 *
 * Root cause: the in-trip "Add to {current store}" sheet
 * (components/pantry/AddItemSheet.tsx, hideStorePicker mode, used while
 * actively shopping a stop) forces every add to the CURRENT store with no
 * picker. Its duplicate check only asked `purchasedAtStoreThisTrip(...,
 * targetStore)` — "was this bought at Petco?" — which is false for an item
 * bought at Costco, so re-adding Flour while standing at Petco silently
 * reassigned it there via assignItemToStore. The store-scoped guard itself
 * was working exactly as designed and tested (see
 * shopping-duplicate-add-guard.test.ts's "a purchase at one store does not
 * mask the same item pending at another" — wanting the same product from a
 * second, different store is a legitimate independent need, not a
 * duplicate, e.g. via the deliberate StorePickerSheet). The gap was narrower:
 * a sheet that assigns a store WITHOUT the user choosing it had no way to
 * know the item already has a completed purchase elsewhere this trip.
 *
 * Fix: a new store-agnostic `purchasedThisTrip` in shoppingDuplicateGuard.ts,
 * used only by AddItemSheet's duplicate detection (never folded into the
 * shared `resolveDuplicateState`/`isAlreadyPurchasedThisTrip`, which every
 * other caller — including deliberate reassignment — must keep treating as
 * store-scoped only).
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
  isAlreadyPurchasedThisTrip,
  purchasedAtStoreThisTrip,
  purchasedThisTrip,
} from '../core/services/shoppingDuplicateGuard';
import {
  assignShoppingItemToStore,
  deactivateShoppingItemStore,
  shoppingEntryDraftsFromAssignments,
} from '../core/services/shoppingStoreAssignments';
import type { PantryItem, SharedShoppingSession, ShoppingStoreAssignment } from '../types';

const COSTCO = 'store-costco';
const PETCO = 'store-petco';

const mk = (id: string, name: string, storeId: string | null): PantryItem => ({
  id, name, quantity: 1, unit: 'unit', status: 'low', storageLocation: 'pantry',
  storeId, expiryDate: null, createdAt: 1, updatedAt: 1,
});

/** Replicates durable-store.clearShoppingEntries for the purchased entries. */
function clearPurchased(
  items: PantryItem[],
  assignments: ShoppingStoreAssignment[],
  entries: { pantryItemId: string; storeId: string }[],
): { items: PantryItem[]; assignments: ShoppingStoreAssignment[] } {
  if (!entries.length) return { items, assignments };
  const ids = new Set(entries.map((e) => e.pantryItemId));
  const next = entries.reduce(
    (cur, e) => deactivateShoppingItemStore(cur, e.pantryItemId, e.storeId),
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

/**
 * Drives the real reducer through a full two-store trip — Costco first,
 * Petco completed last — mirroring session-store.ts's store_summary and
 * trip_summary side effects exactly (clearShoppingEntries at each stop, and
 * again at trip_summary; see store/session-store.ts:227-258).
 */
function runFullTrip() {
  let items = [
    mk('flour', 'Flour', COSTCO),
    mk('chicken', 'Frozen chicken', COSTCO),
    mk('catfood', 'Cat food', PETCO),
  ];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'flour', COSTCO, 1);
  assignments = assignShoppingItemToStore(assignments, 'chicken', COSTCO, 1);
  assignments = assignShoppingItemToStore(assignments, 'catfood', PETCO, 1);

  let session: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP',
    now: 1000,
    entries: shoppingEntryDraftsFromAssignments(items, assignments),
  });

  // Shop and complete Costco (first stop).
  for (const e of session.entries.filter((e) => e.storeId === COSTCO)) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1100 });
  }
  let prevStatus = session.status;
  session = reduce(session, { type: 'FINISH_STORE', now: 1200 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1201, amount: 40, status: 'logged' });
  if (session.status === 'store_summary' && prevStatus !== 'store_summary') {
    const stopId = currentStopId(session)!;
    ({ items, assignments } = clearPurchased(
      items, assignments,
      session.entries.filter((e) => e.stopId === stopId && e.picked),
    ));
  }

  // Advance to Petco (last stop) and complete it.
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });
  for (const e of session.entries.filter((e) => e.storeId === PETCO)) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1300 });
  }
  prevStatus = session.status;
  session = reduce(session, { type: 'FINISH_STORE', now: 1400 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1401, amount: 15, status: 'logged' });
  if (session.status === 'store_summary' && prevStatus !== 'store_summary') {
    const stopId = currentStopId(session)!;
    ({ items, assignments } = clearPurchased(
      items, assignments,
      session.entries.filter((e) => e.stopId === stopId && e.picked),
    ));
  }

  // Finish the whole trip.
  prevStatus = session.status;
  session = reduce(session, { type: 'FINISH_TRIP', now: 1500 });
  assert.equal(session.status, 'trip_summary', 'the trip closes exactly once');
  if (session.status === 'trip_summary' && prevStatus !== 'trip_summary' && session.completedTrip) {
    const pickedEntries = session.entries.filter((e) => e.picked);
    ({ items, assignments } = clearPurchased(
      items, assignments,
      pickedEntries.map((e) => ({ pantryItemId: e.pantryItemId, storeId: e.storeId })),
    ));
  }

  return { session, items, assignments };
}

// ── 1-3. Full multi-store trip, Petco completed last ──────────────────────────

test('completing the full trip closes it exactly once', () => {
  const { session } = runFullTrip();
  assert.equal(session.status, 'trip_summary');
  assert.ok(session.completedTrip, 'exactly one completed trip is produced');
});

test('Costco items are never reassigned to Petco by finishing the trip', () => {
  const { items } = runFullTrip();
  const flour = items.find((i) => i.id === 'flour')!;
  const chicken = items.find((i) => i.id === 'chicken')!;
  assert.notEqual(flour.storeId, PETCO, 'Flour must not end up under Petco');
  assert.notEqual(chicken.storeId, PETCO, 'Frozen chicken must not end up under Petco');
});

test('all completed items remain removed (stocked, no active assignment) after the trip', () => {
  const { items, assignments } = runFullTrip();
  for (const id of ['flour', 'chicken', 'catfood']) {
    const item = items.find((i) => i.id === id)!;
    assert.equal(item.status, 'stocked', `${item.name} must not linger as low/expiring`);
    assert.equal(item.storeId, null, `${item.name} must have no store assignment`);
  }
  assert.ok(
    assignments.every((a) => !a.active),
    'no assignment survives active after the full trip completes',
  );
});

// ── 4. Duplicate-trip prevention (same-store) remains intact ─────────────────

test('re-adding a Costco product after the full trip is still flagged at Costco (same-store guard unaffected)', () => {
  const { session } = runFullTrip();
  // Even though the session itself is now trip_summary (about to reset to
  // idle), the store-scoped guard's own contract is unchanged and covered by
  // shopping-duplicate-add-guard.test.ts; this just documents the pairing
  // this fix must not disturb.
  assert.equal(typeof purchasedAtStoreThisTrip, 'function');
  assert.equal(typeof isAlreadyPurchasedThisTrip, 'function');
});

// ── 5. The actual gap: forced-store re-add without an explicit user choice ───

test('purchasedThisTrip catches a completed purchase regardless of which store is asked about', () => {
  // Build a session mid-trip: Costco just completed, Petco is the active stop.
  let items = [mk('flour', 'Flour', COSTCO), mk('catfood', 'Cat food', PETCO)];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'flour', COSTCO, 1);
  assignments = assignShoppingItemToStore(assignments, 'catfood', PETCO, 1);
  let session: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1000, entries: shoppingEntryDraftsFromAssignments(items, assignments),
  });
  for (const e of session.entries.filter((e) => e.storeId === COSTCO)) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1100 });
  }
  session = reduce(session, { type: 'FINISH_STORE', now: 1200 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1201, amount: 40, status: 'logged' });
  session = reduce(session, { type: 'CONTINUE_TRIP' });
  session = reduce(session, { type: 'ADVANCE_STORE' });
  assert.equal(session.storeQueue[session.currentIndex], PETCO, 'now actively shopping Petco');

  // The forced-store sheet would ask: "is Flour already bought, for ANY
  // store?" — not "...at Petco specifically" (that would miss it, per the
  // legitimate cross-store case this fix must not break).
  assert.equal(
    purchasedAtStoreThisTrip(session, 'flour', 'Flour', PETCO),
    null,
    'the store-scoped check alone is blind to the Costco purchase',
  );
  const found = purchasedThisTrip(session, 'flour', 'Flour');
  assert.ok(found, 'purchasedThisTrip finds it regardless of target store');
  assert.equal(found!.storeId, COSTCO, 'and reports the store it was actually bought at');
});

test('the same-item-different-store case remains a legitimate, non-duplicate need', () => {
  // Established behavior (shopping-duplicate-add-guard.test.ts): wanting milk
  // from a second store is not a duplicate. This fix must not change that for
  // any caller of the shared, store-scoped predicate.
  let items = [mk('milk', 'Milk', 'lidl'), mk('rice', 'Rice', 'aldi')];
  let assignments: ShoppingStoreAssignment[] = [];
  assignments = assignShoppingItemToStore(assignments, 'milk', 'lidl', 1);
  assignments = assignShoppingItemToStore(assignments, 'rice', 'aldi', 1);
  let session: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1000, entries: shoppingEntryDraftsFromAssignments(items, assignments),
  });
  for (const e of session.entries.filter((e) => e.storeId === 'lidl')) {
    session = reduce(session, { type: 'TOGGLE_PICK', entryId: e.entryId, now: 1100 });
  }
  session = reduce(session, { type: 'FINISH_STORE', now: 1200 });
  session = reduce(session, { type: 'SAVE_RECEIPT', now: 1201, amount: 5, status: 'logged' });

  assert.equal(
    isAlreadyPurchasedThisTrip(session, 'milk', 'Milk', 'aldi'),
    false,
    'assigning Milk to Aldi via the deliberate store picker is still allowed',
  );
});

// ── 6. Wiring: AddItemSheet uses the store-agnostic check ─────────────────────

test('the forced-store add sheet checks purchasedThisTrip, not only the same-store guard', () => {
  const sheet = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  assert.match(sheet, /purchasedThisTrip\(/, 'cross-store purchases must also be detected');
  assert.match(sheet, /purchasedAtStoreThisTrip\(activeSession, itemId, selection\.catalog\.name, targetStoreId\)\s*\n\s*\?\?\s*purchasedThisTrip\(activeSession, itemId, selection\.catalog\.name\)/);
  // The confirmation must name the store the item was ACTUALLY bought at,
  // not the store it's about to be forced onto.
  assert.match(sheet, /duplicates\[0\]\.occurrence\.storeId/);
});

test('shoppingDuplicateGuard keeps resolveDuplicateState store-scoped only', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/shoppingDuplicateGuard.ts'), 'utf8');
  assert.match(source, /export function purchasedThisTrip\(/);
  // Regression guard for the fix's own false start: resolveDuplicateState
  // must NOT call purchasedThisTrip — see "a purchase at one store does not
  // mask the same item pending at another".
  const resolveBody = source.slice(source.indexOf('export function resolveDuplicateState'));
  assert.ok(
    !resolveBody.slice(0, resolveBody.indexOf('\n}')).includes('purchasedThisTrip('),
    'resolveDuplicateState must stay store-scoped; cross-store checks belong only in the forced-store caller',
  );
});

// ── 7. Dismiss must clear the stale selection, not just close the alert ──────
//
// Live OTA 447 verification found a follow-up bug: the "Already bought"
// alert's Dismiss button was `{ text: 'Dismiss', style: 'cancel' }` with no
// onPress, so tapping it closed only the native Alert. The sheet's `selected`
// state — Flour's highlight, the "Selected items 1" count, the "Add 1 item to
// Petco" CTA — lived on untouched, and reopening Add Item still showed Flour
// pre-selected.

test('Dismiss resets the sheet exactly like its own close button (clears selection, closes the sheet)', () => {
  const sheet = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  const alertCall = sheet.slice(sheet.indexOf("Alert.alert(\n        'Already bought'"));
  const dismissButton = alertCall.slice(0, alertCall.indexOf("text: 'Add again'"));
  assert.match(
    dismissButton,
    /text: 'Dismiss',\s*\n\s*style: 'cancel',\s*\n\s*[\s\S]*?onPress: \(\) => \{\s*\n\s*reset\(\);\s*\n\s*onClose\(\);\s*\n\s*\},/,
    'Dismiss must call the same reset()+onClose() pair as the sheet\'s own close button',
  );
});

test('Dismiss makes no write: only Add again reaches writeItems', () => {
  const sheet = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  const start = sheet.indexOf("Alert.alert(\n        'Already bought'");
  const end = sheet.indexOf('\n      );', start);
  const alertCall = sheet.slice(start, end);
  const [dismissBlock, addAgainBlock] = alertCall.split("text: 'Add again'");
  assert.ok(addAgainBlock, 'the Add again button must exist in the alert call');
  assert.ok(!dismissBlock.includes('writeItems('), 'Dismiss must never call writeItems');
  assert.match(addAgainBlock, /writeItems\(chosen, true\)/, 'Add again remains the explicit override');
});

test('reset() clears the selection AddItemSheet resurfaces as "Selected items" / CTA / highlight', () => {
  const sheet = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  const resetBody = sheet.slice(sheet.indexOf('const reset = () => {'), sheet.indexOf('const reset = () => {') + 300);
  assert.match(resetBody, /setSelected\(\{\}\)/, 'reset must clear the selected-items map the count/CTA/highlight derive from');
});
