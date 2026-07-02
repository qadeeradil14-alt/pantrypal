import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, SESSION_BACKUP_KEY } from '../lib/supabase';
import { useDurableStore } from './durable-store';
import { useHouseholdStore } from './household-store';
import { useSessionStore } from './session-store';
import { stopSyncEngine } from '../core/services/syncEngine';
import { clearReceiptImages } from '../core/services/receiptImages';
import { isExistingAccountSignUpResponse } from '../core/services/authResponses';

type AuthResult =
  | { ok: true; next?: 'VERIFY_EMAIL' | 'SIGN_IN' }
  | { ok: false; message: string; code?: 'EMAIL_EXISTS' };

type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string; code?: 'OWNER_HAS_MEMBERS' };

// Only a deliberate user sign-out should navigate to the welcome screen.
let _explicitSignOut = false;
let _signUpInProgress = false;

const AUTH_REDIRECT_URL = 'pantrypal://auth/callback';

// ── Helpers ───────────────────────────────────────────────────────────────────

function saveBackup(session: Session) {
  if (!session?.refresh_token) return;
  AsyncStorage.setItem(
    SESSION_BACKUP_KEY,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
    })
  ).catch(() => {});
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email may already exist. Try logging in or reset your password.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('connect')) {
    return 'Couldn\u2019t connect. Check your internet and try again.';
  }
  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (message.includes('expired') || message.includes('invalid') || message.includes('token')) {
    return 'That code is invalid or expired. Request a new one.';
  }
  return 'Something went wrong. Please try again.';
}

function authErrorCode(error: unknown): 'EMAIL_EXISTS' | undefined {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'EMAIL_EXISTS';
  }
  return undefined;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AuthStore {
  /** True only during the FIRST auth resolution at app startup (INITIAL_SESSION /
   *  backup recovery). Gates the root navigator. Per-action button spinners use
   *  `loading` instead — toggling `loading` must NEVER tear down the navigator. */
  initializing: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  authError: string | null;
  guestMode: boolean;
  pendingEmail: string | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  verifyResetCode: (email: string, token: string, newPassword: string) => Promise<AuthResult>;
  resendVerificationEmail: (email: string) => Promise<AuthResult>;
  refreshUser: () => Promise<AuthResult>;
  clearConfirmationSession: () => Promise<void>;
  signOut: () => Promise<AuthResult>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  clearError: () => void;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  initializing: true,
  loading: true,
  session: null,
  user: null,
  authError: null,
  pendingEmail: null,
  guestMode: false,

  signUp: async (email, password) => {
    const trimmedEmail = email.trim();
    set({ loading: true, authError: null, pendingEmail: trimmedEmail });

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) {
      const message = friendlyAuthError(signOutError);
      set({ loading: false, authError: message, pendingEmail: null });
      return { ok: false, message };
    }

    await Promise.all([
      AsyncStorage.removeItem(SESSION_BACKUP_KEY),
      AsyncStorage.removeItem('stokit:v2:guestMode'),
    ]);
    set({ session: null, user: null, guestMode: false });

    _signUpInProgress = true;
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: AUTH_REDIRECT_URL },
    });
    if (error) {
      _signUpInProgress = false;
      const message = friendlyAuthError(error);
      set({ loading: false, authError: message, pendingEmail: null });
      return { ok: false, message, code: authErrorCode(error) };
    }
    if (isExistingAccountSignUpResponse(data)) {
      _signUpInProgress = false;
      const message = 'An account with this email already exists. Sign in or reset your password.';
      set({ loading: false, authError: message, pendingEmail: null });
      return { ok: false, message, code: 'EMAIL_EXISTS' };
    }

    if (data.session) {
      const { error: cleanupError } = await supabase.auth.signOut({ scope: 'local' });
      _signUpInProgress = false;
      await AsyncStorage.removeItem(SESSION_BACKUP_KEY);
      if (cleanupError) {
        const message = friendlyAuthError(cleanupError);
        set({ session: null, user: null, loading: false, authError: message, pendingEmail: null });
        return { ok: false, message };
      }
      set({ session: null, user: null, loading: false, pendingEmail: null });
      return { ok: true, next: 'SIGN_IN' };
    }

    _signUpInProgress = false;
    set({ session: data.session, user: data.user, loading: false });
    return { ok: true, next: 'VERIFY_EMAIL' };
  },

  signIn: async (email, password) => {
    set({ loading: true, authError: null });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const message = friendlyAuthError(error);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    // Save backup immediately in the action — belt-and-suspenders alongside
    // the onAuthStateChange listener saving it on SIGNED_IN.
    if (data.session) saveBackup(data.session);
    set({ session: data.session, user: data.user, loading: false, pendingEmail: null });
    return { ok: true };
  },

  resetPassword: async (email) => {
    set({ loading: true, authError: null });
    // No redirectTo: the recovery email delivers an 8-digit code (via the
    // {{ .Token }} template), not a link — so there's no deep-link to break.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      const message = friendlyAuthError(error);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    set({ loading: false });
    return { ok: true };
  },

  verifyResetCode: async (email, token, newPassword) => {
    set({ loading: true, authError: null });
    // Step 1: verify the 8-digit recovery code. On success this creates a
    // temporary authenticated session for the user.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    if (verifyError) {
      const message = friendlyAuthError(verifyError);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    // Step 2: set the new password on the now-authenticated user.
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      const message = friendlyAuthError(updateError);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    // Persist the fresh session so the user stays signed in.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      saveBackup(session);
      set({ session, user: session.user });
    }
    set({ loading: false, pendingEmail: null });
    return { ok: true };
  },

  resendVerificationEmail: async (email) => {
    set({ authError: null });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: AUTH_REDIRECT_URL },
    });
    if (error) {
      const message = friendlyAuthError(error);
      set({ authError: message });
      return { ok: false, message };
    }
    return { ok: true };
  },

  refreshUser: async () => {
    set({ loading: true, authError: null });
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const message = friendlyAuthError(error);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    const session = get().session;
    set({
      user: data.user,
      session: session ? { ...session, user: data.user } : session,
      loading: false,
    });
    return { ok: true };
  },

  clearConfirmationSession: async () => {
    set({ session: null, user: null, loading: false, authError: null, pendingEmail: null });
    await Promise.all([
      AsyncStorage.removeItem(SESSION_BACKUP_KEY),
      supabase.auth.signOut({ scope: 'local' }),
    ]);
  },

  signOut: async () => {
    set({ loading: true, authError: null });
    _explicitSignOut = true;
    // Clear all local user data so the next account that signs in on this
    // device starts with a clean slate — no cross-account data leakage.
    await Promise.all([
      useDurableStore.getState().resetLocalOnly(),
      useHouseholdStore.getState().clearLocal(),
      useSessionStore.getState().clearSession(),
    ]);
    stopSyncEngine();
    // Delete our backup so the user is truly signed out on next cold start.
    AsyncStorage.removeItem(SESSION_BACKUP_KEY).catch(() => {});
    AsyncStorage.removeItem('stokit:v2:guestMode').catch(() => {});
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    set({ session: null, user: null, loading: false, guestMode: false });
    if (error) {
      const message = friendlyAuthError(error);
      set({ authError: message });
      _explicitSignOut = false;
      return { ok: false, message };
    }
    return { ok: true };
  },

  deleteAccount: async () => {
    set({ loading: true, authError: null });

    // Server enforces the deletion policy (owner-with-members → 409) and
    // performs the actual auth.admin.deleteUser via the Edge Function.
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      let message = 'Couldn’t delete your account. Please try again.';
      let code: 'OWNER_HAS_MEMBERS' | undefined;
      if (error instanceof FunctionsHttpError) {
        const body = await error.context
          .json()
          .catch(() => null) as { error?: string; message?: string } | null;
        if (error.context.status === 409 && body?.error === 'owner_has_members') {
          code = 'OWNER_HAS_MEMBERS';
          message = body.message ??
            'Transfer ownership or remove household members before deleting your account.';
        }
      } else {
        message = friendlyAuthError(error);
      }
      set({ loading: false, authError: code ? null : message });
      return { ok: false, message, code };
    }

    // Account is gone server-side. Purge everything local — same clean-slate
    // path as signOut, plus receipt images stored on disk.
    _explicitSignOut = true;
    await Promise.all([
      useDurableStore.getState().resetLocalOnly(),
      useHouseholdStore.getState().clearLocal(),
      useSessionStore.getState().clearSession(),
      clearReceiptImages().catch(() => {}),
    ]);
    stopSyncEngine();
    AsyncStorage.removeItem(SESSION_BACKUP_KEY).catch(() => {});
    AsyncStorage.removeItem('stokit:v2:guestMode').catch(() => {});
    // Local scope only: the server-side user no longer exists.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    set({ session: null, user: null, loading: false, guestMode: false });
    return { ok: true };
  },

  clearError: () => set({ authError: null }),
  enterGuestMode: () => {
    AsyncStorage.setItem('stokit:v2:guestMode', 'true').catch(() => {});
    set({ guestMode: true });
  },
  exitGuestMode: () => {
    AsyncStorage.removeItem('stokit:v2:guestMode').catch(() => {});
    set({ guestMode: false });
  },
}));

// ── Auth state listener ───────────────────────────────────────────────────────

supabase.auth.onAuthStateChange(async (event, session) => {
  const { pendingEmail } = useAuthStore.getState();

  if (_signUpInProgress && session) return;

  // Always refresh our backup on any successful session event.
  if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
    saveBackup(session);
  }

  // ── INITIAL_SESSION ─────────────────────────────────────────────────────────
  if (event === 'INITIAL_SESSION') {
    const guestFlag = await AsyncStorage.getItem('stokit:v2:guestMode');

    if (session) {
      // Happy path: Supabase loaded a valid session from storage.
      if (__DEV__) console.log('[Auth] INITIAL_SESSION: valid session loaded.');
      // Also refresh the backup here so it always has the latest data.
      saveBackup(session);
      useAuthStore.setState({
        session,
        user: session.user,
        loading: false,
        initializing: false,
        pendingEmail,
        guestMode: guestFlag === 'true',
      });
      return;
    }

    // ── RECOVERY PATH ──────────────────────────────────────────────────────
    // Supabase fired INITIAL_SESSION with null. This happens when the stored
    // access token was expired and the refresh network call failed at startup.
    // Supabase will have already deleted its own key from AsyncStorage.
    //
    // Our session backup (seeded at module load time in lib/supabase.ts)
    // survives this deletion. Use it to recover the session.
    if (__DEV__) console.warn('[Auth] INITIAL_SESSION: null session — attempting recovery from backup...');

    try {
      const backupRaw = await AsyncStorage.getItem(SESSION_BACKUP_KEY);

      if (backupRaw) {
        const backup = JSON.parse(backupRaw) as {
          access_token: string;
          refresh_token: string;
          user: User;
        };

        if (backup?.refresh_token) {
          if (__DEV__) console.log('[Auth] Backup found. Attempting token refresh...');

          // Attempt a fresh session via the stored refresh token.
          const { data, error } = await supabase.auth.refreshSession({
            refresh_token: backup.refresh_token,
          });

          if (!error && data.session) {
            if (__DEV__) console.log('[Auth] Recovery via refresh succeeded.');
            saveBackup(data.session);
            useAuthStore.setState({
              session: data.session,
              user: data.session.user,
              loading: false,
              initializing: false,
              pendingEmail,
              guestMode: guestFlag === 'true',
            });
            return;
          }

          // Refresh failed (offline, or refresh token revoked/expired).
          // Keep the user logged in with the cached user object so they can
          // use the app. Supabase will auto-refresh when connectivity returns.
          if (backup.user) {
            if (__DEV__) console.warn('[Auth] Offline recovery: keeping user logged in with cached profile.');
            useAuthStore.setState({
              session: null,
              user: backup.user,
              loading: false,
              initializing: false,
              pendingEmail,
              guestMode: guestFlag === 'true',
            });
            return;
          }
        }

        // Backup was malformed — clear it so it's not stale forever.
        AsyncStorage.removeItem(SESSION_BACKUP_KEY).catch(() => {});
      }
    } catch (restoreError) {
      if (__DEV__) console.warn('[Auth] Recovery failed:', restoreError);
    }

    // Truly no session (first-ever launch, or backup unavailable).
    if (__DEV__) console.log('[Auth] No session found. Directing to welcome screen.');
    useAuthStore.setState({
      session: null,
      user: null,
      loading: false,
      initializing: false,
      pendingEmail,
      guestMode: guestFlag === 'true',
    });
    return;
  }

  // ── SIGNED_OUT ──────────────────────────────────────────────────────────────
  if (event === 'SIGNED_OUT') {
    if (!_explicitSignOut) {
      // Supabase fires SIGNED_OUT for internal reasons (failed refresh, etc.).
      // We handle recovery above, so silently ignore these.
      if (__DEV__) console.warn('[Auth] Ignoring non-user-initiated SIGNED_OUT.');
      return;
    }
    _explicitSignOut = false;
    useAuthStore.setState({
      session: null,
      user: null,
      loading: false,
      initializing: false,
      pendingEmail: null,
      guestMode: false,
    });
    return;
  }

  // ── SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED ──────────────────────────────
  // Don't erase an existing user if the incoming session's user is null.
  const incomingUser = session?.user ?? null;
  const currentUser = useAuthStore.getState().user;
  const nextUser = incomingUser ?? currentUser;

  useAuthStore.setState({ session, user: nextUser, loading: false, initializing: false, pendingEmail });
});

export const isEmailVerified = (user: User | null) => Boolean(user?.email_confirmed_at);
export const isAppUnlocked = () => {
  const { guestMode, user } = useAuthStore.getState();
  return guestMode || isEmailVerified(user);
};
