export const INVITE_CODE_RE = /^[A-Z0-9]{6}$/;

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/eJTwChas';
const INVITE_BASE_URL = process.env.EXPO_PUBLIC_INVITE_BASE_URL?.replace(/\/+$/, '') ?? null;

function safeDecode(value: string): string {
  let decoded = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function normalizeInviteCode(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const decoded = safeDecode(raw).trim().toUpperCase().replace(/[\s-]/g, '');
  return INVITE_CODE_RE.test(decoded) ? decoded : null;
}

export function extractInviteCodeFromUrl(value: string): string | null {
  const direct = normalizeInviteCode(value);
  if (direct) return direct;

  try {
    const decoded = safeDecode(value);
    const url = decoded.includes('://')
      ? new URL(decoded)
      : new URL(decoded.startsWith('/') ? `pantrypal:/${decoded}` : `pantrypal://${decoded}`);

    return normalizeInviteCode(
      url.searchParams.get('code')
      ?? url.searchParams.get('invite')
      ?? url.searchParams.get('joinCode')
      ?? url.hostname,
    );
  } catch {
    const match = safeDecode(value).match(/(?:code|invite|joinCode)=([^&#/?]+)/i);
    return normalizeInviteCode(match?.[1]);
  }
}

export function buildInviteDeepLink(inviteCode: string): string {
  const code = normalizeInviteCode(inviteCode);
  if (!code) throw new Error('Invalid invite code.');
  return `pantrypal://join?code=${encodeURIComponent(code)}`;
}

export function buildInviteWebLink(inviteCode: string): string {
  const code = normalizeInviteCode(inviteCode);
  if (!code) throw new Error('Invalid invite code.');
  if (!INVITE_BASE_URL) return TESTFLIGHT_URL;
  return `${INVITE_BASE_URL}/join?code=${encodeURIComponent(code)}`;
}

export function buildInviteMessage(inviteCode: string): string {
  const code = normalizeInviteCode(inviteCode);
  if (!code) throw new Error('Invalid invite code.');
  if (INVITE_BASE_URL) {
    // Web join link available — one-tap flow
    return `Join my household on Stokit!\n${buildInviteWebLink(code)}\nInvite code: ${code}`;
  }
  // No web URL yet — clear two-step fallback so recipient knows exactly what to do
  return `Join my household on Stokit!\n\n1. Install Stokit:\n${TESTFLIGHT_URL}\n\n2. Open Stokit, tap "Join household", and enter:\n${code}`;
}

export { TESTFLIGHT_URL, INVITE_BASE_URL };
