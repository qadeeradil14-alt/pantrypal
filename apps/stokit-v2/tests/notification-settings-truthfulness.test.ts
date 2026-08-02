/**
 * Notification settings must report OUTCOMES, not intentions.
 *
 * Before this change the screen claimed "Registered" from a locally minted Expo
 * token without ever asking Supabase, geofence registration was recorded as
 * successful the moment startGeofencingAsync resolved, and "Send Alert" fired a
 * real arrival payload. Each test below pins one of those corrections.
 *
 * Native-dependent behaviour (expo-location / expo-notifications) is asserted
 * structurally against source, matching the existing convention in
 * store-duplicates.test.ts and geofencing.test.ts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePushStatus, pushStatusLabel, type PushStatusInput } from '../core/services/pushStatus';
import { resolveStoreArrivalStatus } from '../core/services/storeArrivalStatus';

const base: PushStatusInput = {
  permission: 'granted',
  projectIdPresent: true,
  localToken: 'ExponentPushToken[aaa]',
  remoteToken: 'ExponentPushToken[aaa]',
  remoteReadable: true,
  preferenceEnabled: true,
};

// ── Push status ──────────────────────────────────────────────────────────────

test('valid local + remote registration is the only path to On', () => {
  const result = resolvePushStatus(base);
  assert.equal(result.status, 'on');
  assert.equal(result.issue, null);
  assert.equal(result.repairable, false);
  assert.equal(pushStatusLabel(result.status), 'On');
});

test('local token exists but remote registration is missing → Needs attention', () => {
  // The exact case the old UI showed as "Registered": a mintable token and no
  // database row behind it.
  const result = resolvePushStatus({ ...base, remoteToken: null });
  assert.equal(result.status, 'needs_attention');
  assert.equal(result.issue, 'not_registered');
  assert.equal(result.repairable, true);
  assert.equal(pushStatusLabel(result.status), 'Needs attention');
});

test('local token differs from remote token → stale registration, repairable', () => {
  const result = resolvePushStatus({ ...base, remoteToken: 'ExponentPushToken[old]' });
  assert.equal(result.status, 'needs_attention');
  assert.equal(result.issue, 'stale_registration');
  assert.equal(result.repairable, true);
});

test('a mintable token alone never yields On', () => {
  for (const remote of [null, 'ExponentPushToken[other]']) {
    const result = resolvePushStatus({ ...base, remoteToken: remote });
    assert.notEqual(result.status, 'on', `remote=${remote} must not report On`);
  }
});

test('denied permission is Needs attention and routes to system Settings, not Repair', () => {
  const result = resolvePushStatus({ ...base, permission: 'denied' });
  assert.equal(result.status, 'needs_attention');
  assert.equal(result.issue, 'permission_denied');
  assert.equal(result.needsSystemSettings, true);
  assert.equal(result.repairable, false, 'Repair cannot undo an OS-level denial');
});

test('denied permission outranks the preference — never On', () => {
  const result = resolvePushStatus({ ...base, permission: 'denied', preferenceEnabled: true });
  assert.notEqual(result.status, 'on');
});

test('preference off is a clean Off, not an error to nag about', () => {
  const result = resolvePushStatus({ ...base, preferenceEnabled: false });
  assert.equal(result.status, 'off');
  assert.equal(result.issue, null);
  assert.equal(result.repairable, false);
});

test('an unreadable remote never resolves to On or to a false "not registered"', () => {
  const result = resolvePushStatus({ ...base, remoteReadable: false, remoteToken: null });
  assert.equal(result.status, 'needs_attention');
  assert.equal(result.issue, 'remote_unreadable');
  assert.match(result.message, /Couldn’t confirm/);
});

test('missing token and missing project id are distinguished', () => {
  assert.equal(resolvePushStatus({ ...base, localToken: null }).issue, 'no_token');
  assert.equal(
    resolvePushStatus({ ...base, projectIdPresent: false, localToken: null }).issue,
    'no_project_id',
  );
});

test('push status messages never leak a token value', () => {
  const inputs: PushStatusInput[] = [
    base,
    { ...base, remoteToken: null },
    { ...base, remoteToken: 'ExponentPushToken[old]' },
    { ...base, permission: 'denied' },
  ];
  for (const input of inputs) {
    assert.doesNotMatch(resolvePushStatus(input).message, /ExponentPushToken/);
  }
});

// ── Store arrival status messaging ───────────────────────────────────────────

const arrivalBase = {
  preferenceEnabled: true,
  nativeStarted: true,
  notificationPermission: 'granted' as const,
  backgroundPermission: 'granted' as const,
  eligibleStoreCount: 3,
  lastRegistrationResult: 'success' as const,
  registrationDrift: false,
  supported: true,
};

test('healthy state reports Monitoring N stores', () => {
  const result = resolveStoreArrivalStatus(arrivalBase);
  assert.equal(result.state, 'monitoring');
  assert.equal(result.message, 'Monitoring 3 stores');
  assert.equal(result.active, true);
});

test('Monitoring is singular for one store', () => {
  assert.equal(
    resolveStoreArrivalStatus({ ...arrivalBase, eligibleStoreCount: 1 }).message,
    'Monitoring 1 store',
  );
});

test('zero eligible stores says so plainly instead of "Ready for 0"', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, eligibleStoreCount: 0 });
  assert.equal(result.state, 'no_eligible_stores');
  assert.equal(result.message, 'No stores currently have assigned shopping items.');
  assert.equal(result.active, false);
  assert.doesNotMatch(result.message, /Ready for/);
});

test('permission blockers are reported ahead of store counts', () => {
  const noLocation = resolveStoreArrivalStatus({
    ...arrivalBase, backgroundPermission: 'denied', eligibleStoreCount: 0,
  });
  assert.equal(noLocation.state, 'location_permission_required');

  const noNotifications = resolveStoreArrivalStatus({
    ...arrivalBase, notificationPermission: 'denied', eligibleStoreCount: 0,
  });
  assert.equal(noNotifications.state, 'notification_permission_required');
});

test('"When in use" location is not enough for geofencing', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, backgroundPermission: 'undetermined' });
  assert.equal(result.state, 'location_permission_required');
  assert.match(result.message, /Always/);
});

test('native not started is reported as a failure, never as Monitoring', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, nativeStarted: false });
  assert.equal(result.state, 'registration_failed');
  assert.equal(result.active, false);
  assert.doesNotMatch(result.message, /Monitoring/);
});

test('a failed last registration is reported as a failure', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, lastRegistrationResult: 'failed' });
  assert.equal(result.state, 'registration_failed');
});

test('registration drift surfaces as Needs attention', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, registrationDrift: true });
  assert.equal(result.state, 'needs_attention');
  assert.equal(result.active, false);
});

test('preference off is a resting state with no alarming copy', () => {
  const result = resolveStoreArrivalStatus({ ...arrivalBase, preferenceEnabled: false });
  assert.equal(result.state, 'off');
  assert.equal(result.active, false);
});

// ── Engine: Defect A and Defect B ────────────────────────────────────────────

const geofencing = readFileSync(join(process.cwd(), 'core/services/geofencing.ts'), 'utf8');

function startGeofencingBody(): string {
  const start = geofencing.indexOf('export async function startGeofencing(');
  const end = geofencing.indexOf('export async function stopGeofencing(');
  assert.ok(start > -1 && end > start, 'startGeofencing must be locatable');
  return geofencing.slice(start, end);
}

test('DEFECT A: zero eligible stores tears down stale native registration', () => {
  const body = startGeofencingBody();
  const noStoresBranch = body.slice(
    body.indexOf('if (geofenceable.length === 0)'),
    body.indexOf("return 'no_stores';"),
  );
  assert.ok(noStoresBranch.length > 0, 'the no_stores branch must exist');
  assert.match(noStoresBranch, /hasStartedGeofencingAsync\(GEOFENCE_TASK\)/,
    'it must check whether iOS is still monitoring');
  assert.match(noStoresBranch, /stopGeofencingAsync\(GEOFENCE_TASK\)/,
    'and unregister, instead of leaving stale regions live');
  assert.match(noStoresBranch, /nativeGeofencingStarted: false/,
    'and record that nothing is registered');
});

test('DEFECT A: the user preference survives an operational teardown', () => {
  const body = startGeofencingBody();
  const noStoresBranch = body.slice(
    body.indexOf('if (geofenceable.length === 0)'),
    body.indexOf("return 'no_stores';"),
  );
  assert.doesNotMatch(noStoresBranch, /storeArrivalPreferenceOn/,
    'unregistering because nothing is eligible must not switch the user setting off');
});

test('DEFECT A: eligibility returning re-registers via the existing refresh path', () => {
  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const calls = durable.match(/refreshGeofencedStoreData\(\)/g) ?? [];
  assert.ok(calls.length >= 10,
    `item/store mutations must keep re-registering; found ${calls.length} refresh call sites`);
  const sync = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  assert.match(sync, /isGeofencingRunning\(\)/,
    'refresh only restarts when the feature is actually running');
});

test('DEFECT B: success is only claimed after the native started check passes', () => {
  const body = startGeofencingBody();
  const startCall = body.indexOf('await Location.startGeofencingAsync(GEOFENCE_TASK, regions)');
  const verify = body.indexOf('hasStartedGeofencingAsync(GEOFENCE_TASK)', startCall);
  const success = body.indexOf("registrationResult: 'success'", startCall);

  assert.ok(startCall > -1, 'the registration call must exist');
  assert.ok(verify > startCall, 'a native verification must follow the registration call');
  assert.ok(success > verify, 'success must only be recorded after that verification');
});

test('DEFECT B: a false native started state reports a truthful failure', () => {
  const body = startGeofencingBody();
  assert.match(body, /if \(!nativeStarted\)/, 'the false case must be handled');
  assert.match(body, /registrationError: 'native_not_started'/, 'with a specific reason');
  assert.match(body, /return 'registration_failed'/, 'and a truthful return value');
  const failureBlock = body.slice(body.indexOf('if (!nativeStarted)'), body.indexOf("return 'registration_failed'"));
  assert.match(failureBlock, /monitoredStoresCount: 0/,
    'and must not report monitored stores while nothing is registered');
});

// ── Part 4: neutral test notification ────────────────────────────────────────

const notifications = readFileSync(join(process.cwd(), 'core/services/notifications.ts'), 'utf8');

function notifyTestBody(): string {
  const start = notifications.indexOf('export async function notifyTest(');
  // Stop at notifyArrival's doc comment, not its signature — that comment
  // mentions itemCount and would otherwise leak into the slice.
  const end = notifications.indexOf('/**\n * Fire a local notification telling the user', start);
  assert.ok(start > -1 && end > start, 'notifyTest must exist and precede notifyArrival');
  return notifications.slice(start, end);
}

test('the test notification carries no arrival payload', () => {
  const body = notifyTestBody();
  assert.match(body, /data: \{ type: 'test' \}/, 'it is typed as a test');
  assert.doesNotMatch(body, /store_arrival/, 'never the arrival type');
  assert.doesNotMatch(body, /storeId/, 'and carries no storeId to deep-link with');
});

test('the test notification does not touch geofences or notify the household', () => {
  const body = notifyTestBody();
  assert.doesNotMatch(body, /startGeofencing|stopGeofencing|clearArrivalCooldown/);
  assert.doesNotMatch(body, /sendHouseholdShoppingAlert|functions\.invoke/);
  assert.doesNotMatch(body, /notifyArrival/, 'it must not delegate to the arrival path');
});

test('the test notification works with zero eligible stores', () => {
  const body = notifyTestBody();
  // The old button bailed with "No shopping-list store alerts to test" when
  // monitorableStores was empty, so it could never test plain delivery.
  assert.doesNotMatch(body, /monitorableStores|geofenceableStores|itemCount/,
    'delivery testing must not depend on store eligibility');
  assert.match(body, /scheduleNotificationAsync/, 'it sends exactly one local notification');
  assert.equal((body.match(/scheduleNotificationAsync/g) ?? []).length, 1);
});

test('the settings screen wires the user-facing button to notifyTest', () => {
  const screen = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.match(screen, /const result = await notifyTest\(\)/);
  assert.match(screen, /Test notification/);
  assert.doesNotMatch(screen, /'Send Alert'/, 'the misleading label is gone');
});

// ── Part 1: repair idempotence and ownership ─────────────────────────────────

test('repair reuses registerPushToken, which is an idempotent keyed upsert', () => {
  const screen = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.match(screen, /const result = await registerPushToken\(userId\)/,
    'repair must go through the one registration path');

  const registerBody = notifications.slice(
    notifications.indexOf('export async function registerPushToken('),
    notifications.indexOf('// ── Registration state (device-local)'),
  );
  // Keyed on user_id and set to a single value — repeated calls converge rather
  // than accumulate. Duplicate ownership across users is prevented server-side
  // by the household_members_push_token_single_owner trigger.
  assert.match(registerBody, /\.update\(\{ push_token: token \}/);
  assert.match(registerBody, /\.eq\('user_id', userId\)/);
  assert.doesNotMatch(registerBody, /\.insert\(/, 'never inserts a second token row');
});

test('a failed registration clears the stored marker so status cannot go stale-positive', () => {
  const registerBody = notifications.slice(
    notifications.indexOf('export async function registerPushToken('),
    notifications.indexOf('// ── Registration state (device-local)'),
  );
  assert.equal((registerBody.match(/clearStoredPushRegistration\(\)/g) ?? []).length, 3,
    'write_error, zero_rows and the catch must each clear it');
});

test('the diagnostics section does not claim a native registered-region count', () => {
  const screen = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.match(screen, /Regions requested/, 'the honest label is used');
  assert.doesNotMatch(screen, /Regions registered|Native regions|registeredRegionCount/,
    'expo-location exposes no such value, so it must not be implied');
  assert.match(screen, /Native geofencing started/, 'the boolean we CAN read is shown');
});
