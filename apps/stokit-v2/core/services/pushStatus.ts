/**
 * Truthful push-notification status.
 *
 * The settings screen previously reported "Registered" from getMyPushDiagnostics(),
 * which only proves this device can MINT an Expo token — it never asked Supabase
 * whether that token is actually stored against the authenticated user. A device
 * whose row was cleared on sign-out, or whose token rotated after a reinstall,
 * still displayed as registered while receiving nothing.
 *
 * This resolver takes the local facts (permission, mintable token, the token we
 * last recorded as registered) and the remote fact (household_members.push_token
 * for this user) and reduces them to one honest state. It is pure so every
 * combination is unit-testable without a device.
 */

export type PushStatus = 'on' | 'off' | 'needs_attention';

export type PushIssue =
  | 'unsupported'
  | 'permission_denied'
  | 'permission_undetermined'
  | 'no_project_id'
  | 'no_token'
  | 'not_registered'
  | 'stale_registration'
  | 'remote_unreadable'
  | null;

export interface PushStatusInput {
  /** Result of Notifications.getPermissionsAsync(), or 'web' where unsupported. */
  permission: 'granted' | 'denied' | 'undetermined' | 'unknown' | 'web';
  projectIdPresent: boolean;
  /** Token this device can mint right now, or null if minting failed. */
  localToken: string | null;
  /** household_members.push_token for the signed-in user. */
  remoteToken: string | null;
  /** False when the remote read failed — we must not guess in either direction. */
  remoteReadable: boolean;
  /** The device-scoped opt-in toggle. */
  preferenceEnabled: boolean;
}

export interface PushStatusResult {
  status: PushStatus;
  issue: PushIssue;
  /** True when "Repair notifications" can plausibly fix this. */
  repairable: boolean;
  /** True when the only way forward is the iOS Settings app. */
  needsSystemSettings: boolean;
  /** One plain sentence for the user. No jargon, no token fragments. */
  message: string;
}

/**
 * ON requires every link in the chain: the user opted in, iOS granted
 * permission, this device holds a token, and that exact token is the one
 * registered remotely. Anything else is Off or Needs attention — never On.
 */
export function resolvePushStatus(input: PushStatusInput): PushStatusResult {
  const {
    permission,
    projectIdPresent,
    localToken,
    remoteToken,
    remoteReadable,
    preferenceEnabled,
  } = input;

  if (permission === 'web') {
    return {
      status: 'off',
      issue: 'unsupported',
      repairable: false,
      needsSystemSettings: false,
      message: 'Push notifications aren’t available on web.',
    };
  }

  // Denied outranks the preference: even with the toggle on, nothing can arrive,
  // and only the Settings app can undo it.
  if (permission === 'denied') {
    return {
      status: 'needs_attention',
      issue: 'permission_denied',
      repairable: false,
      needsSystemSettings: true,
      message: 'Notifications are turned off for Stokit in iOS Settings.',
    };
  }

  // Deliberately off — a resting state, not a problem to nag about.
  if (!preferenceEnabled) {
    return {
      status: 'off',
      issue: null,
      repairable: false,
      needsSystemSettings: false,
      message: 'You won’t receive household shopping alerts on this device.',
    };
  }

  if (permission === 'undetermined' || permission === 'unknown') {
    return {
      status: 'off',
      issue: 'permission_undetermined',
      repairable: true,
      needsSystemSettings: false,
      message: 'Allow notifications to receive household shopping alerts.',
    };
  }

  // permission === 'granted' from here.

  if (!projectIdPresent) {
    return {
      status: 'needs_attention',
      issue: 'no_project_id',
      repairable: false,
      needsSystemSettings: false,
      message: 'This build is missing its notification project ID.',
    };
  }

  if (!localToken) {
    return {
      status: 'needs_attention',
      issue: 'no_token',
      repairable: true,
      needsSystemSettings: false,
      message: 'This device couldn’t get a notification token.',
    };
  }

  // Never claim registered when the remote answer is unknown.
  if (!remoteReadable) {
    return {
      status: 'needs_attention',
      issue: 'remote_unreadable',
      repairable: true,
      needsSystemSettings: false,
      message: 'Couldn’t confirm this device is registered. Check your connection.',
    };
  }

  if (!remoteToken) {
    return {
      status: 'needs_attention',
      issue: 'not_registered',
      repairable: true,
      needsSystemSettings: false,
      message: 'This device isn’t registered for household alerts yet.',
    };
  }

  // A token exists on both sides but they disagree — the registration is stale
  // (reinstall, token rotation, or another device took ownership).
  if (remoteToken !== localToken) {
    return {
      status: 'needs_attention',
      issue: 'stale_registration',
      repairable: true,
      needsSystemSettings: false,
      message: 'This device’s registration is out of date.',
    };
  }

  return {
    status: 'on',
    issue: null,
    repairable: false,
    needsSystemSettings: false,
    message: 'Receiving household shopping alerts on this device.',
  };
}

/** Short label for the status row. */
export function pushStatusLabel(status: PushStatus): string {
  if (status === 'on') return 'On';
  if (status === 'off') return 'Off';
  return 'Needs attention';
}
