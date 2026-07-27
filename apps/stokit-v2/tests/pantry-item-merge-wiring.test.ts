import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// The per-item merge (mergePantryState) is unit-tested in merge-pantry-state.test.ts.
// These assertions lock in the wiring so a refactor can't silently revert to the
// old whole-array overwrite that dropped items added on another device.

const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
const engine = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');

test('applyRemotePatch merges items per-item instead of overwriting with the remote array', () => {
  assert.match(durable, /import \{ mergePantryItems, mergeTombstones \} from '\.\.\/core\/services\/mergePantryState'/);
  assert.match(durable, /mergePantryItems\(s\.items, patch\.items, mergedTombstones\)/);
  // The old lossy overwrite must be gone.
  assert.doesNotMatch(durable, /items:\s*patch\.items\s*\?\s*consolidatePantryItems\(patch\.items\)\s*:/);
});

test('deleteItem records a tombstone so deletions sync instead of resurrecting', () => {
  const deleteItem = durable.slice(durable.indexOf('deleteItem: (id) => {'), durable.indexOf('addStore: (input) => {'));
  assert.match(deleteItem, /nextTimestamp\(/,
    'a behind-clock device must stamp deletion after the newest item/tombstone version it has observed');
  assert.match(deleteItem, /deletedItems: \[\.\.\.\(s\.deletedItems \?\? \[\]\)\.filter\(\(t\) => t\.id !== id\), \{ id, deletedAt: at \}\]/);
});

test('both snapshot functions include deletedItems so tombstones are persisted and pushed', () => {
  assert.match(durable, /deletedItems: s\.deletedItems \?\? \[\]/);
  assert.match(engine, /deletedItems: state\.deletedItems \?\? \[\]/);
});

test('the watermark skip paths still fold in remote items non-destructively', () => {
  // Two skip sites (pre-sign and post-sign) must both fold items/tombstones.
  const folds = engine.match(/applyRemotePatch\(\{\s*\n\s*items: [^\n]*\n\s*deletedItems: [^\n]*\n[\s\S]*?updatedAt: store\.getState\(\)\.updatedAt,/g) ?? [];
  assert.ok(folds.length >= 2, `expected >=2 non-destructive folds in skip paths, found ${folds.length}`);
});

test('the watermark skip paths also fold in the active session, not just items', () => {
  // A stale whole-snapshot watermark must not permanently skip reconciling an
  // in-progress shopping trip — only items/tombstones were folded before,
  // which left a force-closed device's active session stuck stale forever.
  const activeSessionFolds = (engine.match(/hasActiveSession \? \{[\s\S]*?activeSession/g) ?? []).length
    + (engine.match(/hasActiveSession \? \{ activeSession:/g) ?? []).length;
  assert.ok(activeSessionFolds >= 1, 'expected the skip paths to conditionally fold activeSession when present');
  assert.match(engine, /Array\.isArray\(remote\.items\) \|\| Array\.isArray\(remote\.deletedItems\) \|\| hasActiveSession/,
    'pre-sign skip guard must also consider activeSession presence');
  assert.match(engine, /Array\.isArray\(reconciledRemote\.items\) \|\| Array\.isArray\(reconciledRemote\.deletedItems\) \|\| hasActiveSession/,
    'post-sign skip guard must also consider activeSession presence');
});
