/**
 * Track A harness — NOT a committed regression test.
 * Replays the OTA 467 field trip t_1785958240796 (Sam's Club -> Safeway)
 * against current (OTA 468) machine + reconcile code.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine/machine';
import { reconcileShoppingSession, shoppingEntryEventForItem } from '../core/services/shoppingEntrySync';
import type { PantryItem, ShoppingStoreAssignment } from '../types';

const SAMS = 'store_ms3ek8ut_1';
const SAFE = 'store_ms5fna93_x';

// itemId -> name, exactly the 12 picked at Sam's Club per the activity log.
const SAMS_PICKS: [string, string][] = [
  ['item_ms3l0ffn_l', 'Lamb'], ['item_ms3t0sn1_4', 'Steak'],
  ['item_ms63huzs_1', 'Chicken'], ['item_msewrv30_1', 'Ground beef'],
  ['item_ms2p72fe_4', 'Tortillas'], ['item_ms3icn5p_1a', 'Bread'],
  ['item_ms3icn6a_1j', 'Bagels'], ['item_ms54skbx_16', 'Shrimp'],
  ['item_ms5fe22d_2', 'Tuna'], ['item_ms5fe22n_6', 'Cod'],
  ['item_ms63iwo2_1', 'Salmon'], ['item_ms6w0r3v_b', 'Pita bread'],
];
const SAFE_ONLY: [string, string][] = [
  ['item_ms204vu7_9', 'Blueberry'], ['item_ms204vuk_c', 'Strawberry'],
  ['item_ms3i7l5l_3', 'Watermelon'], ['item_ms3iecwj_24', 'Crab'],
  ['item_ms3lak8t_1f', 'Grapes'], ['item_ms3lak91_1i', 'Lime'],
  ['item_ms3lak9c_1l', 'Tomato'], ['item_ms4ycthl_f', 'Lemon'],
  ['item_ms51bkxw_w', 'Orange'], ['item_ms5fonb7_14', 'Lobster'],
  ['item_ms6e5kt9_7', 'Apple'], ['item_ms6e5ktm_a', 'Banana'],
  ['item_ms6lyh96_1h', 'Garlic'], ['item_ms6lyh9c_1k', 'Potato'],
  ['item_ms6lyh9g_1n', 'Carrot'],
];
// Re-picked at Safeway after Sam's (per activity log 15:32:5x).
const REPICK_AT_SAFEWAY = ['item_ms54skbx_16', 'item_ms5fe22d_2', 'item_ms5fe22n_6', 'item_ms63iwo2_1'];

let clock = 1785958240796;
const now = () => ++clock;

function mkItem(id: string, name: string, storeId: string): PantryItem {
  return {
    id, name, quantity: 1, unit: 'unit' as const, status: 'low', storeId,
    storageLocation: 'pantry', expiryDate: null,
    createdAt: 1, updatedAt: 1, statusUpdatedAt: 1, statusRevision: 1,
  } as PantryItem;
}
function mkAssign(itemId: string, storeId: string): ShoppingStoreAssignment {
  return {
    id: `shopping-store:${itemId}:${storeId}`,
    pantryItemId: itemId, storeId, active: true, revision: 1, updatedAt: 1,
  } as ShoppingStoreAssignment;
}

test('Track A: replay Sam’s Club -> Safeway two-stop trip on current code', () => {
  const items: PantryItem[] = [
    ...SAMS_PICKS.map(([id, n]) => mkItem(id, n, SAMS)),
    ...SAFE_ONLY.map(([id, n]) => mkItem(id, n, SAFE)),
  ];
  let assignments: ShoppingStoreAssignment[] = [
    ...SAMS_PICKS.map(([id]) => mkAssign(id, SAMS)),
    ...SAFE_ONLY.map(([id]) => mkAssign(id, SAFE)),
    // The four re-picked items also carry a live Safeway assignment.
    ...REPICK_AT_SAFEWAY.map((id) => mkAssign(id, SAFE)),
  ];
  const byId = new Map(items.map((i) => [i.id, i]));

  let s: ShoppingSession = reduce(initialSession, {
    type: 'START_TRIP',
    now: now(),
    entries: [
      ...SAMS_PICKS.map(([id, name]) => ({ pantryItemId: id, name, quantity: 1, unit: 'unit' as const, storeId: SAMS, picked: false })),
      ...SAFE_ONLY.map(([id, name]) => ({ pantryItemId: id, name, quantity: 1, unit: 'unit' as const, storeId: SAFE, picked: false })),
      ...REPICK_AT_SAFEWAY.map((id) => ({ pantryItemId: id, name: byId.get(id)!.name, quantity: 1, unit: 'unit' as const, storeId: SAFE, picked: false })),
    ],
  });
  const recon = () => { s = reconcileShoppingSession(s, items, assignments); };
  recon();

  // ── Stop 0: Sam's Club. Pick all 12.
  for (const [id] of SAMS_PICKS) {
    const e = s.entries.find((x) => x.pantryItemId === id && x.storeId === SAMS);
    assert.ok(e, `no Sam's entry queued for ${id}`);
    s = reduce(s, { type: 'SET_PICK', entryId: e!.entryId, picked: true, now: now() });
  }
  const pickedAtSams = s.entries.filter((e) => e.storeId === SAMS && e.picked).length;

  // Store completion: receipt, then the durable store marks picked items stocked
  // and retires their assignment for that store.
  s = reduce(s, { type: 'FINISH_STORE', now: now() });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 21, status: 'logged', now: now() });
  for (const [id] of SAMS_PICKS) {
    const it = byId.get(id)!;
    if (!REPICK_AT_SAFEWAY.includes(id)) { it.status = 'stocked'; it.storeId = null; }
    assignments = assignments.map((a) =>
      a.pantryItemId === id && a.storeId === SAMS ? { ...a, active: false } : a);
  }
  recon();
  const survivingAfterStopClose = s.entries.filter((e) => e.storeId === SAMS && e.picked).length;

  // ── Stop transition -> Safeway.
  s = reduce(s, { type: 'CONTINUE_TRIP' });
  s = reduce(s, { type: 'CHOOSE_NEXT_STORE', storeId: SAFE });
  recon();
  const survivingAfterTransition = s.entries.filter((e) => e.storeId === SAMS && e.picked).length;

  // ── Stop 1: Safeway. Mark the four re-picked items low again (the production
  // path dispatches shoppingEntryEventForItem on every status change).
  for (const id of REPICK_AT_SAFEWAY) {
    const ev = shoppingEntryEventForItem(s, byId.get(id)!, id, assignments);
    if (ev) s = reduce(s, ev);
  }
  recon();
  for (const [id] of [...SAFE_ONLY, ...REPICK_AT_SAFEWAY.map((i) => [i] as [string])]) {
    const e = s.entries.find((x) => x.pantryItemId === id && x.storeId === SAFE);
    if (e) s = reduce(s, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: now() });
  }
  s = reduce(s, { type: 'FINISH_STORE', now: now() });
  s = reduce(s, { type: 'SAVE_RECEIPT', amount: 85, status: 'logged', now: now() });
  recon();
  s = reduce(s, { type: 'FINISH_TRIP', now: now() });

  const trip = s.completedTrip!;
  const samsPurchased = trip.purchasedItems.filter((p) => p.storeId === SAMS);
  console.log(JSON.stringify({
    pickedAtSams,
    survivingAfterStopClose,
    survivingAfterTransition,
    samsPurchasedCount: samsPurchased.length,
    samsPurchasedNames: samsPurchased.map((p) => p.name).sort(),
    samsBreakdown: trip.breakdown.find((b) => b.storeId === SAMS)?.itemsBought,
    totalPurchased: trip.purchasedItems.length,
  }, null, 1));
  assert.equal(pickedAtSams, 12);
  assert.equal(samsPurchased.length, 12, 'FIELD BUG REPRODUCED if this is 3');
});
