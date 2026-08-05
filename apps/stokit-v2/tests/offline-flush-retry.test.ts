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
const coordinator = readFileSync(join(process.cwd(), 'core/services/householdPushCoordinator.ts'), 'utf8');

test('the give-up-after-one-retry behaviour is gone', () => {
  assert.doesNotMatch(src, /if \(!options\?\.isDeferredRetry\)/);
});

test('a capped exponential backoff flush exists', () => {
  assert.match(coordinator, /OFFLINE_INITIAL_DELAY_MS = 2_000/);
  assert.match(coordinator, /Math\.min\(state\.offlineDelayMs \* 2, OFFLINE_MAX_DELAY_MS\)/);
  assert.match(coordinator, /OFFLINE_MAX_DELAY_MS = 30_000/);
});

test('push failure schedules a retry; success clears it', () => {
  assert.match(coordinator, /outcome\.type === 'network-failure'/);
  assert.match(coordinator, /scheduleRetry\([\s\S]*?householdId,[\s\S]*?state,[\s\S]*?'offline-backoff',[\s\S]*?state\.offlineDelayMs/);
  assert.match(coordinator, /state\.offlineDelayMs = 0/);
  const installIndex = src.indexOf('replaceWithServerSnapshot');
  const markIndex = src.indexOf('markPushed', installIndex);
  assert.ok(installIndex > 0 && markIndex > installIndex);
});
