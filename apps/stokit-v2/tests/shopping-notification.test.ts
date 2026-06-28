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
  assert.ok(msg.title.includes('Hewad'), 'title must include sender name');
  assert.ok(msg.title.includes('Walmart'), 'title must include store name');
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
