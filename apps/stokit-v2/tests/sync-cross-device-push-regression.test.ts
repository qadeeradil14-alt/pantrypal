/**
 * Regression gate: two-device cross-device sync P0 (real-device testing, 2026-07).
 *
 * Root cause: pushLocalState()'s initial-sync gate contained a second,
 * unconditional `return;` immediately after the guarded
 * `if (!initialHouseholdSyncComplete.has(id)) return;` line. Once a household
 * completed its first sync (the guard passed), the second bare `return;`
 * still fired unconditionally, exiting pushLocalState before it ever reached
 * the Supabase upsert. Every local mutation on every device after the first
 * sync was silently dropped — the local device believed the write succeeded
 * (no error, no thrown exception), but nothing was ever pushed to Supabase,
 * so no other device could ever receive it. This is why shopping trips could
 * be created/modified/finalized locally, but cross-device sync between two
 * devices never worked.
 *
 * There is no Supabase mock harness in this suite, so — matching the existing
 * convention for this exact file in sync-push-retry-safety.test.ts and
 * emergency-fresh-install-sync.test.ts — this is a static source-text
 * regression gate rather than a runtime two-device simulation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const syncPath = path.join(__dirname, '../core/services/syncEngine.ts');
const syncSrc = fs.readFileSync(syncPath, 'utf-8');
const pushSrc = syncSrc.slice(
  syncSrc.indexOf('export async function pushLocalState'),
  syncSrc.indexOf('export async function pullFromSupabase'),
);

test('[P0] pushLocalState has no dead-code return after the initial-sync gate', () => {
  assert.doesNotMatch(
    pushSrc,
    /if \(!initialHouseholdSyncComplete\.has\(id\)\) return;\s*return;/,
    'a second unconditional return immediately after the guarded return silently drops every push once a household has completed its first sync — this exact regression broke cross-device sync in production',
  );
});

test('[P0] the initial-sync gate falls through to the guarded snapshot write once a household has synced', () => {
  assert.match(
    pushSrc,
    /if \(!initialHouseholdSyncComplete\.has\(id\)\) \{\s*await pullFromSupabase\(\{ forceServerHydration: true \}\);\s*if \(!initialHouseholdSyncComplete\.has\(id\)\) return;\s*\}/,
    'the gate must only exit early when the household has never completed a sync — any other exit before the try block silently blocks every subsequent push',
  );

  const gateMatch = pushSrc.match(/if \(!initialHouseholdSyncComplete\.has\(id\)\) \{[\s\S]*?\n  \}/);
  const writeIndex = pushSrc.indexOf(".update({ state: snapshot, updated_at: writeAt })");
  assert.ok(gateMatch, 'expected to locate the initial-sync gate block');
  assert.ok(
    writeIndex > (gateMatch!.index! + gateMatch![0].length),
    'the guarded snapshot write must be reachable after the initial-sync gate',
  );
});
