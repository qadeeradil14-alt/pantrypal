import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, View } from 'react-native';
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
import { useOnboardingStore } from '../store/onboarding';
import { setupNotifications, registerPushToken, appendNotificationLog } from '../core/services/notifications';
import { isEmailVerified, useAuthStore } from '../store/auth-store';
import { pullFromSupabase, startSyncEngine } from '../core/services/syncEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeInviteCode } from '../core/services/household';

const PENDING_JOIN_KEY = 'stokit:v2:pending-join';

/** Parse invite code from any supported deep link format. */
function parseInviteCodeFromUrl(url: string): string | null {
  try {
    const m = url.match(/[?&](?:invite|code|inviteCode)=([A-Za-z0-9-]+)/);
    if (!m) return null;
    return normalizeInviteCode(m[1]);
  } catch {
    return null;
  }
}
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
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
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
  const bootRouteRequestedRef = useRef(false);
  const authEntryUnlockedRef = useRef(false);
  // Each tap produces a new object so React always re-renders and Expo Router
  // always navigates (identical params would be deduplicated silently).
  const [inviteTrigger, setInviteTrigger] = useState<{ code: string; t: number } | null>(null);
  // Gate the auth guard until we know whether a cold-start invite URL is present.
  const [initialUrlChecked, setInitialUrlChecked] = useState(false);
  const verified = isEmailVerified(user);
  const unlocked = verified || guestMode;
  const ready = fontsLoaded && hydratedDurable && hydratedHousehold && !authInitializing && onboardingHydrated;
  const rootNavigationState = useRootNavigationState();
  const segments = useSegments();

  useEffect(() => {
    void hydrateDurable();
    void hydrateHousehold();
    void hydrateSession();
    void hydrateOnboarding();
    void setupNotifications();
  }, [hydrateDurable, hydrateHousehold, hydrateSession, hydrateOnboarding]);

  // Capture invite deep links before the auth guard runs.
  // Cold start: getInitialURL resolves once and sets initialUrlChecked so the
  // guard waits for it. Warm start: addEventListener fires while app is open.
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) {
        const code = parseInviteCodeFromUrl(url);
        if (code) setInviteTrigger({ code, t: Date.now() });
      }
      setInitialUrlChecked(true);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = parseInviteCodeFromUrl(url);
      if (!code) return;
      setInviteTrigger({ code, t: Date.now() });
    });

    return () => sub.remove();
  }, []);

  // Warm-start invite: after boot routing has settled, route immediately to the
  // join screen. Cold-start invites are handled by the one-shot boot guard below.
  // t param makes every push unique so Expo Router never deduplicates it.
  useEffect(() => {
    if (!inviteTrigger || !ready || !rootNavigationState?.key || !initialUrlChecked) return;
    router.push({ pathname: '/(auth)/join', params: { invite: inviteTrigger.code, t: String(inviteTrigger.t) } });
    setInviteTrigger(null);
  }, [inviteTrigger, ready, rootNavigationState?.key, initialUrlChecked, router]);

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
          // open the normal Shopping screen without a store-specific prompt.
          if (data.type === 'store_arrival' && typeof data.storeId === 'string') {
            if (pathname !== '/(tabs)/shopping') router.push({ pathname: '/(tabs)/shopping', params: { arrivalStoreId: data.storeId } });
            else router.setParams({ arrivalStoreId: data.storeId });
          } else if (data.type === 'partner_arrival') {
            if (pathname !== '/(tabs)/shopping') router.push('/(tabs)/shopping');
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

      // Apply a pending household join from the /join sign-up flow.
      // Key is cleared only after a confirmed successful join so transient
      // network failures can be retried on the next sign-in.
      const pendingJoinRaw = await AsyncStorage.getItem(PENDING_JOIN_KEY);
      if (pendingJoinRaw) {
        try {
          const { inviteCode, displayName } = JSON.parse(pendingJoinRaw) as { inviteCode: string; displayName: string };
          const joinResult = await useHouseholdStore.getState().joinHousehold(inviteCode, displayName);
          if (joinResult.ok) await AsyncStorage.removeItem(PENDING_JOIN_KEY);
        } catch {
          // Non-fatal — key stays so the next sign-in can retry
        }
      }

      await pullFromSupabase();
      await startSyncEngine();
      await registerPushToken(user.id);
    })();
  }, [user, hydratedDurable, hydratedHousehold, ensureHousehold]);

  // Re-attempt push token registration whenever the app returns to foreground.
  // The startup attempt almost always runs before the user has granted
  // notification permission; this ensures registration succeeds after they
  // grant it in OS Settings and switch back.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void (async () => {
          // Re-check auth state first — if the user confirmed their email on
          // another device while this app was backgrounded, the cached
          // `user` here still shows unconfirmed until refreshed. Also always
          // (not just when unverified) catches an account deleted on another
          // device: refreshUser() force-signs-out locally when it detects
          // that, so nothing below should run against a stale/gone account.
          await useAuthStore.getState().refreshUser();
          if (!useAuthStore.getState().user) return;
          await useHouseholdStore.getState().refresh();
          await pullFromSupabase();
          await registerPushToken(user.id);
        })();
      }
    });
    return () => sub.remove();
  }, [user]);


  useEffect(() => {
    if (!ready || !rootNavigationState?.key || !initialUrlChecked) return;
    if (pathname === '/welcome') authEntryUnlockedRef.current = true;
    if (bootRouteRequestedRef.current) return;

    const preserveStartupPath =
      pathname === '/auth/callback' ||
      pathname === '/reset-password' ||
      pathname === '/verify-email';

    bootRouteRequestedRef.current = true;

    if (preserveStartupPath) return;
    if (inviteTrigger) {
      authEntryUnlockedRef.current = true;
      router.replace({ pathname: '/(auth)/join', params: { invite: inviteTrigger.code, t: String(inviteTrigger.t) } });
      setInviteTrigger(null);
    } else if (user && !verified && !guestMode) {
      router.replace('/(auth)/verify-email');
    } else if (unlocked) {
      router.replace('/(tabs)');
    } else if (!onboardingCompleted) {
      router.replace('/(auth)/onboarding');
    } else {
      router.replace('/(auth)/welcome');
    }

    if (__DEV__) {
      console.log('[BootRoute]', {
        pathname,
        segments,
        user: Boolean(user),
        authInitializing,
        onboardingHydrated,
        onboardingCompleted,
        selected: preserveStartupPath
          ? pathname
          : inviteTrigger
            ? '/join'
            : user && !verified && !guestMode
              ? '/verify-email'
              : unlocked
                ? '/(tabs)'
                : !onboardingCompleted
                  ? '/onboarding'
                  : '/welcome',
      });
    }
  }, [
    authInitializing,
    guestMode,
    initialUrlChecked,
    inviteTrigger,
    onboardingCompleted,
    onboardingHydrated,
    pathname,
    ready,
    rootNavigationState?.key,
    router,
    segments,
    unlocked,
    user,
    verified,
  ]);

  useEffect(() => {
    if (!ready || !rootNavigationState?.key || !initialUrlChecked) return;

    // Add microtask delay to allow React state to settle before routing
    setTimeout(() => {
      if (pathname === '/auth/callback') return;
      if (pathname === '/welcome') authEntryUnlockedRef.current = true;

      // Email verification check
      if (user && !verified && !guestMode && pathname !== '/verify-email' && pathname !== '/sign-up') {
        router.replace('/(auth)/verify-email');
        return;
      }

      // Main auth routing
      const authPaths = ['/onboarding', '/welcome', '/sign-in', '/sign-up', '/join', '/verify-email', '/reset-password', '/auth/callback'];
      const inAuthGroup = segments[0] === '(auth)' || authPaths.includes(pathname);

      if (unlocked && inAuthGroup && pathname !== '/join') {
        router.replace('/(tabs)');
      } else if (!unlocked) {
        if (inviteTrigger) {
          authEntryUnlockedRef.current = true;
          router.replace({ pathname: '/(auth)/join', params: { invite: inviteTrigger.code, t: String(inviteTrigger.t) } });
          setInviteTrigger(null);
        } else if (!onboardingCompleted && pathname !== '/onboarding') {
          // First launch (or reset data): show onboarding once, then Welcome.
          router.replace('/(auth)/onboarding');
        } else if (
          onboardingCompleted &&
          pathname !== '/welcome' &&
          pathname !== '/reset-password' &&
          pathname !== '/verify-email' &&
          !authEntryUnlockedRef.current
        ) {
          router.replace('/(auth)/welcome');
        } else if (!inAuthGroup) {
          router.replace(onboardingCompleted ? '/(auth)/welcome' : '/(auth)/onboarding');
        }
      }
    }, 0);
  }, [pathname, segments, ready, router, user, verified, guestMode, unlocked, initialUrlChecked, inviteTrigger, onboardingCompleted]);

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
