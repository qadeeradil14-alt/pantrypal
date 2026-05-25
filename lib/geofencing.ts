import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import type { Store } from './stores';

export const GEOFENCE_TASK = 'PANTRYPAL_GEOFENCE';

// Register the background task — call this at app root before any geofencing
export function defineGeofenceTask(
  onEnter: (storeId: string) => void,
) {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK)) return;

  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
    if (error) return;
    const { eventType, region } = data;
    if (eventType === Location.GeofencingEventType.Enter && region?.identifier) {
      onEnter(region.identifier);
    }
  });
}

export async function startGeofencing(stores: Store[]): Promise<boolean> {
  const geofenceable = stores.filter((s) => s.latitude != null && s.longitude != null);
  if (geofenceable.length === 0) return false;

  let { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== 'granted') {
    const requested = await Location.requestBackgroundPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return false;

  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    geofenceable.map((s) => ({
      identifier: s.id,
      latitude: s.latitude!,
      longitude: s.longitude!,
      radius: s.radius_meters,
      notifyOnEnter: true,
      notifyOnExit: false,
    })),
  );

  return true;
}

export async function stopGeofencing() {
  const active = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (active) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

export async function notifyPartnerArrival(storeName: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Someone arrived at ${storeName}`,
      body: 'You have 2 minutes to add anything to the shopping list!',
      sound: 'default',
    },
    trigger: null,
  });
}
