import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Regression gate: edits made while offline must reach other devices when
 * connectivity returns, WITHOUT needing a fresh mutation or an app foreground.
 *
 * Bug: pushLocalState used to schedule exactly one deferred retry and then give
 * up (guarded by `if (!options?.isDeferredRetry)`). In airplane mode that single
 * retry also failed, so nothing re-pushed on reconnect — the queued items only
 * synced once the user made another edit (which triggered a fresh push). There
 * is no NetInfo listener, so the push path itself must be reconnect-resilient.
 *
 * Fix under test: a capped exponential backoff (`scheduleOfflineFlush`) that
 * keeps retrying until a push succeeds, cleared on success.
 */
const src = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');

test('the give-up-after-one-retry behaviour is gone', () => {
  assert.doesNotMatch(src, /if \(!options\?\.isDeferredRetry\)/);
});

test('a capped exponential backoff flush exists', () => {
  assert.match(src, /function scheduleOfflineFlush\(\): void/);
  assert.match(src, /Math\.min\(pendingFlushDelayMs \* 2, FLUSH_MAX_DELAY_MS\)/);
  assert.match(src, /if \(pendingFlushTimer\) return;/); // no stacked timers
});

test('push failure schedules a retry; success clears it', () => {
  // Both the returned-error path and the thrown-error (catch) path must retry.
  const scheduleCalls = src.match(/scheduleOfflineFlush\(\);/g) ?? [];
  assert.ok(scheduleCalls.length >= 2, `expected >=2 scheduleOfflineFlush() calls, found ${scheduleCalls.length}`);
  assert.match(src, /clearOfflineFlush\(\);\s*\n\s*markPushed\(snapshot\.updatedAt\);/);
});
