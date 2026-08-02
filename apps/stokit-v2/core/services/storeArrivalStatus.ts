/**
 * Plain-language status for the Store arrival reminders control.
 *
 * Replaces "Ready for 0 assigned stores", which read as a healthy state while
 * actually meaning nothing was being monitored at all. Every string below
 * describes what is true right now, and names the one thing standing in the way
 * when something is.
 */

export type StoreArrivalState =
  | 'off'
  | 'monitoring'
  | 'no_eligible_stores'
  | 'location_permission_required'
  | 'notification_permission_required'
  | 'registration_failed'
  | 'needs_attention'
  | 'unavailable';

export interface StoreArrivalStatusInput {
  /** The user's persisted intent, independent of native state. */
  preferenceEnabled: boolean;
  /** Location.hasStartedGeofencingAsync() for the Stokit task — native truth. */
  nativeStarted: boolean;
  notificationPermission: 'granted' | 'denied' | 'undetermined' | 'unknown';
  /** iOS "Always" is required; "When in use" is not enough for geofencing. */
  backgroundPermission: 'granted' | 'denied' | 'undetermined' | 'unknown';
  /** Stores with coordinates AND at least one assigned low/expiring item. */
  eligibleStoreCount: number;
  lastRegistrationResult: 'not_attempted' | 'skipped' | 'success' | 'failed';
  /** True when the live eligible set no longer matches the registered set. */
  registrationDrift: boolean;
  /** Expo Go cannot register geofences. */
  supported: boolean;
}

export interface StoreArrivalStatusResult {
  state: StoreArrivalState;
  message: string;
  /** True only when reminders can actually fire right now. */
  active: boolean;
}

export function resolveStoreArrivalStatus(
  input: StoreArrivalStatusInput,
): StoreArrivalStatusResult {
  const {
    preferenceEnabled,
    nativeStarted,
    notificationPermission,
    backgroundPermission,
    eligibleStoreCount,
    lastRegistrationResult,
    registrationDrift,
    supported,
  } = input;

  if (!supported) {
    return { state: 'unavailable', message: 'Coming soon', active: false };
  }

  if (!preferenceEnabled) {
    return {
      state: 'off',
      message: 'Get reminded when you arrive at a store with items to buy.',
      active: false,
    };
  }

  // Permission blockers first — they explain every downstream symptom, so
  // reporting anything else would send the user chasing the wrong problem.
  if (backgroundPermission !== 'granted') {
    return {
      state: 'location_permission_required',
      message: 'Location permission required — allow “Always” in iOS Settings.',
      active: false,
    };
  }

  if (notificationPermission !== 'granted') {
    return {
      state: 'notification_permission_required',
      message: 'Notification permission required — allow notifications in iOS Settings.',
      active: false,
    };
  }

  if (eligibleStoreCount === 0) {
    return {
      state: 'no_eligible_stores',
      message: 'No stores currently have assigned shopping items.',
      active: false,
    };
  }

  // Permissions and stores are fine, so a missing native registration is a real
  // failure rather than an expected skip.
  if (lastRegistrationResult === 'failed' || !nativeStarted) {
    return {
      state: 'registration_failed',
      message: 'Registration failed — tap Repair to try again.',
      active: false,
    };
  }

  if (registrationDrift) {
    return {
      state: 'needs_attention',
      message: 'Needs attention — monitored stores are out of date.',
      active: false,
    };
  }

  return {
    state: 'monitoring',
    message: `Monitoring ${eligibleStoreCount} store${eligibleStoreCount === 1 ? '' : 's'}`,
    active: true,
  };
}
