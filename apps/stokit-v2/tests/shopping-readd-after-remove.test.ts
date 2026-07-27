/**
 * P0 regression: re-adding an item to an active trip silently failed — the
 * item appeared locally, then vanished on the next sync, on BOTH devices.
 *
 * Root cause: `removedItemIds` is a plain string[] tombstone with no
 * timestamp. Once an id landed there on ANY device, every merge
 * (foldRemoteActiveSession, mergeActiveSession, hydrate) re-unioned it and
 * mergeShoppingEntries filtered that item straight back out. The local
 * reducer un-tombstones on ADD_ENTRY, but the peer still carried the old
 * tombstone, so the very next sync re-deleted the re-added item — forever,
 * since the union kept resurrecting the tombstone.
 *
 * This bit "selective" items specifically because an id only lands in
 * removedItemIds if it was removed at some point — either swiped away
 * mid-trip, or (much more commonly) auto-removed when it became `stocked`:
 * shoppingEntryEventForItem emits REMOVE_ENTRY for any item that stops being
 * a shopping item. So every item purchased earlier in a trip became
 * permanently un-re-addable for the rest of that trip.
 *
 * Fix: ShoppingEntry.addedAt + ShoppingSession.removedAt stamps, resolved by
 * resolveRemovedItemIds — a tombstone only survives if no side holds a live
 * entry re-added strictly after the newest removal. Legacy data (no stamps
 * on either side) keeps the original tombstone-wins behavior so genuine
 * deletions still propagate.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine';
import { foldRemoteActiveSession, resolveRemovedItemIds } from '../core/services/shoppingEntrySync';

const T = 1_700_000_000_000;

const entry = (itemId: string, storeId = 'lidl') => ({
  itemId, name: itemId, quantity: 1, unit: 'unit' as const, storeId, picked: false,
});

function activeTrip(): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP', now: T, shopperId: 'nargis',
    entries: [entry('cheese'), entry('eggs')],
  });
}

test('[repro] a re-added item is dropped when the peer still holds the old tombstone (pre-fix behavior)', () => {
  // Reproduce the old union-only rule inline to prove what used to happen.
  const base = activeTrip();
  const readded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  const peer = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  const oldUnion = Array.from(new Set([...(readded.removedItemIds ?? []), ...(peer.removedItemIds ?? [])]));
  assert.ok(oldUnion.includes('eggs'), 'the naive union re-introduces the tombstone that deleted the re-add');
});

test('[fixed] a re-added item survives the merge, in both directions', () => {
  const base = activeTrip();
  const readded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  const peer = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  const forward = foldRemoteActiveSession(readded, peer);
  const reverse = foldRemoteActiveSession(peer, readded);

  assert.ok(forward.entries.some((e) => e.itemId === 'eggs'), 're-add survives on the re-adding device');
  assert.ok(reverse.entries.some((e) => e.itemId === 'eggs'), 're-add reaches the peer');
});

test('[fixed] a genuine deletion still propagates when there is no re-add', () => {
  const base = activeTrip();
  const deleter = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });
  const unaware = base; // peer never saw the delete

  assert.ok(!foldRemoteActiveSession(deleter, unaware).entries.some((e) => e.itemId === 'eggs'));
  assert.ok(!foldRemoteActiveSession(unaware, deleter).entries.some((e) => e.itemId === 'eggs'));
});

test('[fixed] repeated syncs never re-drop the re-added item', () => {
  const base = activeTrip();
  const readded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  const peer = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 });

  let session = readded;
  for (let i = 0; i < 4; i++) {
    session = foldRemoteActiveSession(session, peer);
    assert.ok(session.entries.some((e) => e.itemId === 'eggs'), `sync round ${i + 1} must keep the item`);
  }
});

test('[legacy] sessions with no addedAt/removedAt on either side keep tombstone-wins', () => {
  const base = activeTrip();
  const legacyReadded = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs' }),   // no `now`
    { type: 'ADD_ENTRY', entry: entry('eggs') },              // no `now`
  );
  const legacyPeer = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs' });

  const merged = foldRemoteActiveSession(legacyReadded, legacyPeer);
  assert.ok(!merged.entries.some((e) => e.itemId === 'eggs'), 'legacy data must behave exactly as before this fix');
});

test('[fixed] a removal that is NEWER than the re-add still wins (last write wins, not add-always-wins)', () => {
  const base = activeTrip();
  const readdedEarly = reduce(
    reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 100 }),
    { type: 'ADD_ENTRY', entry: entry('eggs'), now: T + 200 },
  );
  // Peer removed it again, later than the re-add.
  const peerRemovedLater = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'eggs', now: T + 300 });

  const merged = foldRemoteActiveSession(readdedEarly, peerRemovedLater);
  assert.ok(!merged.entries.some((e) => e.itemId === 'eggs'), 'the newer removal must win over the older re-add');
});

test('resolveRemovedItemIds keeps unrelated tombstones untouched', () => {
  const a = {
    entries: [{ ...entry('eggs'), addedAt: T + 200 }],
    removedItemIds: ['eggs', 'milk'],
    removedAt: { eggs: T + 100, milk: T + 100 },
  };
  const b = { entries: [], removedItemIds: ['eggs', 'milk'], removedAt: { eggs: T + 100, milk: T + 100 } };

  const { removedItemIds } = resolveRemovedItemIds(a, b);
  assert.deepEqual(removedItemIds, ['milk'], 'only the re-added id is cleared; other removals stand');
});

test('[fixed] an item auto-removed by becoming stocked can be re-added later in the same trip', () => {
  // clearShoppingEntries marks bought items stocked -> shoppingEntryEventForItem
  // emits REMOVE_ENTRY, which is how ordinary purchased items got tombstoned.
  const base = activeTrip();
  const afterPurchase = reduce(base, { type: 'REMOVE_ENTRY', itemId: 'cheese', now: T + 100 });
  const needMoreCheese = reduce(afterPurchase, { type: 'ADD_ENTRY', entry: entry('cheese'), now: T + 500 });
  const peerStillTombstoned = afterPurchase;

  const merged = foldRemoteActiveSession(needMoreCheese, peerStillTombstoned);
  assert.ok(merged.entries.some((e) => e.itemId === 'cheese'), 'buying then re-adding the same item must work');
});
