import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import * as Notifications from 'expo-notifications';
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
import { setupNotifications, registerPushToken, appendNotificationLog } from '../core/services/notifications';
import { isEmailVerified, useAuthStore } from '../store/auth-store';
import { pullFromSupabase, startSyncEngine } from '../core/services/syncEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_JOIN_KEY = 'stokit:v2:pending-join';
// Geofence background task must be defined at module load time (before any render).
import { defineGeofenceTask } from '../core/services/geofencing';

defineGeofenceTask(
  () => useDurableStore.getState().items,
  () => useDurableStore.getState().stores,
);

// Notification handler must also be registered at module level so it is active
// during cold headless background launches (when React never mounts). This is
// idempotent — calling it again from the useEffect below is safe.
setupNotifications();

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
  const ensureHousehold = useHouseholdStore((s) => s.ensureHousehold);
  const hydrateSession = useSessionStore((s) => s.hydrateSession);
  // Gate the navigator on `initializing` (first startup auth check) — NOT on
  // `loading`, which toggles during every sign-in/sign-up button press. Gating
  // on `loading` tore the navigator down mid-sign-up and bounced the user to
  // the welcome screen before the success state could render.
  const authInitializing = useAuthStore((s) => s.initializing);
  const user = useAuthStore((s) => s.user);
  const guestMode = useAuthStore((s) => s.guestMode);
  const router = useRouter();
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const handledNotificationIdRef = useRef<string | null>(null);
  const verified = isEmailVerified(user);
  const unlocked = verified || guestMode;
  const ready = fontsLoaded && hydratedDurable && hydratedHousehold && !authInitializing;
  const rootNavigationState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    void hydrateDurable();
    void hydrateHousehold();
    void hydrateSession();
    void setupNotifications();
  }, [hydrateDurable, hydrateHousehold, hydrateSession]);

  // Route arrival notification taps into Shopping. No store-detail route exists
  // yet, so Shopping is the safest stable target for both local arrival
  // notifications and household partner-arrival pushes.
  useEffect(() => {
    if (!ready || !rootNavigationState?.key) return;
    const handleNotificationResponse = (response: Notifications.NotificationResponse | null | undefined) => {
      try {
        const notificationId = response?.notification?.request?.identifier ?? null;
        if (notificationId && handledNotificationIdRef.current === notificationId) return;
        const data = response?.notification?.request?.content?.data as
          | { type?: string; storeName?: string; storeId?: string }
          | undefined;
        if (!data) return;
        if (notificationId) handledNotificationIdRef.current = notificationId;
        if (data.type === 'store_arrival' || data.type === 'partner_arrival' || typeof data.storeName === 'string') {
          const title = response?.notification?.request?.content?.title ?? 'unknown';
          void appendNotificationLog('tapped', `title="${title}" type=${data.type ?? 'unknown'}`);
          // Geofence opens the current shopper into that store. Partner alerts
          // open a read-only Walmart/Target/etc context so the recipient can
          // add an item directly to that shared store list.
          if (data.type === 'store_arrival' && typeof data.storeId === 'string') {
            if (pathname !== '/(tabs)/shopping') router.push({ pathname: '/(tabs)/shopping', params: { arrivalStoreId: data.storeId } });
            else router.setParams({ arrivalStoreId: data.storeId });
          } else if (data.type === 'partner_arrival' && typeof data.storeId === 'string') {
            if (pathname !== '/(tabs)/shopping') router.push({ pathname: '/(tabs)/shopping', params: { partnerStoreId: data.storeId, partnerStoreName: data.storeName ?? '' } });
            else router.setParams({ partnerStoreId: data.storeId, partnerStoreName: data.storeName ?? '' });
          } else if (pathname !== '/(tabs)/shopping') {
            router.push('/(tabs)/shopping');
          }
          void appendNotificationLog('shopping_opened', `navigated from notification tap`);
        }
      } catch {
        // Defensive — never let a malformed notification payload crash the app
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse).catch(() => {});
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => notificationSubscription.remove();
  }, [router, ready, rootNavigationState?.key]);

  // Cloud recovery: pull data back from Supabase on every sign-in so that
  // stores (logos) are restored even when items already exist locally.
  useEffect(() => {
    if (!user || !hydratedDurable || !hydratedHousehold) return;
    void (async () => {
      await ensureHousehold();

      // Apply a pending household join from the /join sign-up flow
      const pendingJoinRaw = await AsyncStorage.getItem(PENDING_JOIN_KEY);
      if (pendingJoinRaw) {
        await AsyncStorage.removeItem(PENDING_JOIN_KEY);
        try {
          const { inviteCode, displayName } = JSON.parse(pendingJoinRaw) as { inviteCode: string; displayName: string };
          await useHouseholdStore.getState().joinHousehold(inviteCode, displayName);
        } catch {
          // Invalid stored data — ignore, user can join manually from settings
        }
      }

      await pullFromSupabase();
      await startSyncEngine();
      void registerPushToken(user.id);
    })();
  }, [user, hydratedDurable, hydratedHousehold, ensureHousehold]);

  // Re-attempt push token registration whenever the app returns to foreground.
  // The startup attempt almost always runs before the user has granted
  // notification permission; this ensures registration succeeds after they
  // grant it in OS Settings and switch back.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void registerPushToken(user.id);
    });
    return () => sub.remove();
  }, [user]);


  useEffect(() => {
    if (!ready || !rootNavigationState?.key) return;

    // Add microtask delay to allow React state to settle before routing
    setTimeout(() => {
      if (pathname === '/auth/callback') return;

      // Email verification check
      if (user && !verified && !guestMode && pathname !== '/verify-email' && pathname !== '/sign-up') {
        router.replace('/(auth)/verify-email');
        return;
      }

      // Main auth routing
      const authPaths = ['/welcome', '/sign-in', '/sign-up', '/join', '/verify-email', '/reset-password', '/auth/callback'];
      const inAuthGroup = authPaths.includes(pathname);

      if (unlocked && inAuthGroup) {
        router.replace('/(tabs)');
      } else if (!unlocked && !inAuthGroup) {
        router.replace('/(auth)/welcome');
      }
    }, 0);
  }, [pathname, segments, ready, router, user, verified, guestMode, unlocked]);

  if (!ready && pathname !== '/auth/callback') {
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
          <Stack.Screen name="auth/callback" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
