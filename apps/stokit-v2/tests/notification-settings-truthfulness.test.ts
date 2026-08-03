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
import { storeArrivalPreferenceFromDiagnostics } from '../core/services/geofencingLogic';

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

/**
 * REVERSED. The original version of this test asserted that
 * refreshGeofencedStoreData gates on isGeofencingRunning() — and described that
 * as proof the feature re-registers. It is the opposite: that guard is what made
 * OTA 454's zero-eligibility teardown a one-way trap, because once the engine
 * unregistered its regions the guard was false forever and no later mutation
 * could restart monitoring. A real device stopped delivering arrival reminders.
 * The assertion now demands the guard be gone.
 */
test('DEFECT A: refresh is gated on the user preference, never on native running state', () => {
  const sync = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');
  const refreshBody = sync.slice(sync.indexOf('export async function refreshGeofencedStoreData'));

  assert.doesNotMatch(refreshBody, /if \(await isGeofencingRunning\(\)\)/,
    'gating refresh on native running state re-creates the one-way trap');
  assert.match(refreshBody, /if \(await isStoreArrivalPreferenceOn\(\)\)/,
    'refresh must gate on persisted user intent so a stopped engine can restart');
  assert.match(refreshBody, /startGeofencing\(stores, items\)/,
    'and must still go through the one registration path');
});

test('DEFECT A: eligibility returning re-registers via the existing refresh path', () => {
  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  const calls = durable.match(/refreshGeofencedStoreData\(\)/g) ?? [];
  assert.ok(calls.length >= 10,
    `item/store mutations must keep re-registering; found ${calls.length} refresh call sites`);
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

// ── Auto-healing the OTA 454 trap ────────────────────────────────────────────

test('preference on + native stopped still counts as ON, so refresh restarts', () => {
  // The exact trapped state: the user asked for reminders, OTA 454 tore the
  // regions down when nothing was eligible, native is stopped.
  assert.equal(
    storeArrivalPreferenceFromDiagnostics({
      storeArrivalPreferenceOn: true,
      storeArrivalRemindersOn: false,
    }),
    true,
    'a stopped engine must not read as "user turned it off"',
  );
});

test('a device trapped before OTA 454 also auto-heals via the legacy field', () => {
  // storeArrivalPreferenceOn did not exist before OTA 454, so installs that
  // enabled reminders earlier only ever persisted storeArrivalRemindersOn.
  // Reading the new field alone would strand them off forever.
  assert.equal(
    storeArrivalPreferenceFromDiagnostics({
      storeArrivalPreferenceOn: false,
      storeArrivalRemindersOn: true,
    }),
    true,
    'legacy installs must still be recognised as opted in',
  );
});

test('an explicit opt-out is respected — no restart', () => {
  // stopGeofencing() writes false to BOTH fields, which is what "off" means.
  assert.equal(
    storeArrivalPreferenceFromDiagnostics({
      storeArrivalPreferenceOn: false,
      storeArrivalRemindersOn: false,
    }),
    false,
  );
});

test('manual toggle off clears both preference fields', () => {
  const stopBody = geofencing.slice(
    geofencing.indexOf('export async function stopGeofencing('),
    geofencing.indexOf('export async function isGeofencingRunning('),
  );
  assert.match(stopBody, /storeArrivalPreferenceOn: false/);
  assert.match(stopBody, /storeArrivalRemindersOn: false/);
  assert.match(stopBody, /stopGeofencingAsync\(GEOFENCE_TASK\)/);
});

test('manual toggle on still registers through the unguarded settings path', () => {
  const screen = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.match(screen, /await startGeofencing\(stores, items\)/,
    'the toggle calls startGeofencing directly, with no running-state guard');
});

test('the zero-eligibility teardown is retained', () => {
  const body = startGeofencingBody();
  const noStoresBranch = body.slice(
    body.indexOf('if (geofenceable.length === 0)'),
    body.indexOf("return 'no_stores';"),
  );
  assert.match(noStoresBranch, /stopGeofencingAsync\(GEOFENCE_TASK\)/,
    'Option B keeps the teardown; only the refresh gate changed');
  assert.doesNotMatch(noStoresBranch, /storeArrivalPreferenceOn/,
    'and it must still leave the user preference alone');
});

// ── Arrival decision guards must be untouched by this fix ────────────────────

test('cooldown, dwell, speed and accuracy guards are unchanged', () => {
  assert.match(geofencing, /export const DEBOUNCE_MS = 3 \* 60 \* 1000;/, 'cooldown window');
  assert.match(geofencing, /export const DWELL_CONFIRM_MS = 10 \* 1000;/, 'dwell confirmation');
  assert.match(geofencing, /export const ARRIVAL_SPEED_THRESHOLD_MPS = 5;/, 'pass-by threshold');
  assert.match(geofencing, /export const ARRIVAL_MAX_GPS_ACCURACY_M = 60;/, 'accuracy floor');
  assert.match(geofencing, /export const ARRIVAL_RADIUS_M = 150;/, 'arrival radius');
  assert.match(geofencing, /lastConfidenceResult: 'rejected_speed'/, 'pass-by rejection intact');
  assert.match(geofencing, /lastConfidenceResult: 'rejected_accuracy'/, 'accuracy rejection intact');
  // Cooldown is still written only after a fully accepted arrival.
  assert.match(geofencing, /await writeLastArrivalAt\(decision\.storeId, Date\.now\(\)\)/);
});

test('the local arrival notification path is unchanged and never fans out', () => {
  assert.match(geofencing, /await notifyArrival\(store\.name, activeItemCount, 'geofence'/,
    'arrival still fires the local notification');
  assert.doesNotMatch(geofencing, /sendHouseholdShoppingAlert|functions\.invoke/,
    'the geofence task must not notify other household members');
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
  const screen = readFileSync(join(process.cwd(), 'app/settings/push-notifications.tsx'), 'utf8');
  assert.match(screen, /const result = await registerPushToken\(authUser\.id\)/,
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

// ── The dedicated Push Notifications screen ──────────────────────────────────
//
// OTA 454 shipped with this screen untouched: the earlier tests asserted only
// against store-arrival-alerts.tsx, so the real Settings → Push Notifications
// screen kept rendering "Registered" straight from getMyPushDiagnostics().
// These pin the actual screen the user opens.

const pushScreenPath = 'app/settings/push-notifications.tsx';
const pushScreen = readFileSync(join(process.cwd(), pushScreenPath), 'utf8');

test('the Push Notifications screen resolves status against the remote registration', () => {
  assert.match(pushScreen, /getPushStatus\(/, 'it must use the verifying resolver');
  assert.match(pushScreen, /pushStatusLabel\(/, 'and render On / Off / Needs attention');
});

test('the Push Notifications screen no longer infers "Registered" from a local token', () => {
  // Assert on the import, so a prose mention in a comment doesn't false-positive.
  const imports = pushScreen.slice(0, pushScreen.indexOf('export default'));
  assert.doesNotMatch(imports, /getMyPushDiagnostics/,
    'the local-only diagnostic must not be imported into user-facing status');
  assert.doesNotMatch(pushScreen, /tokenPresent/,
    'a mintable token is not proof of registration');
  assert.doesNotMatch(pushScreen, /'Registered'/,
    'the misleading literal is gone');
  assert.doesNotMatch(pushScreen, /Re-register this device/,
    'renamed to Repair notifications');
});

test('the Push Notifications screen gates Repair and offers Settings when denied', () => {
  assert.match(pushScreen, /Repair notifications/);
  assert.match(pushScreen, /status\?\.repairable \?/, 'Repair is conditional, never always-on');
  assert.match(pushScreen, /needsSystemSettings \?/, 'denial routes to Settings first');
  assert.match(pushScreen, /Linking\.openSettings\(\)/);
});

test('no settings screen derives push status from a locally minted token', () => {
  // The class of bug, not just the one instance.
  for (const file of ['app/settings/push-notifications.tsx', 'app/settings/store-arrival-alerts.tsx']) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const statusFromToken = /tokenPresent\s*\?\s*'Registered'/.test(source);
    assert.equal(statusFromToken, false, `${file} must not equate a local token with registration`);
  }
});

test('push settings live on exactly one screen', () => {
  const arrival = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.doesNotMatch(arrival, /Receive household shopping alerts and shared updates/,
    'the push primary setting must not be duplicated on the arrival screen');
  assert.match(pushScreen, /Receive household shopping alerts and shared updates/,
    'it belongs on the dedicated Push Notifications screen');
});

test('the diagnostics section does not claim a native registered-region count', () => {
  const screen = readFileSync(join(process.cwd(), 'app/settings/store-arrival-alerts.tsx'), 'utf8');
  assert.match(screen, /Regions requested/, 'the honest label is used');
  assert.doesNotMatch(screen, /Regions registered|Native regions|registeredRegionCount/,
    'expo-location exposes no such value, so it must not be implied');
  assert.match(screen, /Native geofencing started/, 'the boolean we CAN read is shown');
});
