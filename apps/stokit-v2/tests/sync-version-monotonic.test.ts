import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  shouldApplyRemoteSnapshot,
  resetSyncWatermark,
} from '../core/services/syncWatermark';

// ── Root cause: non-monotonic snapshot version ───────────────────────────────
//
// durable-store.ts's persist() stamps each snapshot with a version. The peer
// applies a remote snapshot only when shouldApplyRemoteSnapshot requires the
// remote version to be STRICTLY GREATER than the peer's local version (and the
// watermark). applyRemotePatch sets local.updatedAt to the applied remote
// version, so after applying a peer's snapshot this device's updatedAt equals
// the peer's (possibly clock-inflated) version.
//
// The bug: the OLD version formula, Math.max(now(), lastSnapshotAt + 1),
// ignores the current updatedAt. A device that just applied a peer snapshot
// (updatedAt raised to the peer's version) then makes a local edit and stamps a
// version derived only from its own wall clock / own write history — which can
// be LOWER than the peer's version. The peer then rejects that edit on the fast
// path, so updates stop propagating and sync degrades.

// Faithful models of the two persist() version formulas.
const oldVersion = (now: number, lastSnapshotAt: number) =>
  Math.max(now, lastSnapshotAt + 1);
const newVersion = (now: number, lastSnapshotAt: number, currentUpdatedAt: number) =>
  Math.max(now, lastSnapshotAt + 1, currentUpdatedAt + 1);

test('OLD formula regresses below an applied peer version → peer rejects the edit', () => {
  resetSyncWatermark();
  // This device applied a peer snapshot stamped with the peer's faster clock /
  // an inflated version; applyRemotePatch set local.updatedAt to that value.
  const appliedPeerVersion = 5_000;
  const localUpdatedAt = appliedPeerVersion;
  // Local wall clock is behind that version and this device never produced it.
  const now = 1_000;
  const lastSnapshotAt = 900;

  const editVersion = oldVersion(now, lastSnapshotAt);
  assert.equal(editVersion, 1_000);
  assert.ok(editVersion < localUpdatedAt, 'old formula regresses below the applied peer version');

  // Peer side: its local version is the one it authored (appliedPeerVersion).
  assert.equal(
    shouldApplyRemoteSnapshot(editVersion, appliedPeerVersion),
    false,
    'peer rejects the regressed edit on the fast path — the update stops propagating',
  );
});

test('NEW formula stays strictly monotonic → peer accepts the edit', () => {
  resetSyncWatermark();
  const appliedPeerVersion = 5_000;
  const localUpdatedAt = appliedPeerVersion;
  const now = 1_000;
  const lastSnapshotAt = 900;

  const editVersion = newVersion(now, lastSnapshotAt, localUpdatedAt);
  assert.equal(editVersion, 5_001);
  assert.ok(editVersion > localUpdatedAt, 'new formula never regresses below the applied peer version');

  assert.equal(
    shouldApplyRemoteSnapshot(editVersion, appliedPeerVersion),
    true,
    'peer accepts the monotonic edit on the fast path — sync keeps flowing',
  );
});

test('durable-store persist() uses the monotonic version formula', () => {
  const src = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(
    src,
    /const updatedAt = Math\.max\(now\(\), lastSnapshotAt \+ 1, get\(\)\.updatedAt \+ 1\);/,
    'the snapshot version must never regress below the current (last published/applied) version',
  );
});
