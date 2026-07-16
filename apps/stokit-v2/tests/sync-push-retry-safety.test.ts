/**
 * Regression gate: household-tester Issue 3 (receipt/trip/history vanished).
 *
 * Root cause: the old shared snapshot upsert and uploadReceipt()'s
 * Storage upload both silently swallowed failures (dev-only console.warn, no
 * retry, no propagation). trips/receipts/activity/purchasedItems all live
 * inside the single household_snapshots JSON blob, so one failed push meant
 * a partner device received nothing — while the capturing device's own local
 * state looked completely normal, hiding the failure.
 *
 * Fix under test: bounded retry-with-backoff on both operations (both are
 * idempotent — upsert on the replica primary key, storage upload with upsert:true — so
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
  assert.ok(syncSrc.includes('for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1)'),
    'pushLocalState must retry the upsert, not fail after a single attempt');
});

test('[Issue 3] receipt storage upload retries on failure instead of silently giving up once', () => {
  const uploadReceiptSrc = syncSrc.slice(
    syncSrc.indexOf('async function uploadReceipt'),
    syncSrc.indexOf('async function prepareLatestState'),
  );
  assert.ok(uploadReceiptSrc.includes('for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1)'),
    'uploadReceipt must retry the storage upload, not fail after a single attempt');
});

test('[Issue 3] permanently-failed receipt uploads never leak a device-local file:// URI into the pushed snapshot', () => {
  assert.ok(syncSrc.includes("receipt.imageUri?.startsWith('file://')"),
    'push must detect receipts with no imagePath still carrying a local file:// URI');
  assert.ok(/receipts:\s*state\.receipts\.map\(cloudReceipt\)/.test(syncSrc),
    'push must build a distinct cloud-bound receipts array so the null-out never touches the local store patch');
});

test('[Issue 3] a final upsert failure schedules exactly one capped deferred retry, not an unbounded loop', () => {
  const pushSrc = syncSrc.slice(
    syncSrc.indexOf('async function convergeCanonical'),
    syncSrc.indexOf('export function pushLocalState'),
  );
  assert.ok(pushSrc.includes('isDeferredRetry'),
    'pushLocalState must accept a flag marking a call as an already-deferred retry');
  assert.ok(/if \(!options\?\.isDeferredRetry && !deferredRetryScheduled\)/.test(pushSrc),
    'a deferred retry must not itself schedule another deferred retry (would allow unbounded retries)');
  assert.ok(syncSrc.includes('durableSnapshot(store.getState())'),
    'the deferred retry must re-read fresh current state, not resend the stale captured snapshot');
});

test('[Issue 3] retried upsert and upload remain idempotent (no duplicate-record risk from retries)', () => {
  assert.ok(syncSrc.includes(".eq('updated_at', observedRevision)"),
    'snapshot retries must use compare-and-swap so they cannot overwrite a concurrent commit');
  assert.ok(syncSrc.includes('upsert: true'),
    'storage upload must stay upsert:true so retries overwrite, never duplicate');
});

test('[Issue 3] successful-push log stays dev-gated (no console.log left in production paths)', () => {
  assert.ok(syncSrc.includes("if (__DEV__) console.log(`[Sync] canonical.commit"),
    'the canonical-write log must be gated behind __DEV__');
  assert.ok(syncSrc.includes('canonical.commit'),
    'shopping-notification.test.ts still requires a successful push marker');
});
