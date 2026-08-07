import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine/machine';
import { atomicShoppingRemovalPatch } from '../core/services/shoppingAtomicRemoval';
import { emptyDurableState } from '../core/repositories/durableRepository';
import type { DurableState, PantryItem, ShoppingEntry, SharedShoppingSession } from '../types';

/**
 * Guards a picked shopping entry can never be silently removed from the
 * active session. Field bug: an owner completed a single-store trip with 29
 * picked items, but only 14 reached Trip.purchasedItems — the other 15 were
 * dropped from session.entries via a removal path that ran independently of
 * whether the entry was picked, leaving the pantry item `status: low` with
 * no active assignment ("Choose store" resurrection) despite having been
 * bought at the register.
 */

function entry(over: Partial<ShoppingEntry>): ShoppingEntry {
  return {
    entryId: 'occ:t:stop:1:item', pantryItemId: 'item', stopId: 'stop:1',
    name: 'Milk', quantity: 1, unit: 'unit', storeId: 'sams', picked: false,
    ...over,
  };
}

// ── 1. machine.ts REMOVE_ENTRY reducer ──────────────────────────────────────

test('REMOVE_ENTRY no-ops on a picked entry: it stays in session.entries', () => {
  const session: ShoppingSession = {
    ...initialSession,
    status: 'shopping_store', tripId: 't1', startedAt: 1,
    storeQueue: ['sams'], currentIndex: 0,
    entries: [entry({ entryId: 'e1', picked: true, pickedAt: 5 })],
  };
  const result = reduce(session, { type: 'REMOVE_ENTRY', entryId: 'e1', now: 10 });
  assert.equal(result, session, 'no-op: identical session reference, nothing changed');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].picked, true);
  assert.equal(result.removedEntryIds.length, 0, 'no removedEntryIds recorded for a blocked removal');
});

test('REMOVE_ENTRY still removes an unpicked entry, unchanged behavior', () => {
  const session: ShoppingSession = {
    ...initialSession,
    status: 'shopping_store', tripId: 't1', startedAt: 1,
    storeQueue: ['sams'], currentIndex: 0,
    entries: [entry({ entryId: 'e1', picked: false })],
  };
  const result = reduce(session, { type: 'REMOVE_ENTRY', entryId: 'e1', now: 10 });
  assert.equal(result.entries.length, 0);
  assert.deepEqual(result.removedEntryIds, ['e1']);
});

test('explicit unpick then remove works: SET_PICK(false) followed by REMOVE_ENTRY succeeds', () => {
  let session: ShoppingSession = {
    ...initialSession,
    status: 'shopping_store', tripId: 't1', startedAt: 1,
    storeQueue: ['sams'], currentIndex: 0,
    entries: [entry({ entryId: 'e1', picked: true, pickedAt: 5 })],
  };
  session = reduce(session, { type: 'SET_PICK', entryId: 'e1', picked: false, now: 20 });
  assert.equal(session.entries[0].picked, false);
  session = reduce(session, { type: 'REMOVE_ENTRY', entryId: 'e1', now: 30 });
  assert.equal(session.entries.length, 0);
  assert.deepEqual(session.removedEntryIds, ['e1']);
});

// ── 2/3. atomicShoppingRemovalPatch (session-store.ts's target + the
//        defensive data-layer guard) ────────────────────────────────────────

function mkItem(id: string, over: Partial<PantryItem> = {}): PantryItem {
  return {
    id, name: 'Milk', quantity: 1, unit: 'unit', status: 'low',
    storageLocation: 'pantry', storeId: 'sams', expiryDate: null,
    createdAt: 1, updatedAt: 1, statusUpdatedAt: 1, statusRevision: 1,
    ...over,
  };
}
function mkState(items: PantryItem[]): DurableState {
  return { ...emptyDurableState, items };
}
function mkSession(entries: ShoppingEntry[]): SharedShoppingSession {
  return {
    status: 'shopping_store', tripId: 't1', startedAt: 1,
    storeQueue: ['sams'], currentIndex: 0, skippedStoreIds: [],
    entries, removedEntryIds: [], receipts: [], completedTrip: null,
  };
}

for (const persistDeletion of [true, false]) {
  test(`atomicShoppingRemovalPatch blocks a picked-entry removal wholesale (persistDeletion=${persistDeletion})`, () => {
    const picked = entry({ entryId: 'e1', pantryItemId: 'item', picked: true, pickedAt: 5, storeId: 'sams' });
    const state = mkState([mkItem('item', { status: 'low', storeId: 'sams' })]);
    const nextSession = mkSession([picked]); // caller kept it (matches the reducer no-op)
    const patch = atomicShoppingRemovalPatch(state, {
      nextSession,
      removedEntry: picked,
      persistDeletion,
      tombstoneEntryIds: [picked.entryId],
      legacyStoreId: null,
    }, 100);

    assert.deepEqual(patch.deletedItems ?? [], [], 'no tombstone for the picked entry');
    assert.equal(patch.items?.find((i) => i.id === 'item')?.storeId, 'sams', 'storeId not nulled');
    assert.equal((patch.activeSession as SharedShoppingSession).removedAt?.[picked.entryId], undefined, 'no removedAt recorded');
  });
}

test('atomicShoppingRemovalPatch still tombstones a non-picked sibling while blocking the picked primary', () => {
  const picked = entry({ entryId: 'e1', pantryItemId: 'item', picked: true, pickedAt: 5, storeId: 'sams' });
  const sibling = entry({ entryId: 'e2', pantryItemId: 'item2', picked: false, storeId: 'sams' });
  const state = mkState([mkItem('item'), mkItem('item2')]);
  const nextSession = mkSession([picked]); // sibling already stripped from entries by the caller
  const patch = atomicShoppingRemovalPatch(state, {
    nextSession,
    removedEntry: picked,
    persistDeletion: true,
    tombstoneEntryIds: [picked.entryId, sibling.entryId],
    legacyStoreId: null,
  }, 100);
  const tombstoned = (patch.deletedItems ?? []).map((t) => t.id);
  assert.deepEqual(tombstoned, [sibling.entryId], 'sibling tombstoned, picked primary excluded');
});

test('atomicShoppingRemovalPatch: unpicked removal is completely unaffected', () => {
  const removed = entry({ entryId: 'e1', pantryItemId: 'item', picked: false, storeId: 'sams' });
  const state = mkState([mkItem('item', { status: 'low', storeId: 'sams' })]);
  const nextSession = mkSession([]);
  const patch = atomicShoppingRemovalPatch(state, {
    nextSession,
    removedEntry: removed,
    persistDeletion: true,
    tombstoneEntryIds: [removed.entryId],
    legacyStoreId: null,
  }, 100);
  assert.deepEqual((patch.deletedItems ?? []).map((t) => t.id), [removed.entryId]);
  assert.equal((patch.activeSession as SharedShoppingSession).removedAt?.[removed.entryId], 100);
});

test('atomicShoppingRemovalPatch: full pantry-item deletion still wins even when the entry is picked', () => {
  // entryId === pantryItemId (legacy bare-id entry) + persistDeletion=true is
  // the exact deletesPantryItem signature — a stronger, deliberate action.
  const picked = entry({ entryId: 'item', pantryItemId: 'item', picked: true, pickedAt: 5, storeId: 'sams' });
  const state = mkState([mkItem('item', { updatedAt: 1 })]);
  const nextSession = mkSession([]);
  const patch = atomicShoppingRemovalPatch(state, {
    nextSession,
    removedEntry: picked,
    persistDeletion: true,
    tombstoneEntryIds: [picked.entryId],
    legacyStoreId: null,
  }, 100);
  assert.ok(!patch.items?.some((i) => i.id === 'item'), 'the pantry item itself is deleted');
  assert.deepEqual((patch.deletedItems ?? []).map((t) => t.id), ['item'], 'the deletion is tombstoned');
});

// ── Architect rule B: full pantry-item deletion must ALSO strip a picked
//    session entry, so a purchasedItem never points at a deleted item ──────

test('session-store.ts strips the picked entry from session.entries on full pantry-item deletion (source wiring)', () => {
  const src = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  const blockStart = src.indexOf("if (event.type === 'REMOVE_ENTRY')");
  const blockEnd = src.indexOf('// Log "picked up"', blockStart);
  const block = src.slice(blockStart, blockEnd);
  assert.match(
    block,
    /isFullPantryItemDeletion && removedEntry\.picked\s*\n\s*\? \[\.\.\.siblingEntries\.map\(\(entry\) => entry\.entryId\), removedEntry\.entryId\]/,
    'the picked removedEntry.entryId must be included in the ids stripped from session.entries when isFullPantryItemDeletion is true',
  );
});

test('[end-to-end] full pantry-item deletion of a picked entry: session entry removed, excluded from purchasedItems', () => {
  // Reproduces the reducer no-op (proven above) composed with session-store's
  // idsToStrip logic (source-verified above) — the same shape a restricted
  // member's "delete this item" action produces for a picked legacy entry.
  const STORE = 'sams';
  let s: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1,
    entries: [
      { pantryItemId: 'kept', name: 'Kept', quantity: 1, unit: 'unit', storeId: STORE, picked: false },
      { pantryItemId: 'deleted-item', name: 'Deleted Item', quantity: 1, unit: 'unit', storeId: STORE, picked: false },
    ],
  });
  const keptEntry = s.entries.find((e) => e.pantryItemId === 'kept')!;
  const deletedItemEntry = s.entries.find((e) => e.pantryItemId === 'deleted-item')!;
  s = reduce(s, { type: 'SET_PICK', entryId: keptEntry.entryId, picked: true, now: 10 });
  s = reduce(s, { type: 'SET_PICK', entryId: deletedItemEntry.entryId, picked: true, now: 11 });
  assert.equal(s.entries.filter((e) => e.picked).length, 2, 'sanity: both picked');

  // 1. The reducer no-ops REMOVE_ENTRY on the picked entry (unchanged).
  const afterReducerNoOp = reduce(s, { type: 'REMOVE_ENTRY', entryId: deletedItemEntry.entryId, now: 20 });
  assert.equal(afterReducerNoOp.entries.length, 2, 'reducer alone still keeps it — session-store must strip it');

  // 2. session-store's full-pantry-item-deletion branch strips it (same
  //    idsToStrip shape verified against the real source above).
  const idsToStrip = [deletedItemEntry.entryId];
  s = {
    ...afterReducerNoOp,
    entries: afterReducerNoOp.entries.filter((e) => !idsToStrip.includes(e.entryId)),
    removedEntryIds: [...new Set([...afterReducerNoOp.removedEntryIds, ...idsToStrip])],
    removedAt: { ...(afterReducerNoOp.removedAt ?? {}), ...Object.fromEntries(idsToStrip.map((id) => [id, 20])) },
  };
  assert.equal(s.entries.length, 1, 'picked session entry for the deleted item is gone');
  assert.equal(s.entries[0].pantryItemId, 'kept');

  // 3. FINISH_TRIP must not include the deleted item as a purchase.
  s = reduce(s, { type: 'FINISH_STORE', now: 30 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 5, status: 'logged', now: 40 });
  s = reduce(s, { type: 'FINISH_TRIP', now: 50 });
  const purchasedIds = s.completedTrip!.purchasedItems.map((p) => p.itemId);
  assert.deepEqual(purchasedIds, ['kept'], 'the deleted item never appears in purchasedItems');
});

// ── 4. End-to-end: the exact 29-picked / 15-lost single-store field replay ──

test('[field replay] 29 picks at one store, 15 removed mid-trip while picked: all 29 survive to purchasedItems', () => {
  const STORE = 'store_msgkppgg_1z';
  const KEPT = Array.from({ length: 14 }, (_, i) => `kept-${i}`);
  const AT_RISK = Array.from({ length: 15 }, (_, i) => `atrisk-${i}`);
  const ALL = [...KEPT, ...AT_RISK];

  let s: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP', now: 1,
    entries: ALL.map((id) => ({ pantryItemId: id, name: id, quantity: 1, unit: 'unit', storeId: STORE, picked: false })),
  });

  for (const id of ALL) {
    const e = s.entries.find((x) => x.pantryItemId === id)!;
    s = reduce(s, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: 10 });
  }
  assert.equal(s.entries.filter((e) => e.picked).length, 29, 'sanity: all 29 picked');

  // Simulate the field bug's trigger: something attempts to remove each
  // at-risk entry while it is still picked (e.g. a stale sibling-cleanup /
  // re-add cycle from another device). Per the fix, this must no-op.
  for (const id of AT_RISK) {
    const e = s.entries.find((x) => x.pantryItemId === id)!;
    s = reduce(s, { type: 'REMOVE_ENTRY', entryId: e.entryId, now: 20 });
  }

  assert.equal(s.entries.length, 29, 'all 29 entries survive the removal attempts');
  assert.equal(s.entries.filter((e) => e.picked).length, 29);

  s = reduce(s, { type: 'FINISH_STORE', now: 30 });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 85.74, status: 'logged', now: 40 });
  s = reduce(s, { type: 'FINISH_TRIP', now: 50 });

  assert.equal(s.completedTrip!.purchasedItems.length, 29, 'all 29 reach Trip.purchasedItems, not 14');
});
