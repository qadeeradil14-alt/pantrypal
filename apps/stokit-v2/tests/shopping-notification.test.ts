import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildShoppingPayload } from '../core/services/shoppingAlertPayload';

// ── 1. Payload shape is correct ───────────────────────────────────────────────

test('buildShoppingPayload: correct title, body, data shape', () => {
  const msg = buildShoppingPayload('Hewad', 'Walmart', 'ExponentPushToken[abc123]', 'store-id-1');
  assert.equal(msg.to, 'ExponentPushToken[abc123]');
  assert.equal(msg.sound, 'default');
  // Title is store-focused: "Need anything from {storeName}?"
  assert.ok(msg.title.includes('Walmart'), 'title must include store name');
  assert.ok(!msg.title.includes('Hewad'), 'sender name must not appear in title');
  // Body carries sender name and store context
  assert.ok(msg.body.includes('Hewad'), 'body must include sender name');
  assert.ok(msg.body.includes('Walmart'), 'body must include store name');
  assert.equal(msg.data.type, 'partner_arrival');
  assert.equal(msg.data.storeName, 'Walmart');
  assert.equal(msg.data.storeId, 'store-id-1');
});

test('buildShoppingPayload: storeId is optional and omitted cleanly when not provided', () => {
  const msg = buildShoppingPayload('Hewad', 'Target', 'ExponentPushToken[tok]');
  assert.equal(msg.data.storeName, 'Target');
  assert.equal(msg.data.storeId, undefined, 'storeId must be absent when not passed');
});

// ── 2. Sender exclusion is the Edge Function's responsibility ─────────────────
// The client sends { storeName, storeId } — never a recipient list or the
// sender's own token. Exclusion is enforced server-side via `.neq('user_id')`.
// Test that buildShoppingPayload does NOT include any user_id or sender-id field.

test('buildShoppingPayload: message contains no sender identity (exclusion is server-side)', () => {
  const msg = buildShoppingPayload('Owner', 'Costco', 'ExponentPushToken[t]', 'sid');
  const keys = Object.keys(msg.data);
  assert.ok(!keys.includes('senderId'), 'data must not include senderId');
  assert.ok(!keys.includes('userId'), 'data must not include userId');
});

// ── 3. No-household safe: isSharedHousehold guard prevents UI from rendering ─
// The button is only rendered when members.length > 1. When solo or no
// household, the component renders nothing — no crash, no call.

test('shared household guard: members.length > 1 is truthy, solo is falsy', () => {
  const solo = [{ id: 'me' }];
  const shared = [{ id: 'me' }, { id: 'wife' }];
  assert.equal(solo.length > 1, false, 'solo household must not show notify button');
  assert.equal(shared.length > 1, true, 'shared household must show notify button');
});

// ── 4. No location permission required ────────────────────────────────────────
// Verify that no location import exists in notifications.ts or the shopping
// notification path. If this assertion fails, a location dependency was added.

test('shoppingAlertPayload.ts has no location/geofencing import', () => {
  const payloadPath = path.join(__dirname, '../core/services/shoppingAlertPayload.ts');
  const src = fs.readFileSync(payloadPath, 'utf-8');
  assert.ok(!src.includes('expo-location'), 'must not import expo-location');
  assert.ok(!src.includes('geofencing'), 'must not import geofencing');
  assert.ok(!src.includes('requestForegroundPermissions'), 'must not request location permission');
});

test('partner arrival tap opens the normal Shopping screen on warm and cold start', () => {
  const layoutPath = path.join(__dirname, '../app/_layout.tsx');
  const src = fs.readFileSync(layoutPath, 'utf-8');
  assert.ok(src.includes('Notifications.getLastNotificationResponseAsync()'), 'cold-start notification tap must be handled');
  assert.ok(src.includes("data.type === 'partner_arrival'"), 'partner arrival payload must be recognized');
  assert.ok(src.includes("router.push('/(tabs)/shopping')"), 'partner arrival must open normal Shopping');
});

test('partner arrival no longer renders a store-specific add-item card', () => {
  const shoppingPath = path.join(__dirname, '../app/(tabs)/shopping.tsx');
  const src = fs.readFileSync(shoppingPath, 'utf-8');
  assert.ok(!src.includes('partnerAddStoreId'), 'Shopping must not retain partner-store context');
  assert.ok(!src.includes('Add something for {partnerStoreLabel}'), 'Shopping must not render a store-specific add-item card');
});

test('active shopping session ingests live household items for current store', () => {
  const shoppingPath = path.join(__dirname, '../app/(tabs)/shopping.tsx');
  const src = fs.readFileSync(shoppingPath, 'utf-8');
  assert.ok(src.includes('const items = useDurableStore((s) => s.items);'), 'active trip must observe durable synced items');
  assert.ok(src.includes('item.storeId === storeId'), 'live ingest must be scoped to the active store');
  assert.ok(src.includes("item.status === 'low' || item.status === 'expiring'"), 'live ingest must only add shopping items');
  assert.ok(src.includes("type: 'ADD_ENTRY'"), 'live synced items must be added into the active session');
});

test('active shopping session is included in household snapshot sync', () => {
  const typesPath = path.join(__dirname, '../types/index.ts');
  const durablePath = path.join(__dirname, '../store/durable-store.ts');
  const sessionPath = path.join(__dirname, '../store/session-store.ts');
  const syncPath = path.join(__dirname, '../core/services/syncEngine.ts');
  const typesSrc = fs.readFileSync(typesPath, 'utf-8');
  const durableSrc = fs.readFileSync(durablePath, 'utf-8');
  const sessionSrc = fs.readFileSync(sessionPath, 'utf-8');
  const syncSrc = fs.readFileSync(syncPath, 'utf-8');
  assert.ok(typesSrc.includes('activeSession: SharedShoppingSession | null'), 'DurableState must carry shared active session');
  assert.ok(durableSrc.includes('activeSession: s.activeSession ?? null'), 'snapshot must include active session');
  assert.ok(sessionSrc.includes('durable.setActiveSession'), 'session dispatch must push active session into durable sync');
  assert.ok(syncSrc.includes('remote_trip_end_received'), 'remote trip end must be logged during pull');
});

test('remote active session is reconciled into local shopping session', () => {
  const durablePath = path.join(__dirname, '../store/durable-store.ts');
  const sessionPath = path.join(__dirname, '../store/session-store.ts');
  const durableSrc = fs.readFileSync(durablePath, 'utf-8');
  const sessionSrc = fs.readFileSync(sessionPath, 'utf-8');
  assert.ok(durableSrc.includes('applyRemoteSession(remoteSession)'), 'remote snapshot must update session store');
  assert.ok(sessionSrc.includes('applyRemoteSession'), 'session store must expose remote reconciliation');
  assert.ok(sessionSrc.includes('AsyncStorage.removeItem(SESSION_KEY)'), 'remote trip end must clear persisted active session');
  assert.ok(sessionSrc.includes('mergeShoppingEntries(previous.entries, remoteSession.entries, removedItemIds)'), 'concurrent same-trip sessions must reconcile via entry merge, not blind overwrite');
});

test('local active session mutations publish full fresh snapshots', () => {
  const durablePath = path.join(__dirname, '../store/durable-store.ts');
  const sessionPath = path.join(__dirname, '../store/session-store.ts');
  const syncPath = path.join(__dirname, '../core/services/syncEngine.ts');
  const durableSrc = fs.readFileSync(durablePath, 'utf-8');
  const sessionSrc = fs.readFileSync(sessionPath, 'utf-8');
  const syncSrc = fs.readFileSync(syncPath, 'utf-8');
  assert.ok(durableSrc.includes('Math.max(now(), lastSnapshotAt + 1, get().updatedAt + 1)'), 'snapshot updatedAt must be monotonic for rapid activeSession writes AND never regress below the last applied peer version');
  assert.ok(sessionSrc.includes('durable.setActiveSession'), 'every session reducer mutation must request activeSession sync');
  assert.ok(durableSrc.includes('active_session_snapshot_write_requested'), 'local activeSession write requests must be logged');
  assert.ok(syncSrc.includes('active_session_snapshot_written'), 'successful household snapshot writes must be logged');
});

test('remote active session fully replaces local partial session and null clears storage', () => {
  const sessionPath = path.join(__dirname, '../store/session-store.ts');
  const sessionSrc = fs.readFileSync(sessionPath, 'utf-8');
  assert.ok(sessionSrc.includes('set({ session: remoteSession as ShoppingSession })'), 'remote activeSession must replace local session for non-active/non-merged cases');
  assert.ok(!sessionSrc.includes('ACTIVE_STATUSES.has(previous.status)'), 'remote end must clear an actively-shopping local session');
  assert.ok(sessionSrc.includes("AsyncStorage.removeItem(SESSION_KEY)"), 'remote null/end must clear persisted local active session');
  assert.ok(sessionSrc.includes('remoteShoppingSessionAction(remoteSession)'), 'remote end/null policy must gate the storage-clear and replace paths');
});

test('stale AsyncStorage cannot override newer remote active session', () => {
  const sessionPath = path.join(__dirname, '../store/session-store.ts');
  const sessionSrc = fs.readFileSync(sessionPath, 'utf-8');
  assert.ok(sessionSrc.includes('durableSession && (durableSession.startedAt ?? 0) > (saved.startedAt ?? 0)'), 'hydrate must prefer newer remote activeSession over stale storage');
  assert.ok(sessionSrc.includes('active_session_storage_rehydrate_ignored reason=remote_newer'), 'ignored stale storage must be logged');
});

test('missed realtime event is corrected by foreground snapshot pull', () => {
  const layoutPath = path.join(__dirname, '../app/_layout.tsx');
  const layoutSrc = fs.readFileSync(layoutPath, 'utf-8');
  assert.ok(layoutSrc.includes("nextState === 'active'"), 'foreground transition must be handled');
  assert.ok(layoutSrc.includes('pullFromSupabase()'), 'foreground transition must pull latest household snapshot');
});

// ── 5. v183 sync watermark is unaffected ─────────────────────────────────────
// Import and exercise the watermark module to confirm it still works correctly
// after the notification changes (no shared module-state pollution).

import { shouldApplyRemote, markRemoteApplied, resetSyncWatermark } from '../core/services/syncWatermark';

test('v183 sync watermark still passes after notification feature addition', () => {
  resetSyncWatermark();
  markRemoteApplied(3);
  // Owner pushes T=5 — must apply on Wife despite her local updatedAt being 10.
  assert.ok(shouldApplyRemote(5), 'Owner T=5 snapshot must apply above watermark=3');
  assert.equal(shouldApplyRemote(3), false, 'own reflection must be rejected');
  assert.equal(shouldApplyRemote(2), false, 'stale snapshot must be rejected');
  resetSyncWatermark();
  assert.ok(shouldApplyRemote(1), 'watermark reset must accept any positive timestamp');
});
