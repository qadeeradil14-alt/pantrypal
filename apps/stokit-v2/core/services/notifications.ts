/**
 * Notification helpers for Stokit V2.
 *
 * Used only by the opt-in geofence feature to fire a gentle local notification
 * when the user arrives at a store where they have items.
 *
 * Requires expo-notifications (already installed).
 */

import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

// ── Notification log ──────────────────────────────────────────────────────────

const NOTIFICATION_LOG_KEY = 'stokit:v2:notification:log';

export type NotificationLogStage =
  | 'requested'
  | 'scheduled'
  | 'schedule_error'
  | 'delivered'
  | 'tapped'
  | 'shopping_opened';

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

/**
 * Get an Expo push token and save it to this user's household_members row.
 * Called once after sign-in. Non-fatal if permissions not granted.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await supabase
      .from('household_members')
      .update({ push_token: tokenData.data })
      .eq('user_id', userId);
  } catch {
    // Non-fatal — push degrades gracefully
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
    const { data, error } = await supabase.functions.invoke('notify-shopping', {
      body: { storeName, ...(storeId ? { storeId } : {}) },
    });
    if (error) return { ok: false, sent: 0, result: `failed:${error.message}` };
    const sent = (data as { sent?: number } | null)?.sent ?? 0;
    return { ok: true, sent, result: sent > 0 ? 'sent' : 'no_tokens' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, sent: 0, result: `failed:${message}` };
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
  source: 'geofence' | 'test' = 'geofence',
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
