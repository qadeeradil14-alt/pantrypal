import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// useUnseenCompletedTrip / PeerTripCompletedNotice are React components/hooks
// in a file that transitively imports react-native — verified as source-regex
// against the raw file, matching this codebase's convention for RN component
// files that can't be imported into a plain node:test run.

const shopping = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

const hook = shopping.slice(
  shopping.indexOf('function useUnseenCompletedTrip('),
  shopping.indexOf('function PeerTripCompletedNotice('),
);
const notice = shopping.slice(
  shopping.indexOf('function PeerTripCompletedNotice('),
  shopping.indexOf('// ── Shared sub-component'),
);

test('the hook and notice were located for inspection', () => {
  assert.ok(hook.length > 0, 'useUnseenCompletedTrip slice is empty — boundaries may be stale');
  assert.ok(notice.length > 0, 'PeerTripCompletedNotice slice is empty — boundaries may be stale');
});

test('the hook is called unconditionally in ShoppingScreen, before any early return (rules of hooks)', () => {
  const bodyStart = shopping.indexOf('export default function ShoppingScreen()');
  const firstEarlyReturn = shopping.indexOf('if (\n    session.status === \'shopping_store\'', bodyStart);
  const hookCallIndex = shopping.indexOf('useUnseenCompletedTrip(trips, session.completedTrip)', bodyStart);
  assert.ok(hookCallIndex !== -1, 'the hook must be called in ShoppingScreen');
  assert.ok(firstEarlyReturn === -1 || hookCallIndex < firstEarlyReturn,
    'the hook must be called before any conditional early return, or React will violate the rules of hooks across renders');
});

test('a locally completed trip self-acknowledges instead of triggering the peer notice', () => {
  assert.match(hook, /if \(!localCompletedTrip\) return;/,
    'the effect must be gated on the local session\'s own completedTrip');
  assert.match(hook, /setLastAcknowledgedTripCompletedAt\(localCompletedTrip\.completedAt\)/,
    'the device that just finished shopping must acknowledge its own trip immediately, so it never sees it mirrored back as a peer notice');
});

test('acknowledgment merges with Math.max so out-of-order writes cannot un-acknowledge a trip', () => {
  assert.match(hook, /setAck\(\(prev\) => Math\.max\(prev, stored\)\)/);
  assert.match(hook, /setAck\(\(prev\) => Math\.max\(prev, localCompletedTrip\.completedAt\)\)/);
});

test('dismiss() persists acknowledgment for the currently shown trip', () => {
  assert.match(hook, /const dismiss = \(\) => \{\s*\n\s*if \(!trip\) return;/);
  assert.match(hook, /setLastAcknowledgedTripCompletedAt\(trip\.completedAt\)/);
});

test('the notice is purely presentational — no dispatch, no trip auto-start, no store chooser', () => {
  assert.doesNotMatch(notice, /dispatch\(|startTripAt\(|setShowStoreChooser|setLastAcknowledgedTripCompletedAt/,
    'dismissal must be delegated via the onDismiss prop, not handled inside the notice itself');
  assert.match(notice, /onPress=\{onDismiss\}/);
});

test('the notice identifies completion, stores, item count, and spend when available', () => {
  assert.match(notice, /Shopping trip completed/);
  assert.match(notice, /storesLabel/);
  assert.match(notice, /trip\.itemsBought/);
  assert.match(notice, /trip\.totalSpent > 0/, 'spend must only render when available (> 0)');
});

test('the notice and the idle planner are mutually exclusive — never both rendered', () => {
  assert.match(
    shopping,
    /\{unseenTrip \? \(\s*\n\s*<PeerTripCompletedNotice trip=\{unseenTrip\} colors=\{colors\} storeById=\{storeById\} onDismiss=\{dismissUnseenTrip\} \/>\s*\n\s*\) : shoppableCount === 0 \? \(/,
    'the notice and the idle planner must be mutually exclusive branches of one conditional, not rendered as siblings',
  );
});

test('the "Reset shopping list" link is also suppressed while the notice is visible', () => {
  assert.match(shopping, /\{!unseenTrip && shoppableCount > 0 && \(\s*\n\s*<Pressable onPress=\{handleResetShopping\}/);
});

// ── First-run initialization (OTA 399 first-run historical-trip bug) ───────
//
// getLastAcknowledgedTripCompletedAt distinguishes "never initialized" (null)
// from "acknowledged through 0" so first run can establish a silent baseline
// instead of surfacing pre-existing trip history as a fresh notice.

test('a never-initialized device establishes a silent baseline instead of surfacing old history', () => {
  assert.match(hook, /if \(stored === null\) \{/,
    'the hook must distinguish "never initialized" from a real acknowledged floor of 0');
  assert.match(hook, /const baseline = tripsRef\.current\.reduce\(\(max, t\) => Math\.max\(max, t\.completedAt\), 0\);/,
    'the baseline must be the newest trip already in history at first-run time');
  assert.match(hook, /setAck\(\(prev\) => Math\.max\(prev, baseline\)\)/);
  assert.match(hook, /setLastAcknowledgedTripCompletedAt\(baseline\)/,
    'the established baseline must be persisted so it survives restart, not just held in memory');
});

test('the baseline uses a live ref, not a stale mount-time snapshot of trips', () => {
  assert.match(hook, /const tripsRef = useRef\(trips\);/);
  assert.match(hook, /tripsRef\.current = trips;/);
});

test('a device with no trip history at all establishes a baseline of 0 (no trips means nothing to hide or show)', () => {
  // Proven by composition: an empty trips array reduces to 0 (Number.prototype
  // reduce with initial value 0), and newestUnseenTrip([], 0) is already
  // proven to return null in trip-completion-ack.test.ts.
  assert.match(hook, /\.reduce\(\(max, t\) => Math\.max\(max, t\.completedAt\), 0\)/);
});

test('a real stored floor (not null) still merges via the pre-existing Math.max path, unaffected by the baseline branch', () => {
  assert.match(hook, /\} else \{\s*\n\s*setAck\(\(prev\) => Math\.max\(prev, stored\)\);\s*\n\s*\}/);
});
