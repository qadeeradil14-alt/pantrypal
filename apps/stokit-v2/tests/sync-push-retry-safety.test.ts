/**
 * Regression gate: household-tester Issue 3 (receipt/trip/history vanished).
 *
 * Root cause: pushLocalState()'s final Supabase upsert and uploadReceipt()'s
 * Storage upload both silently swallowed failures (dev-only console.warn, no
 * retry, no propagation). trips/receipts/activity/purchasedItems all live
 * inside the single household_snapshots JSON blob, so one failed push meant
 * a partner device received nothing — while the capturing device's own local
 * state looked completely normal, hiding the failure.
 *
 * Fix under test: bounded retry-with-backoff on both operations (both are
 * idempotent — upsert on household_id, storage upload with upsert:true — so
 * retries cannot create duplicate records), a capped single deferred re-push
 * on final upsert failure, and nulling imageUri (never a duplicate/garbage
 * record) for receipts whose upload permanently failed so a receiving device
 * never inherits another device's inaccessible local file:// path.
 *
 * There is no Supabase mock harness in this suite, so — matching the existing
 * convention for this exact file in shopping-notification.test.ts and
 * geofencing.test.ts — this is a static source-text regression gate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const syncPath = path.join(__dirname, '../core/services/syncEngine.ts');
const syncSrc = fs.readFileSync(syncPath, 'utf-8');

test('[Issue 3] snapshot push retries on failure instead of silently giving up once', () => {
  assert.ok(/RETRY_ATTEMPTS\s*=\s*3/.test(syncSrc), 'a bounded retry count must be defined');
  assert.ok(syncSrc.includes('for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)'),
    'pushLocalState must retry the upsert, not fail after a single attempt');
});

test('[Issue 3] receipt storage upload retries on failure instead of silently giving up once', () => {
  const uploadReceiptSrc = syncSrc.slice(
    syncSrc.indexOf('async function uploadReceipt'),
    syncSrc.indexOf('export async function pushLocalState'),
  );
  assert.ok(uploadReceiptSrc.includes('for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)'),
    'uploadReceipt must retry the storage upload, not fail after a single attempt');
});

test('[Issue 3] permanently-failed receipt uploads never leak a device-local file:// URI into the pushed snapshot', () => {
  assert.ok(syncSrc.includes("!receipt.imagePath && receipt.imageUri?.startsWith('file://')"),
    'push must detect receipts with no imagePath still carrying a local file:// URI');
  assert.ok(/cloudReceipts\s*=\s*receipts\.map/.test(syncSrc),
    'push must build a distinct cloud-bound receipts array so the null-out never touches the local store patch');
});

test('[Issue 3 → reconnect flush] a failed push keeps retrying on capped backoff, not a tight or unbounded loop', () => {
  // Superseded behaviour: the original fix scheduled EXACTLY ONE deferred retry
  // then gave up, to avoid an unbounded loop. That also meant edits made while
  // offline never reached other devices on reconnect (no NetInfo listener) —
  // they only synced after a fresh mutation. The retry is now persistent but
  // safe: a single timer (no stacking), capped exponential backoff (≤30s, so
  // no tight spin), re-reading fresh state, and cleared on the first success.
  // See offline-flush-retry.test.ts for the reconnect-recovery gate.
  assert.ok(/function scheduleOfflineFlush\(\): void/.test(syncSrc),
    'push failures must schedule a persistent backoff flush');
  assert.ok(syncSrc.includes('if (pendingFlushTimer) return;'),
    'only one flush timer may be pending at a time (no stacked/tight loop)');
  assert.ok(/Math\.min\(pendingFlushDelayMs \* 2, FLUSH_MAX_DELAY_MS\)/.test(syncSrc),
    'the retry delay must grow with a hard cap so it never becomes a tight loop');
  assert.ok(syncSrc.includes('durableSnapshot(store.getState())'),
    'the retry must re-read fresh current state, not resend the stale captured snapshot');
  const clearIndex = syncSrc.indexOf('clearOfflineFlush();', syncSrc.indexOf('export async function pushLocalState'));
  const installIndex = syncSrc.indexOf('replaceWithServerSnapshot', clearIndex);
  const markIndex = syncSrc.indexOf('markPushed', installIndex);
  assert.ok(clearIndex > 0 && installIndex > clearIndex && markIndex > installIndex,
    'a successful push must stop the retry loop, durably install server state, then mark its echo');
});

test('[Issue 3] retried snapshot and upload writes remain idempotent', () => {
  assert.ok(syncSrc.includes(".eq('household_id', id)"),
    'snapshot updates must stay keyed on household_id');
  assert.ok(syncSrc.includes(".eq('updated_at', remoteUpdatedAt)"),
    'snapshot retries must use compare-and-set so stale writes cannot overwrite newer state');
  assert.ok(syncSrc.includes('upsert: true'),
    'storage upload must stay upsert:true so retries overwrite, never duplicate');
});

test('[Issue 3] successful-push log stays dev-gated (no console.log left in production paths)', () => {
  assert.ok(syncSrc.includes("if (__DEV__) console.log(`[Shopping Sync] active_session_snapshot_written"),
    'the snapshot-written log must be gated behind __DEV__');
  assert.ok(syncSrc.includes('active_session_snapshot_written'),
    'shopping-notification.test.ts still requires this exact log marker to be present in source');
});
