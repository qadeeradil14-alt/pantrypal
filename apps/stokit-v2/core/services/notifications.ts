/**
 * Notification helpers for Stokit V2.
 *
 * Used only by the opt-in geofence feature to fire a gentle local notification
 * when the user arrives at a store where they have items.
 *
 * Requires expo-notifications (already installed).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

/** Call once at app startup (from _layout.tsx). */
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('store-arrivals', {
      name: 'Store arrival reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
    });
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

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

/**
 * Fire a local notification telling the user they've arrived at a store.
 * If itemCount is 0, does nothing.
 */
export async function notifyArrival(storeName: string, itemCount: number): Promise<void> {
  if (itemCount <= 0) return;
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const body =
    itemCount === 1
      ? `You have 1 item on your list.`
      : `You have ${itemCount} items on your list.`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛒 You're near ${storeName}`,
      body,
      data: { storeName },
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'passive' } : {}),
    },
    trigger: Platform.OS === 'android' ? { channelId: 'store-arrivals' } : null,
  });
}
