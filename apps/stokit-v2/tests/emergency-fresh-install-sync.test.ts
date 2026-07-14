import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const syncSource = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
const durableStoreSource = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');

test('fresh empty state is never uploaded as a household snapshot', () => {
  assert.match(syncSource, /isEmptySharedSnapshot\(consistentState\)/,
    'pushLocalState must recognize a destructive empty snapshot');
  assert.match(syncSource, /empty_snapshot_push_blocked/,
    'the rejected write must leave an auditable trace');
});

test('fresh install hydrates server data before the durable store becomes interactive', () => {
  assert.match(durableStoreSource, /await startSyncEngine\(\);\s*set\(\{ hydrated: true \}\)/s,
    'durable hydration must await the sync bootstrap before setting hydrated');
  const startSync = syncSource.slice(
    syncSource.indexOf('export async function startSyncEngine'),
    syncSource.indexOf('export function stopSyncEngine'),
  );
  assert.match(startSync, /await pullFromSupabase\(\{ forceServerHydration: true \}\);/,
    'sync bootstrap must pull the server snapshot before subscribing');
});

test('a populated server snapshot still hydrates a fresh device even with an unusable timestamp', () => {
  assert.match(syncSource, /freshInstallHydration/,
    'fresh-device hydration must be explicit rather than relying only on timestamp ordering');
  assert.match(syncSource, /hasSharedSnapshotContent\(remote\)/,
    'the timestamp exception must require actual shared server content');
});

test('the first authenticated push waits for an initial household pull', () => {
  assert.match(syncSource, /initialHouseholdSyncComplete/,
    'sync readiness must be tracked per household after authentication');
  const pushSource = syncSource.slice(
    syncSource.indexOf('export async function pushLocalState'),
    syncSource.indexOf('export async function pullFromSupabase'),
  );
  assert.match(pushSource, /await pullFromSupabase\(\{ forceServerHydration: true \}\);/,
    'a device must pull server state before its first authenticated push');
  assert.match(pushSource, /if \(!initialHouseholdSyncComplete\.has\(id\)\) return;/,
    'failed bootstrap must block the write instead of guessing');
});
