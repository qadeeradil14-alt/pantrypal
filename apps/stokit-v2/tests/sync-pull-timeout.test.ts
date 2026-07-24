import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withTimeout, PullTimeoutError } from '../core/services/withTimeout';

// ── Root cause (proven from real two-device diagnostic logs, OTA 391) ──────
//
// pullFromSupabase's network calls (the snapshot select, and each receipt's
// signed-URL fetch) had no timeout. On one device, a single stalled request
// left the promise pending forever. createDebouncedPullScheduler only calls
// pull() again after the current one settles (its `pulling` flag has no
// escape hatch), so that one hang silently blocked EVERY subsequent
// realtime-triggered pull on that device — confirmed by the iPhone log
// showing 17+ realtime_recv events with zero pull_path executions over a
// 289-second window, while the iPhone kept pushing its own local edits fine
// (pushes aren't gated by the same scheduler). This produced exactly the
// reported symptom: sync worked, then stopped in one direction only, while
// the other device kept converging normally.
//
// Fix: bound every pull-path network call with a timeout so pullFromSupabase
// always settles, letting the scheduler recover on the very next realtime
// event instead of waiting for an indefinite hang to resolve on its own.

test('withTimeout resolves normally when the promise settles in time', async () => {
  const fast = new Promise((resolve) => setTimeout(() => resolve('ok'), 5));
  assert.equal(await withTimeout(fast, 1000), 'ok');
});

test('withTimeout rejects a promise that never settles, instead of hanging forever', async () => {
  const neverSettles = new Promise(() => {}); // simulates a stalled network request
  await assert.rejects(withTimeout(neverSettles, 20), PullTimeoutError);
});

test('withTimeout propagates a genuine rejection from the wrapped promise', async () => {
  const failing = Promise.reject(new Error('network down'));
  await assert.rejects(withTimeout(failing, 1000), /network down/);
});

test('pullFromSupabase wraps the snapshot select in withTimeout', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const pull = source.slice(source.indexOf('export async function pullFromSupabase'));
  assert.match(
    pull,
    /await withTimeout\(\s*\n\s*supabase\.from\(CLOUD_TABLE\)\.select\('state, updated_at'\)\.eq\('household_id', id\)\.maybeSingle\(\),\s*\n\s*PULL_TIMEOUT_MS,/,
    'the snapshot select must be bounded so a stalled request cannot hang the pull forever',
  );
  assert.match(pull, /catch \(err\)/, 'a timed-out or failed select must be caught, not left to reject uncaught');
});

test('withSignedReceiptUrls wraps each signed-URL fetch in withTimeout', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const fn = source.slice(source.indexOf('async function withSignedReceiptUrls'), source.indexOf('async function uploadReceipt'));
  assert.match(
    fn,
    /await withTimeout\(\s*\n\s*supabase\.storage\.from\(RECEIPT_BUCKET\)\.createSignedUrl\(receipt\.imagePath, SIGNED_URL_TTL_SECONDS\),\s*\n\s*PULL_TIMEOUT_MS,/,
    'each receipt signed-URL fetch must be bounded — one stalled receipt must not block the whole pull',
  );
  assert.match(fn, /catch \{\s*\n(\s*\/\/[^\n]*\n)+\s*return receipt;/, 'a timed-out receipt must fall back to itself, not abort the batch');
});
