import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StyleSheet, View, ActivityIndicator, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts as usePlayfairFonts } from '@expo-google-fonts/playfair-display';
import { useFonts as useDMSansFonts } from '@expo-google-fonts/dm-sans';
import { useFonts as useDMMonoFonts } from '@expo-google-fonts/dm-mono';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { defineGeofenceTask } from '../lib/geofencing';
import { startMutationQueueWorker } from '../lib/offlineQueue';

// Register geofence background task at module load time (before any async code)
defineGeofenceTask(() => {});

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
  const fontsLoaded = playfairLoaded && dmSansLoaded && dmMonoLoaded;

  const { session, loading, setSession, setLoading } = useAuthStore();
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

    return () => {
      subscription.unsubscribe();
      stopWorker();
    };
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

  // Hold the splash until fonts are ready — prevents FOUT on first render
  if (!fontsLoaded) {
    return (
      <View style={[styles.root, styles.splash]}>
        <ActivityIndicator color="#D4874E" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(setup)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="join" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1C1812' },
});
