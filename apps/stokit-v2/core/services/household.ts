/**
 * Household service — pure logic, no React.
 *
 * V2 is local-first. Invite codes are generated and shared, but multi-device
 * sync requires a backend (Supabase). The sync abstraction lives here so the
 * UI and store never change when the backend is wired up.
 *
 * Sync status:
 *   LOCAL    — No backend configured. Data lives on this device only.
 *   SYNCING  — Backend request in flight.
 *   SYNCED   — Last known sync was successful.
 *   ERROR    — Last sync attempt failed.
 */

// Unambiguous character set — no 0/O, 1/I/L confusion (identical to V1).
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_RE = /^[A-Z0-9]{6,9}$/;
export const ALREADY_IN_HOUSEHOLD_MESSAGE = 'This person is already in your household.';
export const STALE_INVITE_CODE_MESSAGE = 'This invite code is no longer valid. Ask for a new invite.';
export const LEAVE_CURRENT_HOUSEHOLD_FIRST_MESSAGE =
  "You're already in another shared household. Leave it first, then enter this code again.";

/** Generate a random 6-character invite code. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}

/** Normalize and validate current and legacy invite codes. */
export function normalizeInviteCode(raw: string): string | null {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  return INVITE_CODE_RE.test(normalized) ? normalized : null;
}

export function joinHouseholdErrorMessage(rawMessage: string): { message: string; invalidCode: boolean } {
  const message = rawMessage.toLowerCase();
  if (message.includes('invalid invite code') || message.includes('expired') || message.includes('no longer valid')) {
    return { message: STALE_INVITE_CODE_MESSAGE, invalidCode: true };
  }
  if (message.includes('leave your current shared household')) {
    return { message: LEAVE_CURRENT_HOUSEHOLD_FIRST_MESSAGE, invalidCode: false };
  }
  return { message: rawMessage, invalidCode: false };
}

/** Format a code for display with a dash: "ABC-123". */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** Build the native share message for inviting a household member. */
export function buildInviteMessage(householdName: string, inviteCode: string): string {
  const code = normalizeInviteCode(inviteCode) ?? inviteCode.toUpperCase();
  return [
    `Join "${householdName}" on Stokit 🛒`,
    ``,
    `Your invite code:`,
    ``,
    formatInviteCode(code),
    ``,
    `To join:`,
    ``,
    `1. Open Stokit`,
    `2. Tap "Join with invite code"`,
    `3. Enter this invite code`,
  ].join('\n');
}

/** Derive initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  '#D4874E', '#5A9E70', '#2E86C1', '#7D3C98',
  '#C05050', '#D4AC0D', '#27AE60', '#A04000',
];

/** Stable color pick based on member ID. */
export function avatarColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) hash = (hash * 31 + memberId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Sync abstraction ─────────────────────────────────────────────────────────

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

/**
 * Attempt to resolve an invite code against a backend.
 *
 * V2: returns null (local mode). When Supabase is wired, this calls
 * `supabase.rpc('join_household_by_code', { p_invite_code: code })`.
 */
export async function resolveInviteCode(
  _code: string,
): Promise<{ id: string; name: string } | null> {
  // TODO: Supabase integration
  // const { data, error } = await supabase.rpc('join_household_by_code', { p_invite_code: code });
  // if (error) throw error;
  // return data;
  return null;
}

/**
 * Push household creation to a backend.
 * V2: no-op (local only).
 */
export async function syncCreateHousehold(
  _householdId: string,
  _name: string,
  _inviteCode: string,
): Promise<void> {
  // TODO: Supabase integration
}
