import { supabase } from './supabase';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Flag so the auth listener can distinguish a user-initiated sign-out
// from a network-forced one (failed token refresh fires SIGNED_OUT with
// session = null, which would incorrectly kick the user to the login screen).
let _intentionalSignOut = false;
export function wasIntentionalSignOut(): boolean {
  const was = _intentionalSignOut;
  _intentionalSignOut = false;
  return was;
}

export async function signOut() {
  _intentionalSignOut = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    _intentionalSignOut = false;
    throw error;
  }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}
