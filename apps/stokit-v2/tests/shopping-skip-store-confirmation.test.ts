/**
 * Focused suite: the Skip Store confirmation copy.
 *
 * Skipping a store is already correct as of OTA 452 — unbought items stay on
 * the list and their store assignment is released, so they return as
 * unassigned needs the shopper can re-home. Nothing explained that, so the
 * later "choose a store" screen read as though the trip had restarted or
 * something had gone wrong.
 *
 * Before this change the Skip control dispatched SKIP_STORE immediately on a
 * single tap with no confirmation at all. This adds one — using the same
 * native Alert.alert pattern the screen already uses for Cancel trip, End
 * trip and "Nothing checked off" — so it introduces no new component, screen,
 * React state or flow. The confirm button's dispatch is byte-identical to the
 * one the Pressable previously fired directly.
 *
 * This suite is copy/wiring only: the reducer's SKIP_STORE / UNSKIP_STORE
 * behaviour is covered by shopping-post-store-decision.test.ts and
 * shopping-trip-close-assignment-release.test.ts and is asserted here to be
 * untouched.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { initialSession, reduce, pendingStops } from '../core/shopping-machine';

const screen = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

/** The Skip control's onPress, from the pending-stop card in PostStoreDecision. */
function skipControlSource(): string {
  const start = screen.indexOf('Alert.alert(\n                      `Skip ${');
  assert.ok(start > -1, 'the Skip control must show a confirmation before skipping');
  return screen.slice(start, screen.indexOf('</Pressable>', start));
}

// ── 1-2. The confirmation explains what actually happens ─────────────────────

test('1. the confirmation says unbought items STAY on the shopping list', () => {
  const alert = skipControlSource();
  assert.match(
    alert,
    /Unbought items from this store will stay on your shopping list/,
    'the shopper must be told their unbought items are not lost',
  );
});

test('2. the confirmation says those items become UNASSIGNED and can be re-homed', () => {
  const alert = skipControlSource();
  assert.match(alert, /become unassigned/, 'the shopper must be told the store assignment is released');
  assert.match(
    alert,
    /You can choose another store for them later\./,
    'and that re-homing them later is the expected next step',
  );
});

test('2b. the title names the store dynamically and the buttons are Cancel / Skip store', () => {
  const alert = skipControlSource();
  assert.match(alert, /`Skip \$\{pendingStore\?\.name \?\? 'this store'\}\?`/, 'dynamic store name, with a safe fallback');
  assert.match(alert, /text: 'Cancel',\s*style: 'cancel'/);
  assert.match(alert, /text: 'Skip store',\s*\n\s*style: 'destructive'/, 'destructive styling on the confirming action');
});

// ── 3. Cancel is inert ───────────────────────────────────────────────────────

test('3. Cancel carries no onPress, so dismissing mutates nothing', () => {
  const alert = skipControlSource();
  const cancelButton = alert.slice(alert.indexOf("text: 'Cancel'"), alert.indexOf("text: 'Skip store'"));
  assert.doesNotMatch(cancelButton, /onPress/, 'the Cancel button must have no handler at all');
  assert.doesNotMatch(cancelButton, /dispatch\(/, 'and must never dispatch');
});

test('3b. the only dispatch in the whole control is behind the confirming button', () => {
  const alert = skipControlSource();
  assert.equal(
    (alert.match(/dispatch\(\{/g) ?? []).length, 1,
    'exactly one dispatch — nothing fires on open or on cancel',
  );
  const beforeConfirm = alert.slice(0, alert.indexOf("text: 'Skip store'"));
  assert.doesNotMatch(beforeConfirm, /dispatch\(\{/, 'nothing dispatches before the shopper confirms');
});

// ── 4. The existing action is reused verbatim ────────────────────────────────

test('4. confirming dispatches the exact pre-existing SKIP_STORE action', () => {
  const alert = skipControlSource();
  assert.match(
    alert,
    /onPress: \(\) => dispatch\(\{ type: 'SKIP_STORE', storeId: stop\.storeId, now: Date\.now\(\) \}\)/,
    'byte-identical to the dispatch the Pressable used to fire directly',
  );
});

test('4b. SKIP_STORE / UNSKIP_STORE reducer behaviour is unchanged', () => {
  // Three stores, so skipping one still leaves a pending stop and the session
  // stays at the post-store decision point. (Skipping the LAST remaining store
  // correctly ends the trip instead — covered by shopping-post-store-decision.)
  let s = reduce(initialSession, {
    type: 'START_TRIP', now: 1000, shopperId: 'owner',
    entries: [
      { pantryItemId: 'apple', name: 'Apple', quantity: 1, unit: 'unit', storeId: 'a', picked: false },
      { pantryItemId: 'bread', name: 'Bread', quantity: 1, unit: 'unit', storeId: 'b', picked: false },
      { pantryItemId: 'cheese', name: 'Cheese', quantity: 1, unit: 'unit', storeId: 'c', picked: false },
    ],
  });
  s = reduce(s, { type: 'FINISH_STORE', now: 1100 });
  s = reduce(s, { type: 'SKIP_RECEIPT', now: 1101 });
  assert.equal(s.status, 'store_summary');

  const skipped = reduce(s, { type: 'SKIP_STORE', storeId: 'b', now: 1200 });
  assert.ok(skipped.skippedStoreIds.includes('b'), 'b is recorded as skipped');
  assert.deepEqual(pendingStops(skipped).map((p) => p.storeId), ['c'], 'a skipped store is not pending; c still is');
  assert.equal(skipped.entries.filter((e) => e.storeId === 'b').length, 1, 'its unbought item is retained');

  const unskipped = reduce(skipped, { type: 'UNSKIP_STORE', storeId: 'b', now: 1300 });
  assert.ok(!unskipped.skippedStoreIds.includes('b'));
  assert.deepEqual(
    pendingStops(unskipped).map((p) => p.storeId).sort(), ['b', 'c'],
    'explicit un-skip restores it',
  );
});

// ── 5. Nothing but copy changed ──────────────────────────────────────────────

/**
 * The whole Skip <Pressable>, including its onPress body.
 *
 * This replaces an earlier `git diff --name-only HEAD` assertion. That check
 * could only ever pass while the change sat uncommitted in the working tree,
 * so it inverted into a permanent failure the moment the change landed. The
 * property it was really protecting — that this is copy/wiring only, confined
 * to this screen — is a stable fact about the source, asserted below. The
 * "no reducer or store change" half is already covered durably by tests 4
 * (exact pre-existing dispatch) and 4b (reducer behaviour unchanged).
 */
function skipControlPressable(): string {
  const alertStart = screen.indexOf('Alert.alert(\n                      `Skip ${');
  assert.ok(alertStart > -1, 'the Skip control must show a confirmation before skipping');
  return screen.slice(
    screen.lastIndexOf('<Pressable', alertStart),
    screen.indexOf('</Pressable>', alertStart),
  );
}

test('5. the confirmation is pure wiring — no new component, screen or React state', () => {
  const control = skipControlPressable();
  // A confirmation built as a modal or sheet would set state here and render
  // elsewhere. This one calls Alert.alert inline from the control's own
  // onPress, which is exactly why the change stays inside this screen.
  assert.match(
    control,
    /onPress=\{\(\) => \{[\s\S]*Alert\.alert\(/,
    'the Alert fires inline from the control’s own onPress',
  );
  assert.doesNotMatch(
    control,
    /useState|setShow|setConfirm|<Modal|<Sheet/,
    'no dedicated state or component backs the confirmation',
  );
});

test('5b. the skip control keeps its existing styling and visible label', () => {
  const start = screen.indexOf('Alert.alert(\n                      `Skip ${');
  const control = screen.slice(screen.lastIndexOf('<Pressable', start), screen.indexOf('</Pressable>', start));
  assert.match(control, /style=\{nsStyles\.skipStoreBtn\}/, 'unchanged button styling');
  assert.match(control, /<Text style=\{nsStyles\.skipStoreText\}>Skip \{pendingStore\?\.name \?\? 'this store'\}<\/Text>/,
    'unchanged visible label, which is also the accessibility label');
});
