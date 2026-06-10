import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, usePathname, useRouter } from 'expo-router';
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
// Geofence background task must be defined at module load time (before any render).
import { defineGeofenceTask } from '../core/services/geofencing';

defineGeofenceTask(
  () => useDurableStore.getState().items,
  () => useDurableStore.getState().stores,
);

export default function RootLayout() {
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
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
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
    void initializeAuth();
    void setupNotifications();
    void Linking.getInitialURL().then(async (url) => {
      if (url) await handleAuthLink(url);
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthLink(url);
    });
    return () => linkSubscription.remove();
  }, [hydrateDurable, hydrateHousehold, hydrateSession, initializeAuth]);

  // Aggressively check for OTA updates on every launch and reload immediately.
  useEffect(() => {
    if (__DEV__) return; // Skip in development
    async function checkForUpdate() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        // Silently fail — app still works with the current bundle
        console.log('[OTA] Update check failed:', e);
      }
    }
    void checkForUpdate();
  }, []);

  const verified = isEmailVerified(user);
  const unlocked = verified || guestMode;
  const ready = fontsLoaded && hydratedDurable && hydratedHousehold && !authLoading;

  useEffect(() => {
    if (!ready) return;
    
    // Email verification check
    if (user && !verified && !guestMode && pathname !== '/verify-email') {
      router.replace('/(auth)/verify-email');
      return;
    }

    // Main auth routing
    const inAuthGroup = pathname.startsWith('/(auth)');
    if (unlocked && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!unlocked && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    }
  }, [pathname, ready, router, user, verified, guestMode, unlocked]);

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
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
