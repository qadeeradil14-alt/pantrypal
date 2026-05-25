import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { useStoresStore } from '../store/stores';
import { defineGeofenceTask } from '../lib/geofencing';
import { notifyPartnerArrival, recordStoreArrival } from '../lib/geofencing';

// Register geofence background task at module load time (before any async code)
defineGeofenceTask((storeId) => {
  useStoresStore.getState().setActiveStore(storeId);
  const store = useStoresStore.getState().stores.find((s) => s.id === storeId);
  if (store) {
    notifyPartnerArrival(store.name);
    recordStoreArrival(store).catch(() => {});
  }
});

export default function RootLayout() {
  const { session, loading, setSession, setLoading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session — always call setLoading(false) even on error
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth state changes — handles token refresh + sign out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const atRootIndex = segments[0] === 'index' || !segments[0];

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && (inAuthGroup || atRootIndex)) {
      router.replace('/(setup)/check');
    }
  }, [session, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(setup)" />
      <Stack.Screen name="(main)" />
      <Stack.Screen name="join" />
    </Stack>
  );
}
