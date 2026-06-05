import { useEffect, Component, type ReactNode } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StyleSheet, View, Text, ActivityIndicator, LogBox, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { useFonts as usePlayfairFonts } from '@expo-google-fonts/playfair-display';
import { useFonts as useDMSansFonts } from '@expo-google-fonts/dm-sans';
import { useFonts as useDMMonoFonts } from '@expo-google-fonts/dm-mono';
import { useFonts as useFrauncesFonts } from '@expo-google-fonts/fraunces';
import { supabase } from '../lib/supabase';
import { wasIntentionalSignOut } from '../lib/auth';
import { useAuthStore } from '../store/auth';
import { useStoresStore } from '../store/stores';
import { defineGeofenceTask } from '../lib/geofencing';
import { startMutationQueueWorker, flushMutationQueue } from '../lib/offlineQueue';
import { lightColors } from '../constants/theme';

// Register geofence background task at module load time (before any async code)
defineGeofenceTask(() => {});

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: lightColors.background }}>
          <Text style={{ fontSize: 32, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', color: lightColors.ink, textAlign: 'center', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: lightColors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
            {(this.state.error as Error).message ?? 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ error: null })}
            style={{ backgroundColor: lightColors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 }}
          >
            <Text style={{ color: lightColors.onPrimary, fontSize: 16, fontWeight: '600' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'Background location is limited in Expo Go',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'Sending `websocketMessage` with no listeners registered',
]);

export default function RootLayout() {
  // ── Slow Kitchen fonts ─────────────────────────────────────────────────────
  const [playfairLoaded] = usePlayfairFonts({
    'PlayfairDisplay-Regular':    require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
    'PlayfairDisplay-Italic':     require('@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf'),
    'PlayfairDisplay-Bold':       require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
    'PlayfairDisplay-BoldItalic': require('@expo-google-fonts/playfair-display/700Bold_Italic/PlayfairDisplay_700Bold_Italic.ttf'),
    'PlayfairDisplay-ExtraBold':  require('@expo-google-fonts/playfair-display/800ExtraBold/PlayfairDisplay_800ExtraBold.ttf'),
    'PlayfairDisplay-ExtraBoldItalic': require('@expo-google-fonts/playfair-display/800ExtraBold_Italic/PlayfairDisplay_800ExtraBold_Italic.ttf'),
  });
  const [frauncesLoaded] = useFrauncesFonts({
    'Fraunces-Medium': require('@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf'),
    'Fraunces-SemiBold': require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  });
  const [dmSansLoaded] = useDMSansFonts({
    'DMSans-Light':     require('@expo-google-fonts/dm-sans/300Light/DMSans_300Light.ttf'),
    'DMSans-Regular':   require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    'DMSans-Medium':    require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    'DMSans-SemiBold':  require('@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf'),
  });
  const [dmMonoLoaded] = useDMMonoFonts({
    'DMMono-Regular': require('@expo-google-fonts/dm-mono/400Regular/DMMono_400Regular.ttf'),
    'DMMono-Medium':  require('@expo-google-fonts/dm-mono/500Medium/DMMono_500Medium.ttf'),
  });
  const fontsLoaded = playfairLoaded && frauncesLoaded && dmSansLoaded && dmMonoLoaded;

  const { session, loading, setSession, setLoading } = useAuthStore();
  const setActiveStore = useStoresStore((s) => s.setActiveStore);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const stopWorker = startMutationQueueWorker();

    // Get initial session — always call setLoading(false) even on error
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        // Network error — don't clear session. User stays logged in offline.
        // setSession(null) would kick them to the sign-in screen incorrectly.
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for auth state changes — handles token refresh + sign out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !wasIntentionalSignOut()) {
        // Network-forced sign-out (failed token refresh while offline).
        // Do NOT clear the session — user stays logged in until they
        // explicitly tap Sign Out or connectivity is restored.
        setLoading(false);
        return;
      }
      setSession(session);
      setLoading(false);

      // TOKEN_REFRESHED means we just came back online — flush queued mutations immediately
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        void flushMutationQueue();
      }
    });

    // Fix #8 — notification tap routing:
    // When user taps an arrival notification, set the correct store as active
    // and navigate to the Shopping tab so the right list opens immediately.
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.type === 'arrival_self' && typeof data.storeId === 'string') {
        setActiveStore(data.storeId);
        // Navigate to Shopping tab — route depends on whether user is in (main) already
        router.push('/(main)/grocery');
      }
    });

    return () => {
      subscription.unsubscribe();
      stopWorker();
      notifSub.remove();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const atRootIndex = segments[0] === 'index' || !segments[0];
    const atJoinRoute = segments[0] === 'join';

    if (!session && !inAuthGroup && !atJoinRoute) {
      router.replace('/(auth)/welcome');
    } else if (session && (inAuthGroup || atRootIndex)) {
      router.replace('/(setup)/check');
    }
  }, [session, loading, segments]);

  // Hold the splash until fonts are ready — prevents FOUT on first render
  if (!fontsLoaded) {
    return (
      <View style={[styles.root, styles.splash]}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(setup)" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="join" />
        </Stack>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { justifyContent: 'center', alignItems: 'center', backgroundColor: lightColors.background },
});
