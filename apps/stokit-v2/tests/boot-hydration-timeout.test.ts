import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withTimeout, PullTimeoutError } from '../core/services/withTimeout';

// ── Root cause ───────────────────────────────────────────────────────────────
//
// App boot is gated on `ready` in app/_layout.tsx, which requires
// `hydratedDurable` and `!authInitializing`. durableStore.hydrate() awaits
// startSyncEngine() -> householdId() -> ensureHousehold() -> rpc(), and the
// auth store's INITIAL_SESSION recovery path awaits refreshSession() to
// restore a session from a locally-backed-up refresh token. Neither call had
// a timeout, unlike the rest of the sync-pull path (see
// sync-pull-timeout.test.ts). On weak/unreliable connectivity either await
// could hang forever, permanently pinning the boot spinner.
//
// Fix: bound both calls with the existing withTimeout helper, and on timeout
// fall through to the same fail-safe behavior each call site already had for
// its other failure modes (rpc() throws -> caught by refresh()/ensureHousehold(),
// which never blocks householdId()/startSyncEngine()/hydrate() from settling;
// refreshSession() failing -> falls through to the cached-user fallback).

const householdStoreSource = readFileSync(join(process.cwd(), 'store/household-store.ts'), 'utf8');
const authStoreSource = readFileSync(join(process.cwd(), 'store/auth-store.ts'), 'utf8');
const durableStoreSource = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');

// ── 1. hanging household RPC times out and hydrate completes ───────────────

test('household-store rpc() wraps supabase.rpc in withTimeout', () => {
  const fn = householdStoreSource.slice(
    householdStoreSource.indexOf('async function rpc('),
    householdStoreSource.indexOf('async function rpcRequired('),
  );
  assert.match(
    fn,
    /await withTimeout\(supabase\.rpc\(name, args\), RPC_TIMEOUT_MS\)/,
    'the boot-path household RPC must be bounded so a stalled request cannot hang hydration forever',
  );
});

test('a timed-out rpc() rejects instead of hanging, matching the never-settling case', async () => {
  const neverSettlingRpc = new Promise(() => {}); // simulates a stalled supabase.rpc() call
  await assert.rejects(withTimeout(neverSettlingRpc, 20), PullTimeoutError);
});

test('ensureHousehold() and refresh() catch the rpc() failure so callers never hang on it', () => {
  const ensureHousehold = householdStoreSource.slice(
    householdStoreSource.indexOf('ensureHousehold: async'),
    householdStoreSource.indexOf('clearLocal: async'),
  );
  assert.match(ensureHousehold, /try\s*{[\s\S]*?}\s*catch \(error\)\s*{[\s\S]*?syncStatus:\s*'error'/, 'ensureHousehold must swallow the timeout, not rethrow it uncaught');

  const refresh = householdStoreSource.slice(
    householdStoreSource.indexOf('refresh: async'),
    householdStoreSource.indexOf('ensureHousehold: async'),
  );
  assert.match(refresh, /try\s*{[\s\S]*?}\s*catch \(error\)\s*{[\s\S]*?syncStatus:\s*'error'/, 'refresh must swallow the timeout, not rethrow it uncaught');
});

// ── 5. app ready state can progress after timeout ───────────────────────────

test('durableStore.hydrate() unconditionally sets hydrated true after startSyncEngine, unchanged', () => {
  assert.match(
    durableStoreSource,
    /await startSyncEngine\(\);\s*\n\s*set\(\{ hydrated: true \}\);/,
    'hydrate must still resolve to hydrated:true once startSyncEngine settles — a caught rpc timeout upstream must let this line run',
  );
});

// ── 3. successful RPC path unchanged ────────────────────────────────────────

test('rpc() still throws on a real error and returns the payload on success, unchanged', () => {
  const fn = householdStoreSource.slice(
    householdStoreSource.indexOf('async function rpc('),
    householdStoreSource.indexOf('async function rpcRequired('),
  );
  assert.match(fn, /if \(error\) throw error;/);
  assert.match(fn, /return data as HouseholdPayload;/);
});

// ── 2. hanging refreshSession times out and cached-user fallback runs ──────

test('auth-store wraps refreshSession in withTimeout and catches a timeout as a failure', () => {
  const initialSession = authStoreSource.slice(
    authStoreSource.indexOf("event === 'INITIAL_SESSION'"),
    authStoreSource.indexOf('// ── SIGNED_OUT'),
  );
  assert.match(
    initialSession,
    /await withTimeout\(\s*\n\s*supabase\.auth\.refreshSession\(\{ refresh_token: backup\.refresh_token \}\),\s*\n\s*AUTH_REFRESH_TIMEOUT_MS,\s*\n\s*\)/,
    'refreshSession must be bounded so a stalled network request cannot hang initializing forever',
  );
  assert.match(initialSession, /catch \(timeoutOrNetworkError\)\s*{[\s\S]*?refreshFailed = true;/, 'a timeout must be caught and treated as a failure, not left to reject uncaught');

  // The cached-user fallback must be reachable when refreshFailed is true,
  // not only when supabase returned an explicit error object.
  const successGate = initialSession.indexOf('if (!refreshFailed && refreshData && refreshData.session)');
  const fallback = initialSession.indexOf('if (backup.user)');
  assert.ok(successGate >= 0, 'success branch must key off refreshFailed, not the raw error alone');
  assert.ok(fallback > successGate, 'the cached-user fallback must run whenever the success branch is skipped, including on timeout');
});

test('a timed-out refreshSession rejects instead of hanging, matching the never-settling case', async () => {
  const neverSettlingRefresh = new Promise(() => {}); // simulates a stalled refreshSession() call
  await assert.rejects(withTimeout(neverSettlingRefresh, 20), PullTimeoutError);
});

// ── 4. successful refresh path unchanged ────────────────────────────────────

test('the refreshSession success branch still restores session/user and clears initializing, unchanged', () => {
  const initialSession = authStoreSource.slice(
    authStoreSource.indexOf("event === 'INITIAL_SESSION'"),
    authStoreSource.indexOf('// ── SIGNED_OUT'),
  );
  const successBranch = initialSession.slice(
    initialSession.indexOf('if (!refreshFailed && refreshData && refreshData.session)'),
    initialSession.indexOf('if (backup.user)'),
  );
  assert.match(successBranch, /saveBackup\(session\)/);
  assert.match(successBranch, /session,/);
  assert.match(successBranch, /user:\s*session\.user/);
  assert.match(successBranch, /initializing:\s*false/);
});

// ── 6. no regression in sync startup once connectivity returns ─────────────

test('startSyncEngine still subscribes to realtime and starts the fallback scheduler, unchanged', () => {
  const syncEngineSource = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const fn = syncEngineSource.slice(
    syncEngineSource.indexOf('export async function startSyncEngine'),
    syncEngineSource.indexOf('export function stopSyncEngine'),
  );
  assert.match(fn, /await pullFromSupabase\(\{ forceServerHydration: true \}\);/);
  assert.match(fn, /\.subscribe\(\(status, error\) => \{/);
  assert.match(fn, /realtimeFallbackScheduler\.start\(\);/);
});

test('the RPC and auth-refresh timeouts match the existing PULL_TIMEOUT_MS convention', () => {
  assert.match(householdStoreSource, /const RPC_TIMEOUT_MS = 10_000;/);
  assert.match(authStoreSource, /const AUTH_REFRESH_TIMEOUT_MS = 10_000;/);
});
