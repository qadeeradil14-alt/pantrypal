/**
 * Notification helpers for Stokit V2.
 *
 * Used only by the opt-in geofence feature to fire a gentle local notification
 * when the user arrives at a store where they have items.
 *
 * Requires expo-notifications (already installed).
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { readFunctionError } from './functionError';

/**
 * Resolve the EAS projectId required by getExpoPushTokenAsync(). Auto-resolution
 * from Constants is unreliable in OTA-loaded TestFlight bundles, so we resolve it
 * explicitly with an env fallback. A missing projectId is the confirmed cause of
 * getExpoPushTokenAsync() throwing silently and the token never being written.
 */
function resolveProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
    process.env.EXPO_PUBLIC_PROJECT_ID ??
    undefined
  );
}

// ── Notification log ──────────────────────────────────────────────────────────

const NOTIFICATION_LOG_KEY = 'stokit:v2:notification:log';

export type NotificationLogStage =
  | 'requested'
  | 'scheduled'
  | 'schedule_error'
  | 'delivered'
  | 'tapped'
  | 'shopping_opened'
  | 'household_alert_error';

export interface NotificationLogEntry {
  stage: NotificationLogStage;
  ts: number;
  detail: string;
}

export async function appendNotificationLog(
  stage: NotificationLogStage,
  detail: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_LOG_KEY);
    const existing: NotificationLogEntry[] = raw ? JSON.parse(raw) : [];
    // Keep last 50 entries
    const next = [...existing, { stage, ts: Date.now(), detail }].slice(-50);
    await AsyncStorage.setItem(NOTIFICATION_LOG_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal
  }
}

export async function getNotificationLog(): Promise<NotificationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearNotificationLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_LOG_KEY);
  } catch {
    // Non-fatal
  }
}

// ── Notification diagnostics ──────────────────────────────────────────────────

export interface NotificationDiagnostics {
  pendingCount: number;
  deliveredCount: number;
  lastResponseTitle: string | null;
  lastResponseBody: string | null;
  lastResponseTs: number | null;
  handlerShouldShowBanner: boolean;
  handlerShouldPlaySound: boolean;
  handlerShouldShowList: boolean;
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const [pending, delivered] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync().catch(() => []),
    Platform.OS === 'ios'
      ? Notifications.getPresentedNotificationsAsync().catch(() => [])
      : Promise.resolve([]),
  ]);
  const lastResponse = await Notifications.getLastNotificationResponseAsync().catch(() => null);
  const content = lastResponse?.notification?.request?.content;
  return {
    pendingCount: pending.length,
    deliveredCount: delivered.length,
    lastResponseTitle: content?.title ?? null,
    lastResponseBody: content?.body ?? null,
    lastResponseTs: lastResponse?.notification?.date
      ? lastResponse.notification.date * 1000
      : null,
    // Handler values as configured by setupNotifications()
    handlerShouldShowBanner: true,
    handlerShouldPlaySound: true,
    handlerShouldShowList: true,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Call once at app startup — safe to call at module level (before React mounts)
 * AND inside a useEffect. The handler registration is process-global and
 * idempotent.
 */
export function setupNotifications(): void {
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('store-arrivals', {
      name: 'Store arrival reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ── Permissions ───────────────────────────────────────────────────────────────

/** Request notification permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export type PushRegistrationResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | 'web'
        | 'no_permission'
        | 'no_project_id'
        | 'no_active_household'
        | 'write_error'
        | 'zero_rows'
        | 'verify_error'
        | 'token_error';
      detail?: string;
    };

/**
 * Get an Expo push token and save it to this user's active household row.
 *
 * Requests permission rather than only reading it: a household RECIPIENT who
 * never opens geofencing would otherwise never be prompted and never get a
 * token — which is exactly why "Send Alert" returned no_tokens. iOS only shows
 * the system prompt once, so calling this on every foreground is safe.
 */
export async function registerPushToken(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return { ok: false, reason: 'no_permission' };

    const projectId = resolveProjectId();
    if (!projectId) return { ok: false, reason: 'no_project_id' };

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Write the token to EVERY household_members row for this user.
    // Previously we only wrote to the row matching profiles.household_id, which
    // meant a user who joined a shared household after their personal household
    // was created would have the token in the wrong row — invisible to the
    // notify-shopping Edge Function when it queries the shared household.
    const { count, error } = await supabase
      .from('household_members')
      .update({ push_token: token }, { count: 'exact' })
      .eq('user_id', userId);
    if (error) return { ok: false, reason: 'write_error', detail: error.message };
    if (count === 0) return { ok: false, reason: 'zero_rows', detail: `No household_members rows found for user ${userId}` };

    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'token_error', detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Push diagnostics (QA / devMode) ───────────────────────────────────────────

export interface MyPushDiagnostics {
  permission: string;        // granted | denied | undetermined | web
  projectIdPresent: boolean;
  tokenPresent: boolean;
  tokenTail: string | null;  // last 6 chars only — never the full token
  error: string | null;
}

/** Local-only diagnostics for THIS device's push readiness. No DB calls. */
export async function getMyPushDiagnostics(): Promise<MyPushDiagnostics> {
  if (Platform.OS === 'web') {
    return { permission: 'web', projectIdPresent: false, tokenPresent: false, tokenTail: null, error: null };
  }
  const projectId = resolveProjectId();
  let permission = 'undetermined';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    permission = status;
  } catch {
    // keep default
  }
  if (permission !== 'granted') {
    return { permission, projectIdPresent: Boolean(projectId), tokenPresent: false, tokenTail: null, error: null };
  }
  if (!projectId) {
    return { permission, projectIdPresent: false, tokenPresent: false, tokenTail: null, error: 'no_project_id' };
  }
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    return {
      permission,
      projectIdPresent: true,
      tokenPresent: Boolean(token),
      tokenTail: token ? token.replace(/\]$/, '').slice(-6) : null,
      error: null,
    };
  } catch (err) {
    return {
      permission,
      projectIdPresent: true,
      tokenPresent: false,
      tokenTail: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface HouseholdPushDiagnostics {
  ok: boolean;
  memberCount: number;
  recipientsWithToken: number;
  senderHasToken: boolean;
  error: string | null;
}

/**
 * Household-wide push readiness, via the notify-shopping Edge Function in
 * diagnostic mode (service-role read, bypasses RLS so partner token presence is
 * visible). Returns counts only — never the actual tokens.
 */
export async function getHouseholdPushDiagnostics(): Promise<HouseholdPushDiagnostics> {
  try {
    const { data, error } = await supabase.functions.invoke('notify-shopping', {
      body: { diagnostic: true },
    });
    if (error) {
      return { ok: false, memberCount: 0, recipientsWithToken: 0, senderHasToken: false, error: error.message };
    }
    const d = data as { memberCount?: number; recipientsWithToken?: number; senderHasToken?: boolean } | null;
    return {
      ok: true,
      memberCount: d?.memberCount ?? 0,
      recipientsWithToken: d?.recipientsWithToken ?? 0,
      senderHasToken: Boolean(d?.senderHasToken),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      memberCount: 0,
      recipientsWithToken: 0,
      senderHasToken: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Household shopping alert ──────────────────────────────────────────────────

export { buildShoppingPayload } from './shoppingAlertPayload';
export type { ShoppingAlertMessage } from './shoppingAlertPayload';

/**
 * Invoke the notify-shopping Edge Function to push a shopping alert to all
 * other household members. Non-fatal — returns { ok: false } on any failure.
 */
export async function sendHouseholdShoppingAlert(
  storeName: string,
  storeId?: string,
): Promise<{ ok: boolean; sent: number; result: string }> {
  try {
    const response = await supabase.functions.invoke('notify-shopping', {
      body: { storeName, ...(storeId ? { storeId } : {}) },
    });
    const { data, error } = response;

    if (error) {
      const detail = await readFunctionError(error);
      console.warn('[Notify Family] notify-shopping failed', detail.log);
      await appendNotificationLog('household_alert_error', detail.log);
      const errorText = [detail.code, detail.serverMessage, detail.log].filter(Boolean).join(' ');
      if (errorText.includes('no_recipients') || errorText.includes('No household recipients') || errorText.includes('No other members')) {
        return { ok: true, sent: 0, result: 'no_tokens' };
      }
      return { ok: false, sent: 0, result: `failed:${detail.log}` };
    }
    const sent = (data as { sent?: number } | null)?.sent ?? 0;
    return { ok: true, sent, result: sent > 0 ? 'sent' : 'no_tokens' };
  } catch (err) {
    const detail = await readFunctionError(err);
    console.warn('[Notify Family] notify-shopping failed', detail.log);
    await appendNotificationLog('household_alert_error', detail.log);
    return { ok: false, sent: 0, result: `failed:${detail.log}` };
  }
}

// ── Arrival notification ──────────────────────────────────────────────────────

/**
 * Core arrival notification payload builder.
 * Single source of truth used by both the geofence path and the test button —
 * so both always exercise the exact same code.
 */
/**
 * Build the body line for an arrival notification from the matched store's
 * item names. Always describes ONE store. Falls back to a bare count when names
 * aren't available (keeps older callers working).
 */
function buildArrivalBody(itemCount: number, itemNames: string[]): string {
  if (itemNames.length === 0) {
    return itemCount === 1 ? 'You have 1 item on your list.' : `You have ${itemCount} items on your list.`;
  }
  if (itemNames.length === 1) return `${itemNames[0]} · 1 item`;
  if (itemNames.length === 2) return `${itemNames[0]} & ${itemNames[1]} · 2 items`;
  return `${itemNames[0]}, ${itemNames[1]} +${itemNames.length - 2} more · ${itemNames.length} items`;
}

function buildArrivalContent(
  storeName: string,
  itemCount: number,
  opts?: { storeId?: string; itemNames?: string[] },
): Notifications.NotificationContentInput {
  return {
    title: `You arrived at ${storeName}. Ready to shop?`,
    body: buildArrivalBody(itemCount, opts?.itemNames ?? []),
    // storeId lets the tap handler open Shopping focused on this exact store
    // (geofence "hybrid" flow) instead of the planning-mode store picker.
    data: { type: 'store_arrival', storeName, ...(opts?.storeId ? { storeId: opts.storeId } : {}) },
    sound: 'default',
    // 'active' — shows a banner and plays the sound.
    // 'timeSensitive' would also work but requires the Time Sensitive
    // Notifications entitlement. 'active' is the correct level for arrival
    // alerts that need to be seen but are not urgent safety notifications.
    // NOTE: 'passive' was the prior value and is the confirmed root cause of
    // notifications being silently deposited in Notification Center with no
    // banner and no sound.
    ...(Platform.OS === 'ios' ? { interruptionLevel: 'active' as const } : {}),
  };
}

/**
 * Fire a local notification telling the user they've arrived at a store.
 * If itemCount is 0, does nothing.
 */
export async function notifyArrival(
  storeName: string,
  itemCount: number,
  source: 'geofence' | 'test' | 'manual' = 'geofence',
  opts?: { storeId?: string; itemNames?: string[] },
): Promise<{ ok: boolean; result: string }> {
  if (itemCount <= 0) return { ok: false, result: 'skipped:no_items' };

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return { ok: false, result: 'failed:no_notification_permission' };

  const appState = AppState.currentState;
  const requestDetail = `source=${source} store="${storeName}" items=${itemCount} appState=${appState}`;
  await appendNotificationLog('requested', requestDetail);

  try {
    const trigger: Notifications.NotificationTriggerInput =
      Platform.OS === 'android' ? { channelId: 'store-arrivals' } : null;

    const id = await Notifications.scheduleNotificationAsync({
      content: buildArrivalContent(storeName, itemCount, opts),
      trigger,
    });

    const scheduleDetail = `id=${id} trigger=${Platform.OS === 'android' ? 'channelId:store-arrivals' : 'immediate(null)'} interruptionLevel=${Platform.OS === 'ios' ? 'active' : 'n/a'}`;
    await appendNotificationLog('scheduled', scheduleDetail);

    return { ok: true, result: `scheduled:${id}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendNotificationLog('schedule_error', message);
    return { ok: false, result: `failed:${message}` };
  }
}
