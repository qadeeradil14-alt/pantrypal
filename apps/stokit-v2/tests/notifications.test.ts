/**
 * Notification presentation tests.
 *
 * These are static/structural tests — they verify the source code of
 * notifications.ts and related files without requiring a native runtime,
 * guaranteeing that specific regressions (like `passive` interruptionLevel
 * silently suppressing banners) can never be reintroduced undetected.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const notificationsSource = readFileSync(
  new URL('../core/services/notifications.ts', import.meta.url),
  'utf8',
);

const layoutSource = readFileSync(
  new URL('../app/_layout.tsx', import.meta.url),
  'utf8',
);

const geofencingSource = readFileSync(
  new URL('../core/services/geofencing.ts', import.meta.url),
  'utf8',
);

const settingsSource = readFileSync(
  new URL('../app/settings/store-arrival-alerts.tsx', import.meta.url),
  'utf8',
);

// ── interruptionLevel regression guard ───────────────────────────────────────

test("arrival notifications MUST NOT use interruptionLevel 'passive'", () => {
  // 'passive' silently deposits the notification in Notification Center with
  // no banner and no sound — confirmed root cause of the real-world test failure.
  assert.ok(
    !notificationsSource.includes("interruptionLevel: 'passive'"),
    "Found interruptionLevel: 'passive' in notifications.ts — this suppresses banners and sound. Use 'active' or 'timeSensitive'.",
  );
});

test("arrival notifications use interruptionLevel 'active'", () => {
  assert.match(
    notificationsSource,
    /interruptionLevel: 'active'/,
    "Expected interruptionLevel: 'active' in notifications.ts",
  );
});

// ── Notification handler configuration ───────────────────────────────────────

test('notification handler has shouldShowBanner: true', () => {
  assert.match(
    notificationsSource,
    /shouldShowBanner: true/,
    'shouldShowBanner must be true so banners appear when app is foregrounded',
  );
});

test('notification handler has shouldPlaySound: true', () => {
  assert.match(
    notificationsSource,
    /shouldPlaySound: true/,
    'shouldPlaySound must be true — silencing arrival alerts reduces discoverability',
  );
});

test('notification handler has shouldShowAlert: true', () => {
  assert.match(
    notificationsSource,
    /shouldShowAlert: true/,
  );
});

// ── setupNotifications is called at module level ──────────────────────────────

test('setupNotifications() is called at module level in _layout.tsx before any render', () => {
  // The call must appear before the first `export default function` so that the
  // handler is registered even during cold headless background task launches
  // when React never mounts.
  const moduleSetupIdx = layoutSource.indexOf('setupNotifications()');
  const exportDefaultIdx = layoutSource.indexOf('export default function');
  assert.ok(
    moduleSetupIdx !== -1,
    'setupNotifications() not found in _layout.tsx',
  );
  assert.ok(
    moduleSetupIdx < exportDefaultIdx,
    'setupNotifications() must be called at module level (before export default function)',
  );
});

// ── Shared code path: geofence and test button use the same notifyArrival ────

test('settings.tsx test button calls notifyArrival (same path as geofence)', () => {
  // The test button must call notifyArrival directly, not a different function,
  // so that testing the button tests the real geofence notification path.
  assert.match(
    settingsSource,
    /notifyArrival\(/,
    'settings.tsx must call notifyArrival() for the test button',
  );
});

test("geofencing.ts background task passes source='geofence' to notifyArrival", () => {
  assert.match(
    geofencingSource,
    /notifyArrival\(store\.name, activeItemCount, 'geofence',/,
    "geofence task should pass source='geofence' to notifyArrival for log traceability",
  );
});

test('geofence arrival notification is store-specific: storeId + item names passed', () => {
  // The notification payload must describe exactly ONE store — the matched one —
  // carrying its storeId (for the hybrid tap → focus flow) and its own item names.
  assert.match(
    geofencingSource,
    /storeId: decision\.storeId/,
    'geofence task must pass the matched storeId into notifyArrival',
  );
  assert.match(
    geofencingSource,
    /itemNames: activeItemNames/,
    'geofence task must pass the matched store item names into notifyArrival',
  );
  assert.match(
    geofencingSource,
    /arrivalItemNames\(items, decision\.storeId\)/,
    'item names must be scoped to the matched store, not aggregated across stores',
  );
});

// ── Notification log ──────────────────────────────────────────────────────────

test('notifications.ts exports appendNotificationLog', () => {
  assert.match(
    notificationsSource,
    /export async function appendNotificationLog/,
  );
});

test('notifications.ts exports getNotificationLog', () => {
  assert.match(
    notificationsSource,
    /export async function getNotificationLog/,
  );
});

test('notifications.ts logs the scheduled notification ID', () => {
  assert.match(
    notificationsSource,
    /appendNotificationLog\('scheduled'/,
    'A scheduled log entry must be written so the pipeline log shows confirmation',
  );
});

test('notifications.ts logs a schedule_error on failure', () => {
  assert.match(
    notificationsSource,
    /appendNotificationLog\('schedule_error'/,
  );
});

// ── Trigger type ──────────────────────────────────────────────────────────────

test('iOS arrival notifications use a null trigger (immediate delivery)', () => {
  // null trigger = immediate delivery on iOS. Any non-null trigger with a
  // future date would delay or suppress the notification.
  assert.match(
    notificationsSource,
    /trigger.*null/s,
    'iOS trigger should be null for immediate delivery',
  );
});

// ── Android channel importance ────────────────────────────────────────────────

test('Android notification channel uses HIGH importance', () => {
  // DEFAULT importance on Android can be silenced by aggressive battery optimisation.
  // HIGH importance bypasses Do Not Disturb (except total silence) and shows a banner.
  assert.match(
    notificationsSource,
    /AndroidImportance\.HIGH/,
    'Android channel must use HIGH importance to ensure banner visibility',
  );
});
