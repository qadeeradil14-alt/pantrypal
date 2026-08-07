import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Swipe-delete UI regression gate (OTA 472 follow-up).
 *
 * Field bug: onSwipeableWillOpen dispatched REMOVE_ENTRY unconditionally.
 * Once the OTA 472 picked-entry removal guard made that dispatch a no-op for
 * picked entries, the row never unmounted to carry its already-open
 * Swipeable away — it stayed stuck open, rendering only the full-height red
 * trash-icon reveal panel with the item content translated off-screen.
 *
 * This file has no component-rendering test harness (pure node:test only,
 * no react-native-testing-library) — verified via source assertions against
 * the exact swipe-row block, the same pattern already used by
 * golden-shopping-rollback.test.ts and geofencing.test.ts for this file.
 */

const screenSource = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

function swipeRowBlock(): string {
  const start = screenSource.indexOf('<Swipeable', screenSource.indexOf('key={e.entryId}'));
  const end = screenSource.indexOf('containerStyle={{ overflow: \'hidden\' }}', start);
  assert.ok(start > 0 && end > start, 'could not locate the shopping-list Swipeable row block');
  return screenSource.slice(start, end);
}

test('each shopping-list Swipeable row is held by a ref keyed on entryId', () => {
  const block = swipeRowBlock();
  assert.match(
    block,
    /ref=\{\(instance\) => \{ swipeableRefs\.set\(e\.entryId, instance\); \}\}/,
    'a ref must be attached so the row can be closed programmatically',
  );
  assert.match(
    screenSource,
    /const swipeableRefs = useRef<Map<string, Swipeable \| null>>\(new Map\(\)\)\.current;/,
    'the ref map must be declared at component scope, not per-row',
  );
});

test('picked entries close the swipe row and never dispatch REMOVE_ENTRY', () => {
  const block = swipeRowBlock();
  const pickedGuardMatch = block.match(
    /if \(e\.picked\) \{\s*swipeableRefs\.get\(e\.entryId\)\?\.close\(\);\s*Alert\.alert\([^)]*\);\s*return;\s*\}/,
  );
  assert.ok(pickedGuardMatch, 'onSwipeableWillOpen must check e.picked, close() the row, and return before any dispatch');

  // The picked branch must appear BEFORE the REMOVE_ENTRY dispatch in
  // source order, and must return early so the dispatch below is
  // unreachable for a picked entry.
  const dispatchIdx = block.indexOf("dispatch({ type: 'REMOVE_ENTRY'");
  const pickedIdx = block.indexOf('if (e.picked)');
  assert.ok(pickedIdx >= 0 && pickedIdx < dispatchIdx, 'the picked check must gate the dispatch, not follow it');
});

test('unpicked entries still dispatch REMOVE_ENTRY on swipe, unchanged', () => {
  const block = swipeRowBlock();
  assert.match(
    block,
    /dispatch\(\{ type: 'REMOVE_ENTRY', entryId: e\.entryId, now: Date\.now\(\) \}\);/,
    'the original delete dispatch must still exist for unpicked entries',
  );
  assert.match(block, /if \(!canEditActiveItems\) return;/, 'the existing permission gate is unchanged');
});

test('the close() path is wired to the same ref the row registers itself under', () => {
  const block = swipeRowBlock();
  // Both the registration and the close() call must key off the SAME
  // expression (e.entryId) so a close() call cannot silently target the
  // wrong row (or nothing) for a screen with multiple picked entries.
  const refKey = block.match(/swipeableRefs\.set\((.*?), instance\)/)?.[1];
  const closeKey = block.match(/swipeableRefs\.get\((.*?)\)\?\.close\(\)/)?.[1];
  assert.equal(refKey, 'e.entryId');
  assert.equal(closeKey, 'e.entryId');
});

test('OTA 472 picked-entry removal guards are untouched by this UI fix', () => {
  // Scope guard: this fix must be UI-only. The reducer/session-store/atomic
  // removal files carry no reference to swipeableRefs or this screen.
  const untouched = [
    'core/shopping-machine/machine.ts',
    'store/session-store.ts',
    'core/services/shoppingAtomicRemoval.ts',
  ];
  for (const f of untouched) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), f), 'utf8'), /swipeableRefs|Swipeable/);
  }
});
