/**
 * Regression suite: a household member who is not the active shopper could
 * not cancel/reset an active trip. If the shopper handed off or went
 * unavailable, every other member was locked behind the session with no way
 * out — the owner's/shopper's own CancelTripLink was hidden from them, and
 * even if it hadn't been, session-store.dispatch's canDispatchShoppingEvent
 * gate rejected their END_TRIP dispatch outright.
 *
 * Root cause: END_TRIP was bundled into TRIP_LIFECYCLE_EVENTS, gated by
 * canManageTripLifecycle = isSelectedShopper (core/services/shoppingAccess.ts).
 * That's correct for every OTHER lifecycle action (finishing a store,
 * choosing the next stop, reopening, skipping) — those really are
 * shopper-only — but END_TRIP is a distinct, narrower action: ending the
 * trip for the whole household, which any member should be able to do.
 *
 * Fix: a new canCancelTrip capability (any signed-in household member),
 * END_TRIP now checked against it instead of canManageTripLifecycle, and
 * app/(tabs)/shopping.tsx's CancelTripLink in ShoppingActive (the only
 * screen a non-shopper member ever renders — see ActiveTripShell) is now
 * shown to any canCancelTrip member instead of only canManageTripLifecycle
 * ones. Every other lifecycle control stays exactly as gated before.
 *
 * A second, backend-side gap was found during this investigation:
 * private.can_update_household_snapshot_as_member (Supabase RLS) already
 * restricted a non-shopper member's household-snapshot write to a narrow
 * entries/removedItemIds/storeQueue diff — a full activeSession -> null
 * write (what END_TRIP produces) fails that diff and would have been
 * silently rejected server-side even after this client-side fix, meaning a
 * member's cancel would apply locally but never reach the rest of the
 * household. See supabase/migrations/20260731160000_member_trip_cancel_snapshot_rls.sql
 * for the narrowly-scoped carve-out (NOT applied to the live database by
 * this suite or this change — flagged separately for explicit approval).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  reduce,
  initialSession,
  type ShoppingSession,
} from '../core/shopping-machine';
import {
  canDispatchShoppingEvent,
  shoppingCapabilities,
} from '../core/services/shoppingAccess';
import { foldRemoteActiveSession } from '../core/services/shoppingEntrySync';
import type { SharedShoppingSession } from '../types';

const NOW = 1_700_000_000_000;

function tripWithShopper(shopperId: string | null, now = NOW): ShoppingSession {
  return reduce(initialSession, {
    type: 'START_TRIP',
    now,
    shopperId,
    entries: [{ pantryItemId: 'milk', name: 'Milk', quantity: 1, unit: 'unit', storeId: 'lidl', picked: false }],
  });
}

// ── 1-4. Permission matrix ────────────────────────────────────────────────────

test('owner (not the active shopper) can cancel/reset the trip', () => {
  const caps = shoppingCapabilities('shopper-id', 'owner-id', 'owner');
  assert.equal(caps.canCancelTrip, true);
  assert.equal(canDispatchShoppingEvent('END_TRIP', caps), true);
  // Owner still cannot perform shopper-only lifecycle actions on someone else's stop.
  assert.equal(caps.canManageTripLifecycle, false);
  assert.equal(canDispatchShoppingEvent('FINISH_STORE', caps), false);
});

test('the active shopper can cancel/reset the trip (unchanged)', () => {
  const caps = shoppingCapabilities('shopper-id', 'shopper-id', 'member');
  assert.equal(caps.canCancelTrip, true);
  assert.equal(canDispatchShoppingEvent('END_TRIP', caps), true);
  assert.equal(caps.canManageTripLifecycle, true);
  assert.equal(canDispatchShoppingEvent('FINISH_STORE', caps), true);
});

test('a non-shopper household member can now cancel/reset the trip', () => {
  const caps = shoppingCapabilities('shopper-id', 'other-member-id', 'member');
  assert.equal(caps.canManageTripLifecycle, false, 'still cannot manage other lifecycle actions');
  assert.equal(caps.canCancelTrip, true, 'THE FIX: can cancel even though not the shopper');
  assert.equal(canDispatchShoppingEvent('END_TRIP', caps), true);
  // Every other trip-lifecycle event remains rejected for this member.
  for (const type of ['FINISH_STORE', 'CHOOSE_NEXT_STORE', 'REOPEN_STORE', 'SKIP_STORE', 'FINISH_TRIP'] as const) {
    assert.equal(canDispatchShoppingEvent(type, caps), false, `${type} must stay shopper-only`);
  }
});

test('someone outside the household cannot cancel/reset the trip', () => {
  // household.members.find(m => m.isMe) resolves to undefined for a non-member.
  const caps = shoppingCapabilities('shopper-id', undefined, undefined);
  assert.equal(caps.canCancelTrip, false);
  assert.equal(canDispatchShoppingEvent('END_TRIP', caps), false);
  assert.equal(caps.canEditItems, false, 'not broadened beyond cancel — item editing also stays closed');
});

// ── 5. END_TRIP resets identically regardless of who dispatches it ───────────

test('END_TRIP resets to initialSession the same way for owner, shopper, or member', () => {
  const trip = tripWithShopper('shopper-id');
  assert.equal(trip.status, 'shopping_store');
  const afterCancel = reduce(trip, { type: 'END_TRIP' });
  assert.deepEqual(afterCancel, initialSession, 'the reducer has no notion of "who" — same reset either way');
});

// ── 6. Nothing to hydrate after cancel ────────────────────────────────────────

test('a cancelled session has no entries, no store queue, and no tripId to hydrate', () => {
  const afterCancel = reduce(tripWithShopper('shopper-id'), { type: 'END_TRIP' });
  assert.equal(afterCancel.status, 'idle');
  assert.equal(afterCancel.tripId, null);
  assert.deepEqual(afterCancel.entries, []);
  assert.deepEqual(afterCancel.storeQueue, []);
  assert.deepEqual(afterCancel.completedStopIds, []);
});

// ── 7. Realtime/sync cannot restore a member-cancelled trip ──────────────────
// Reuses the exact, already-hardened closedTripIds mechanism from
// session-cancel-resurrection.test.ts — the reducer/fold logic has no actor
// identity, so a member's cancel is protected exactly the same way an
// owner's or shopper's is.

test('a stale remote push of the cancelled trip does not resurrect it, regardless of who cancelled', () => {
  const trip = tripWithShopper('shopper-id');
  const isClosedTripId = (tripId: string) => tripId === trip.tripId;

  // Local device already cancelled (any member) and is idle.
  const local = initialSession;
  // A stale peer still holds the old active session and pushes it up again.
  const merged = foldRemoteActiveSession(
    local as unknown as SharedShoppingSession,
    trip as unknown as SharedShoppingSession,
    isClosedTripId,
  );
  assert.equal(merged.status, 'idle', 'a remote push of an explicitly-closed tripId must not resurrect it');
  assert.equal(merged.tripId, null);
});

// ── 8-9. Receipts/history and store assignments are untouched by cancel ──────

test('END_TRIP does not touch receipts, trips, or any per-item store assignment data', () => {
  const trip = tripWithShopper('shopper-id');
  const withReceipt = reduce(trip, { type: 'TOGGLE_PICK', entryId: trip.entries[0].entryId, now: NOW + 1 });
  const afterCancel = reduce(withReceipt, { type: 'END_TRIP' });
  // The session carries no receipts array content post-cancel (session-level
  // receipts are trip-scoped and simply gone with the reset session)...
  assert.deepEqual(afterCancel.receipts, []);
  // ...and completedTrip (which would gate a durable.commitTrip / clearShoppingEntries
  // call in session-store.ts) is never populated by END_TRIP, unlike FINISH_TRIP.
  assert.equal(afterCancel.completedTrip, null);
});

// ── Wiring guards ──────────────────────────────────────────────────────────────

test('shoppingAccess.ts: END_TRIP is gated by canCancelTrip, not canManageTripLifecycle', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/shoppingAccess.ts'), 'utf8');
  assert.match(source, /canCancelTrip: boolean/);
  assert.match(source, /if \(type === 'END_TRIP'\) return capabilities\.canCancelTrip;/);
  // END_TRIP must no longer be a member of TRIP_LIFECYCLE_EVENTS (which is
  // gated by canManageTripLifecycle / isSelectedShopper).
  const setBody = source.slice(
    source.indexOf('const TRIP_LIFECYCLE_EVENTS'),
    source.indexOf(']);', source.indexOf('const TRIP_LIFECYCLE_EVENTS')),
  );
  assert.doesNotMatch(setBody, /'END_TRIP'/, 'END_TRIP must be removed from the shopper-only lifecycle set');
});

test('shopping.tsx: CancelTripLink in ShoppingActive is shown to any canCancelTrip member', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  const start = source.indexOf('function ShoppingActive(');
  const shoppingActive = source.slice(start, source.indexOf('function ReceiptPrompt('));
  assert.match(
    shoppingActive,
    /access\.canCancelTrip \? \(\s*\n\s*<CancelTripLink/,
    'CancelTripLink must render for canCancelTrip, independent of the Finish-store button\'s canManageTripLifecycle gate',
  );
});
