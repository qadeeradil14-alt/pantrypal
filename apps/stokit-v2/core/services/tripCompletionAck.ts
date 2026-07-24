/**
 * Local (per-device) acknowledgment marker for the peer trip-completion
 * notice — see app/(tabs)/shopping.tsx's useUnseenCompletedTrip.
 *
 * The stored value never regresses: every write takes the max of the
 * incoming value and whatever is already on disk, so out-of-order calls
 * (e.g. the self-acknowledgment effect racing the initial load) can never
 * un-acknowledge an already-seen trip.
 */
import type { Trip } from '../../types';

const ACK_KEY = 'stokit:v2:trip-completion-ack';

export async function getLastAcknowledgedTripCompletedAt(): Promise<number> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(ACK_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function setLastAcknowledgedTripCompletedAt(completedAt: number): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(ACK_KEY);
    const current = raw ? Number(raw) || 0 : 0;
    if (completedAt > current) {
      await AsyncStorage.setItem(ACK_KEY, String(completedAt));
    }
  } catch {
    // Non-fatal — worst case the notice reappears once.
  }
}

/** Newest trip in `trips` completed strictly after `acknowledgedThrough`, or null. */
export function newestUnseenTrip(trips: Trip[], acknowledgedThrough: number): Trip | null {
  let newest: Trip | null = null;
  for (const trip of trips) {
    if (trip.completedAt > acknowledgedThrough && (!newest || trip.completedAt > newest.completedAt)) {
      newest = trip;
    }
  }
  return newest;
}
