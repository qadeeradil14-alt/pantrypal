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
  assert.match(durable, /deletedItems: \[\.\.\.\(s\.deletedItems \?\? \[\]\)\.filter\(\(t\) => t\.id !== id\), \{ id, deletedAt: at \}\]/);
});

test('both snapshot functions include deletedItems so tombstones are persisted and pushed', () => {
  assert.match(durable, /deletedItems: s\.deletedItems \?\? \[\]/);
  assert.match(engine, /deletedItems: state\.deletedItems \?\? \[\]/);
});

test('the watermark skip paths still fold in remote items non-destructively', () => {
  // Two skip sites (pre-sign and post-sign) must both fold items/tombstones.
  const folds = engine.match(/applyRemotePatch\(\{\s*\n\s*items: [^\n]*\n\s*deletedItems: [^\n]*\n\s*updatedAt: store\.getState\(\)\.updatedAt,/g) ?? [];
  assert.ok(folds.length >= 2, `expected >=2 non-destructive folds in skip paths, found ${folds.length}`);
});
