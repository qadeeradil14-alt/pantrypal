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

/** Call once at app startup (from _layout.tsx). */
export async function setupNotifications(): Promise<void> {
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
    trigger: null, // Fire immediately
  });
}
