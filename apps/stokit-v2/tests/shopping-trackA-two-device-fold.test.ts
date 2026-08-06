/** Track A — two-device fold harness. Device A completes Sam's Club; Device B
 *  is a stale live session on the same trip that re-adds the same occurrences. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { reduce, initialSession, type ShoppingSession } from '../core/shopping-machine/machine';
import {
  reconcileShoppingSession, shoppingEntryEventForItem,
  foldRemoteActiveSession, canFoldActiveSessions,
} from '../core/services/shoppingEntrySync';
import type { PantryItem, ShoppingStoreAssignment } from '../types';

const SAMS = 'store_ms3ek8ut_1';
const SAFE = 'store_ms5fna93_x';
const SAMS_PICKS: [string, string][] = [
  ['item_ms3l0ffn_l', 'Lamb'], ['item_ms3t0sn1_4', 'Steak'], ['item_ms63huzs_1', 'Chicken'],
  ['item_msewrv30_1', 'Ground beef'], ['item_ms2p72fe_4', 'Tortillas'], ['item_ms3icn5p_1a', 'Bread'],
  ['item_ms3icn6a_1j', 'Bagels'], ['item_ms54skbx_16', 'Shrimp'], ['item_ms5fe22d_2', 'Tuna'],
  ['item_ms5fe22n_6', 'Cod'], ['item_ms63iwo2_1', 'Salmon'], ['item_ms6w0r3v_b', 'Pita bread'],
];
const SAFE_ONLY: [string, string][] = [['item_ms204vu7_9', 'Blueberry'], ['item_ms3iecwj_24', 'Crab']];

let clock = 1785958240796;
const now = () => ++clock;
const mkItem = (id: string, name: string, storeId: string | null): PantryItem => ({
  id, name, quantity: 1, unit: 'unit' as const, status: 'low', storeId, storageLocation: 'pantry',
  expiryDate: null, createdAt: 1, updatedAt: 1, statusUpdatedAt: 1, statusRevision: 1,
} as PantryItem);
const mkAssign = (itemId: string, storeId: string): ShoppingStoreAssignment => ({
  id: `shopping-store:${itemId}:${storeId}`, pantryItemId: itemId, storeId,
  active: true, revision: 1, updatedAt: 1,
} as ShoppingStoreAssignment);

test('Track A: stale Device B fold must not unpick Device A completed-stop entries', () => {
  const items: PantryItem[] = [
    ...SAMS_PICKS.map(([id, n]) => mkItem(id, n, SAMS)),
    ...SAFE_ONLY.map(([id, n]) => mkItem(id, n, SAFE)),
  ];
  let assignments: ShoppingStoreAssignment[] = [
    ...SAMS_PICKS.map(([id]) => mkAssign(id, SAMS)),
    ...SAFE_ONLY.map(([id]) => mkAssign(id, SAFE)),
  ];
  const byId = new Map(items.map((i) => [i.id, i]));
  const drafts = [
    ...SAMS_PICKS.map(([id, name]) => ({ pantryItemId: id, name, quantity: 1, unit: 'unit' as const, storeId: SAMS, picked: false })),
    ...SAFE_ONLY.map(([id, name]) => ({ pantryItemId: id, name, quantity: 1, unit: 'unit' as const, storeId: SAFE, picked: false })),
  ];
  const startedAt = now();
  let A: ShoppingSession = reduce(initialSession, { type: 'START_TRIP', now: startedAt, entries: drafts });
  // Device B: same trip, same entries, still at stop 0 (Sam's), nothing picked.
  let B: ShoppingSession = JSON.parse(JSON.stringify(A));

  // Device A picks all 12 at Sam's, closes the stop, advances to Safeway.
  for (const [id] of SAMS_PICKS) {
    const e = A.entries.find((x) => x.pantryItemId === id && x.storeId === SAMS)!;
    A = reduce(A, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: now() });
  }
  A = reduce(A, { type: 'FINISH_STORE', now: now() });
  A = reduce(A, { type: 'SAVE_RECEIPT', amount: 21, status: 'logged', now: now() });
  for (const [id] of SAMS_PICKS) {
    const it = byId.get(id)!; it.status = 'stocked'; it.storeId = null;
    assignments = assignments.map((a) => a.pantryItemId === id && a.storeId === SAMS ? { ...a, active: false } : a);
  }
  A = reconcileShoppingSession(A, items, assignments);
  A = reduce(A, { type: 'CONTINUE_TRIP' });
  A = reduce(A, { type: 'CHOOSE_NEXT_STORE', storeId: SAFE });
  A = reconcileShoppingSession(A, items, assignments);
  const pickedOnA = A.entries.filter((e) => e.storeId === SAMS && e.picked).length;

  // Device B is stale: it still sees the items as low/assigned to Sam's and
  // re-adds those occurrences, stamping a NEWER addedAt on the same entryIds.
  const staleItems = SAMS_PICKS.map(([id, n]) => mkItem(id, n, SAMS));
  const staleAssignments = SAMS_PICKS.map(([id]) => mkAssign(id, SAMS));
  for (const it of staleItems) {
    const ev = shoppingEntryEventForItem(B, it, it.id, staleAssignments);
    if (ev) B = reduce(B, ev);
  }
  B = reconcileShoppingSession(B, staleItems, staleAssignments);

  assert.equal(canFoldActiveSessions(A, B), true, 'same tripId must fold');
  const AthenB = foldRemoteActiveSession(A, B);
  const BthenA = foldRemoteActiveSession(B, A);

  const count = (s: ShoppingSession) => s.entries.filter((e) => e.storeId === SAMS && e.picked).length;
  console.log(JSON.stringify({
    pickedOnA,
    afterFold_A_receives_B: count(AthenB),
    afterFold_B_receives_A: count(BthenA),
    sampleA: A.entries.find((e) => e.storeId === SAMS)!,
    sampleFolded: AthenB.entries.find((e) => e.storeId === SAMS)!,
  }, null, 1));

  assert.equal(count(AthenB), 12, 'LOSS REPRODUCED: fold unpicked completed-stop entries');

  // Close out Safeway on the folded session so FINISH_TRIP has something to finalize.
  let F = AthenB;
  for (const [id] of SAFE_ONLY) {
    const e = F.entries.find((x) => x.pantryItemId === id && x.storeId === SAFE);
    if (e) F = reduce(F, { type: 'SET_PICK', entryId: e.entryId, picked: true, now: now() });
  }
  F = reduce(F, { type: 'FINISH_STORE', now: now() });
  F = reduce(F, { type: 'SAVE_RECEIPT', amount: 85, status: 'logged', now: now() });
  F = reduce(F, { type: 'FINISH_TRIP', now: now() });

  const sams = F.completedTrip!.purchasedItems.filter((p) => p.storeId === SAMS);
  console.log('Sam\'s purchasedItems after fold + FINISH_TRIP:', sams.length);
  assert.equal(sams.length, 12);
});
