import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, usePathname, useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import { useTheme } from '../hooks/useTheme';
import { useDurableStore } from '../store/durable-store';
import { useHouseholdStore } from '../store/household-store';
import { useSessionStore } from '../store/session-store';
import { setupNotifications } from '../core/services/notifications';
import { handleAuthLink } from '../lib/auth-links';
import { isEmailVerified, useAuthStore } from '../store/auth-store';
import { pullFromSupabase } from '../core/services/syncEngine';
// Geofence background task must be defined at module load time (before any render).
import { defineGeofenceTask } from '../core/services/geofencing';

defineGeofenceTask(
  () => useDurableStore.getState().items,
  () => useDurableStore.getState().stores,
);

// Eager OTA catch-up: runs while the loading spinner is visible.
// If the native loader missed a new update (timeout or no network at boot),
// this grabs it now and reloads before the user sees the app.
async function applyPendingUpdate() {
  if (!Updates.isEnabled) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Non-fatal — continue on current bundle
  }
}

export default function RootLayout() {
  useEffect(() => { void applyPendingUpdate(); }, []);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  const hydrateDurable = useDurableStore((s) => s.hydrate);
  const hydratedDurable = useDurableStore((s) => s.hydrated);
  const hydrateHousehold = useHouseholdStore((s) => s.hydrate);
  const hydratedHousehold = useHouseholdStore((s) => s.hydrated);
  const hydrateSession = useSessionStore((s) => s.hydrateSession);
  const authLoading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const guestMode = useAuthStore((s) => s.guestMode);
  const router = useRouter();
  const pathname = usePathname();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    void hydrateDurable();
    void hydrateHousehold();
    void hydrateSession();
    void setupNotifications();
    void Linking.getInitialURL().then(async (url) => {
      if (url) await handleAuthLink(url);
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthLink(url);
    });
    return () => linkSubscription.remove();
  }, [hydrateDurable, hydrateHousehold, hydrateSession]);

  // Cloud recovery: if the user is authenticated but local store is empty
  // (e.g. after app reinstall), pull their data back from Supabase.
  useEffect(() => {
    if (!user || !hydratedDurable) return;
    const { items } = useDurableStore.getState();
    if (items.length === 0) {
      void pullFromSupabase();
    }
  }, [user, hydratedDurable]);



  const verified = isEmailVerified(user);
  const unlocked = verified || guestMode;
  const ready = fontsLoaded && hydratedDurable && hydratedHousehold && !authLoading;

  const rootNavigationState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    if (!ready || !rootNavigationState?.key) return;

    // Add microtask delay to allow React state to settle before routing
    setTimeout(() => {
      // Email verification check
      if (user && !verified && !guestMode && pathname !== '/verify-email') {
        router.replace('/(auth)/verify-email');
        return;
      }

      // Main auth routing
      const authPaths = ['/welcome', '/sign-in', '/sign-up', '/verify-email'];
      const inAuthGroup = authPaths.includes(pathname);

      if (unlocked && inAuthGroup) {
        router.replace('/(tabs)');
      } else if (!unlocked && !inAuthGroup) {
        router.replace('/(auth)/welcome');
      }
    }, 0);
  }, [pathname, segments, ready, router, user, verified, guestMode, unlocked]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'none',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
