import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

// Keep a memory fallback so auth still works in constrained environments.
const memoryStore: Record<string, string> = {};

const storage = {
  getItem: async (key: string) => {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? memoryStore[key] ?? null;
    } catch {
      return memoryStore[key] ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    memoryStore[key] = value;
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore secure storage errors; memory fallback still keeps session alive.
    }
  },
  removeItem: async (key: string) => {
    delete memoryStore[key];
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore secure storage errors.
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
