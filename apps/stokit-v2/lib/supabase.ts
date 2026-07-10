import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  console.warn('⚠️ Missing EXPO_PUBLIC_SUPABASE_URL! Supabase sync will not work.');
}
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('⚠️ Missing EXPO_PUBLIC_SUPABASE_ANON_KEY! Supabase auth will not work.');
}

/**
 * SESSION BACKUP BOOTSTRAP
 *
 * Supabase wipes its own auth key from AsyncStorage when a token refresh fails
 * at startup (expired token + network issue). This happens BEFORE INITIAL_SESSION
 * fires, so by the time we try to recover, the key is already gone.
 *
 * This bootstrap runs at module load time — synchronously initiated, before
 * Supabase's initialize() makes any network calls — and reads the Supabase
 * session key while it still exists, saving it to OUR own backup key.
 *
 * If our backup already has fresh data, we skip this.
 */
export const SESSION_BACKUP_KEY = 'stokit:v2:session-backup';

try {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const SUPA_KEY = `sb-${projectRef}-auth-token`;

  // Fire-and-forget — completes before any Supabase network call (AsyncStorage
  // reads are local and complete in <5ms; network calls take >200ms).
  AsyncStorage.getItem(SESSION_BACKUP_KEY).then(async (existing) => {
    if (existing) {
      // We already have a fresh backup — nothing to do.
      return;
    }
    const raw = await AsyncStorage.getItem(SUPA_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.refresh_token && parsed?.user) {
      await AsyncStorage.setItem(
        SESSION_BACKUP_KEY,
        JSON.stringify({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          user: parsed.user,
        })
      );
      console.log('[Auth] Session backup bootstrapped from Supabase key at startup.');
    }
  }).catch((e) => console.warn('[Auth] Bootstrap failed:', e));
} catch (_) {}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
