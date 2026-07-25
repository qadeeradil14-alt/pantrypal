/**
 * Developer Diagnostics — access control.
 *
 * A secret gesture is not security — it is only obscurity, since anyone can
 * tap a row five times. Every release build therefore requires ALL of:
 *
 *   1. THE EXISTING DEVELOPER FLAG — `stokit:v2:developer_mode`, the app's
 *      established developer gate (already used by store-arrival-alerts).
 *      Read-only here; diagnostics never sets it.
 *   2. AN EXPLICIT CONFIG FLAG — EXPO_PUBLIC_DEV_DIAGNOSTICS=1. Unset by
 *      default, so a production build shipped without it can never open the
 *      console regardless of the other two conditions.
 *   3. A NON-EMPTY ALLOWLIST whose current user matches — an empty
 *      allowlist is NEVER treated as "allow everyone the flag reaches".
 *      EXPO_PUBLIC_DIAGNOSTICS_ALLOWLIST takes user ids and/or emails;
 *      prefer ids — the allowlist ships inside the JS bundle in plaintext,
 *      and an id is a less sensitive value to expose there than an email.
 *
 * A development bundle (__DEV__) is inherently a local developer context and
 * only needs the developer flag — conditions 2 and 3 do not apply to it.
 *
 * The tap gesture only *reveals* an already-authorized console; it is never
 * itself the access control.
 */

export const UNLOCK_TAP_COUNT = 5;
export const UNLOCK_TAP_WINDOW_MS = 3000;

export interface DiagnosticsAccessInput {
  /** __DEV__ — a development bundle is inherently a developer context. */
  isDevBundle: boolean;
  /** EXPO_PUBLIC_DEV_DIAGNOSTICS === '1'. */
  flagEnabled: boolean;
  /** Normalized allowlist entries; empty means "flag alone is sufficient". */
  allowlist: string[];
  signedInUserId?: string | null;
  signedInEmail?: string | null;
  /** Existing persisted developer flag (`stokit:v2:developer_mode`). */
  developerModeEnabled: boolean;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Parses `a@b.com, user_123` into normalized entries. */
export function parseAllowlist(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => normalize(entry))
    .filter((entry) => entry.length > 0);
}

/**
 * True only when the console may be opened at all. See the module doc for
 * the full rule: a dev bundle needs only the developer flag; a release
 * bundle needs the developer flag AND the config flag AND a non-empty
 * allowlist that the current user matches.
 */
export function canAccessDiagnostics(input: DiagnosticsAccessInput): boolean {
  if (!input.developerModeEnabled) return false;
  if (input.isDevBundle) return true;

  if (!input.flagEnabled) return false;

  // An empty allowlist must never be read as "the flag alone is enough" —
  // that would grant every user access via a gesture anyone can discover.
  if (input.allowlist.length === 0) return false;

  const id = normalize(input.signedInUserId);
  const email = normalize(input.signedInEmail);
  return (id !== '' && input.allowlist.includes(id)) || (email !== '' && input.allowlist.includes(email));
}

export interface UnlockTapState {
  count: number;
  lastTapAt: number;
}

export const initialUnlockTapState: UnlockTapState = { count: 0, lastTapAt: 0 };

/**
 * Folds one tap into the gesture state. Taps must land within
 * UNLOCK_TAP_WINDOW_MS of each other; a slower tap restarts the count.
 * `unlocked` is true on exactly the tap that completes the gesture.
 */
export function registerUnlockTap(
  previous: UnlockTapState,
  now: number,
): UnlockTapState & { unlocked: boolean } {
  const continued = previous.count > 0 && now - previous.lastTapAt <= UNLOCK_TAP_WINDOW_MS;
  const count = continued ? previous.count + 1 : 1;

  if (count >= UNLOCK_TAP_COUNT) {
    return { count: 0, lastTapAt: now, unlocked: true };
  }
  return { count, lastTapAt: now, unlocked: false };
}
