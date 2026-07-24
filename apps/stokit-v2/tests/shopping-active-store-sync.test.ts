import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The passive pantry -> active-trip sync effect in ShoppingActive is a React
// effect, not a pure function — its eligibility gates (unassigned items,
// tombstones) can't be exercised through the reducer directly. Verified here
// as source-regex assertions, matching this codebase's convention for RN
// component files that can't be imported into a plain node:test run.

const shopping = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

const syncEffect = shopping.slice(
  shopping.indexOf('useEffect(() => {\n    const entryIds = new Set(session.entries'),
  shopping.indexOf('const handleNotifyHousehold'),
);

test('the active-trip sync effect exists and is isolated for inspection', () => {
  assert.ok(syncEffect.length > 0, 'could not locate the sync effect — slice boundaries may be stale');
});

test('eligibility no longer requires the item to match the current store', () => {
  assert.doesNotMatch(syncEffect, /item\.storeId === storeId/,
    'the current-store-only gate must be removed — items for any store should join the active trip');
});

test('unassigned items (no storeId) are still ignored', () => {
  assert.match(syncEffect, /item\.storeId &&/,
    'a truthy-storeId check must remain so items with no store assignment never enter the trip');
});

test('tombstoned (removed) items still never resurrect', () => {
  assert.match(syncEffect, /!removedItemIds\.has\(item\.id\)/,
    'the removedItemIds guard must be preserved so REMOVE_ENTRY tombstones still hold');
});

test('items already present as an entry are still skipped (no duplicate dispatch)', () => {
  assert.match(syncEffect, /!entryIds\.has\(item\.id\)/,
    'the entryIds guard must be preserved regardless of which store the entry is under');
});

test('the dispatched entry keeps the item\'s own storeId — no re-homing to the current store', () => {
  assert.match(syncEffect, /storeId:\s*item\.storeId!/,
    'ADD_ENTRY must carry the item\'s actual assigned store, not the outer current-store variable');
  assert.doesNotMatch(syncEffect, /entry:\s*\{[^}]*storeId,\s*picked: false\s*\}/,
    'the entry must not be built with the bare current-store `storeId` shorthand anymore');
});

test('the effect no longer depends on the current store for its dependency array', () => {
  const depsLine = syncEffect.slice(syncEffect.lastIndexOf('}, ['));
  assert.doesNotMatch(depsLine, /\[items, storeId,/,
    'storeId is no longer read inside the effect body, so it must not gate re-runs either');
});
