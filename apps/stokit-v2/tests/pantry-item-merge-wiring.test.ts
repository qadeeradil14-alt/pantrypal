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

test('a deletion-only snapshot is not mistaken for an empty destructive write', () => {
  for (const field of ['deletedItems', 'deletedStores', 'deletedTrips', 'deletedReceipts', 'closedTripIds']) {
    assert.match(engine, new RegExp(`state\\.${field}\\?\\.length`));
  }
  assert.match(engine, /Object\.keys\(state\.prefsUpdatedAt \?\? \{\}\)\.length/);
});

test('the watermark skip paths still fold in remote items non-destructively', () => {
  const folds = engine.match(/const folded = mergeDurableSnapshotForPush\(/g) ?? [];
  assert.ok(folds.length >= 2, `expected >=2 non-destructive folds in skip paths, found ${folds.length}`);
  assert.match(engine, /applyRemotePatch\(\{\s*\n\s*\.\.\.folded,/);
});

test('the watermark skip paths also fold in the active session, not just items', () => {
  // A stale whole-snapshot watermark must not permanently skip reconciling an
  // in-progress shopping trip — only items/tombstones were folded before,
  // which left a force-closed device's active session stuck stale forever.
  assert.match(engine, /activeSession: folded\.activeSession/);
  assert.match(engine, /activeSession: store\.getState\(\)\.activeSession/,
    'snapshots predating activeSession must preserve the local session');
});
