import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthResult = { ok: true } | { ok: false; message: string };

interface AuthStore {
  loading: boolean;
  session: Session | null;
  user: User | null;
  authError: string | null;
  /**
   * The email used during the most recent sign-up attempt.
   * Persisted in-memory so the verify-email screen can display it even if
   * the Supabase user object is not yet available (e.g. race with onAuthStateChange).
   */
  pendingEmail: string | null;
  initializeAuth: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  resendVerificationEmail: (email: string) => Promise<AuthResult>;
  refreshUser: () => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  clearError: () => void;
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email may already exist. Try logging in or reset your password.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('connect')) {
    return 'Couldn’t connect. Check your internet and try again.';
  }
  if (message.includes('rate') || message.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return 'Something went wrong. Please try again.';
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  loading: true,
  session: null,
  user: null,
  authError: null,
  pendingEmail: null,

  initializeAuth: async () => {
    set({ loading: true });
    try {
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, user: data.session?.user ?? null });
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    const trimmedEmail = email.trim();
    set({ loading: true, authError: null, pendingEmail: trimmedEmail });
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: 'stokitv2://auth/callback' },
    });
    if (error) {
      const message = friendlyAuthError(error);
      set({ loading: false, authError: message });
      return { ok: false, message };
    }
    // Store user/session but keep pendingEmail so verify-email screen can
    // display the address even if onAuthStateChange fires with a null user.
    set({ session: data.session, user: data.user, loading: false });
    return { ok: true };
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
    set({ session: data.session, user: data.user, loading: false, pendingEmail: null });
    return { ok: true };
  },

  resendVerificationEmail: async (email) => {
    set({ authError: null });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: 'stokitv2://auth/callback' },
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

  signOut: async () => {
    set({ loading: true, authError: null });
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    set({ session: null, user: null, loading: false });
    if (error) {
      const message = friendlyAuthError(error);
      set({ authError: message });
      return { ok: false, message };
    }
    return { ok: true };
  },

  clearError: () => set({ authError: null }),
}));

supabase.auth.onAuthStateChange((event, session) => {
  // Preserve pendingEmail across all auth events — it is only cleared on
  // successful sign-in (verified) or explicit sign-out.
  const { pendingEmail } = useAuthStore.getState();

  if (event === 'SIGNED_OUT') {
    useAuthStore.setState({ session: null, user: null, loading: false, pendingEmail: null });
    return;
  }

  // For SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED:
  // Only update if the incoming user is non-null OR we currently have no user.
  // This prevents an intermediate Supabase event from erasing a user we just set.
  const incomingUser = session?.user ?? null;
  const currentUser = useAuthStore.getState().user;
  const nextUser = incomingUser ?? currentUser;

  useAuthStore.setState({ session, user: nextUser, loading: false, pendingEmail });
});

export const isEmailVerified = (user: User | null) => Boolean(user?.email_confirmed_at);
