import { supabase } from './supabase';

/**
 * Parse a deep-link URL regardless of scheme.
 *
 * `new URL()` throws on custom schemes like `stokitv2://` in React Native's
 * Hermes engine. We normalise to https:// just to leverage the URL API for
 * query-string and hash parsing — the host/path values are irrelevant here.
 */
function parseAuthUrl(url: string): { code: string | null; accessToken: string | null; refreshToken: string | null } {
  try {
    // Replace any scheme (including stokitv2://) with https:// so URL() succeeds.
    const normalised = url.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, 'https://stokit.app/');
    const parsed = new URL(normalised);
    const code = parsed.searchParams.get('code');
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return {
      code,
      accessToken: fragment.get('access_token'),
      refreshToken: fragment.get('refresh_token'),
    };
  } catch {
    // Unparseable URL — not an auth link.
    return { code: null, accessToken: null, refreshToken: null };
  }
}

export async function handleAuthLink(url: string): Promise<void> {
  if (!url) return;

  const { code, accessToken, refreshToken } = parseAuthUrl(url);

  if (code) {
    // PKCE flow — exchange the one-time code for a full session.
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }

  if (accessToken && refreshToken) {
    // Implicit flow — tokens arrive in the URL fragment.
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
}
