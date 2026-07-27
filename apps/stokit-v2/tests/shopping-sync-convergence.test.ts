import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLatestSnapshotQueue } from '../core/services/latestSnapshotQueue';
import {
  createDebouncedPullScheduler,
  createRealtimeFallbackScheduler,
} from '../core/services/realtimePullScheduler';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a 15-item active trip converges to the newest snapshot after a slow prior write', async () => {
  const sent: number[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = createLatestSnapshotQueue(async (itemCount: number) => {
    sent.push(itemCount);
    if (itemCount === 13) await firstWrite;
  });

  void queue.enqueue(13);
  await wait(0);
  void queue.enqueue(14);
  void queue.enqueue(15);
  releaseFirst?.();
  await queue.whenIdle();

  assert.deepEqual(sent, [13, 15], 'intermediate snapshots must not delay the final 15-item state');
});

test('rapid check/uncheck changes are batched without concurrent snapshot writes', async () => {
  const sent: string[] = [];
  let activeWrites = 0;
  let peakWrites = 0;
  const queue = createLatestSnapshotQueue(async (state: string) => {
    activeWrites += 1;
    peakWrites = Math.max(peakWrites, activeWrites);
    sent.push(state);
    await wait(2);
    activeWrites -= 1;
  });

  void queue.enqueue('checked');
  void queue.enqueue('unchecked');
  void queue.enqueue('checked-final');
  await queue.whenIdle();

  assert.equal(peakWrites, 1, 'snapshot writes must remain serialized');
  assert.equal(sent.at(-1), 'checked-final', 'the final item state must be sent');
  assert.ok(sent.length <= 2, 'rapid changes must not create duplicate outbound writes');
});

test('a picked-up activity is included in the active-session snapshot instead of creating a stale pre-session write', () => {
  const session = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');
  assert.match(session, /durable\.logActivity\([\s\S]*?\}, false\);/,
    'SET_PICK activity must not independently persist before the new active session is stored');
});

test('bursty realtime events cause one debounced pull and one follow-up only when an event arrives mid-pull', async () => {
  let pulls = 0;
  let releasePull: (() => void) | undefined;
  const firstPull = new Promise<void>((resolve) => { releasePull = resolve; });
  const scheduler = createDebouncedPullScheduler(async () => {
    pulls += 1;
    if (pulls === 1) await firstPull;
  }, 1);

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  await wait(5);
  assert.equal(pulls, 1, 'a realtime burst must schedule one pull');

  scheduler.schedule();
  releasePull?.();
  await scheduler.whenIdle();
  assert.equal(pulls, 2, 'an event during a pull must schedule exactly one follow-up');
});

test('a failed realtime pull retries without requiring another event or tab refocus', async () => {
  let pulls = 0;
  const scheduler = createDebouncedPullScheduler(async () => {
    pulls += 1;
    return pulls > 1;
  }, 1, 1);

  scheduler.schedule();
  await scheduler.whenIdle();

  assert.equal(pulls, 2, 'the dropped snapshot must be fetched again after a transient pull failure');
});

test('cancelling sync while a failed pull is in flight does not retry the old household', async () => {
  let pulls = 0;
  let releasePull: (() => void) | undefined;
  const firstPull = new Promise<void>((resolve) => { releasePull = resolve; });
  const scheduler = createDebouncedPullScheduler(async () => {
    pulls += 1;
    await firstPull;
    return false;
  }, 1, 1);

  scheduler.schedule();
  await wait(5);
  scheduler.cancel();
  releasePull?.();
  await wait(5);

  assert.equal(pulls, 1, 'stopSyncEngine must cancel retries belonging to the previous household');
});

test('the realtime fallback keeps polling until the sync engine stops', async (t) => {
  let pulls = 0;
  const fallback = createRealtimeFallbackScheduler(() => {
    pulls += 1;
  }, 1);
  t.after(() => fallback.stop());

  fallback.start();
  await wait(25);
  assert.ok(pulls >= 2, 'a member device with no database subscription must keep catching up');

  fallback.stop();
  const stoppedAt = pulls;
  await wait(10);
  assert.equal(pulls, stoppedAt, 'stopSyncEngine must stop fallback polling');
});

test('a channel status alone cannot stop fallback polling', () => {
  const source = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const subscription = source.slice(source.indexOf('.subscribe((status, error)'), source.indexOf('export function stopSyncEngine'));
  assert.doesNotMatch(
    subscription,
    /status === 'SUBSCRIBED'[\s\S]*?realtimeFallbackScheduler\.stop\(\)/,
    'the iPad can report SUBSCRIBED without a registered postgres_changes subscription',
  );
});

test('Shopping tab focus pulls after a missed realtime event', () => {
  const shopping = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  assert.match(shopping, /useFocusEffect\(/, 'Shopping must react when the tab receives focus');
  assert.match(shopping, /pullFromSupabase\(\)/, 'Shopping focus must pull the household snapshot');
});

test('fresh installs still gate the first snapshot push on server hydration', () => {
  const sync = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const push = sync.slice(sync.indexOf('export async function pushLocalState'), sync.indexOf('export async function pullFromSupabase'));
  assert.match(push, /await pullFromSupabase\(\{ forceServerHydration: true \}\)/,
    'the first authenticated push must still hydrate first');
  assert.match(push, /if \(!initialHouseholdSyncComplete\.has\(id\)\) return;/,
    'failed hydration must still block the outbound write');
});
