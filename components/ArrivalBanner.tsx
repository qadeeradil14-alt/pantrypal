import { useEffect, useRef, useMemo } from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStoresStore } from '../store/stores';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';

// Banner is always dark-on-cream regardless of theme — it's a high-contrast
// toast that must be readable in any lighting condition.
const BANNER_BG     = '#131211';
const BANNER_TEXT   = '#F0EDE8';
const BANNER_COPPER = '#D4874E';

export default function ArrivalBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  // Only watch arrivalStoreId — set exclusively by the realtime store_arrivals
  // subscription when a *partner* arrives. Never triggered by chip taps.
  const { arrivalStoreId, stores, setArrivalStore } = useStoresStore();
  const translateY = useRef(new Animated.Value(-180)).current;
  const prevStoreId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const arrivalStore = stores.find((s) => s.id === arrivalStoreId);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    timerRef.current = setTimeout(() => hide(), 6000);
  }

  function hide() {
    Animated.timing(translateY, {
      toValue: -180,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setArrivalStore(null));
  }

  useEffect(() => {
    if (arrivalStoreId && arrivalStoreId !== prevStoreId.current) {
      show();
    }
    prevStoreId.current = arrivalStoreId;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [arrivalStoreId]);

  if (!arrivalStore) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <Pressable
        style={styles.inner}
        onPress={() => {
          hide();
          // Navigate to Pantry so the partner can quickly mark items low
          router.push('/(main)/pantry');
        }}
      >
        <Text style={styles.icon}>🛒</Text>
        <Text style={styles.text} numberOfLines={2}>
          <Text style={styles.bold}>Someone arrived at {arrivalStore.name}!</Text>
          {'\n'}Tap to update the shopping list.
        </Text>
        <Ionicons name="chevron-forward" size={16} color={BANNER_TEXT} style={{ opacity: 0.6 }} />
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(_colors: AppColors) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      top: 56,
      left: 16,
      right: 16,
      zIndex: 999,
      borderRadius: 18,
      backgroundColor: BANNER_BG,
      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.28)',
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    icon: { fontSize: 26 },
    text: { flex: 1, fontSize: 13, color: BANNER_TEXT, lineHeight: 19, fontFamily: fonts.body },
    bold: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: BANNER_TEXT },
  });
}
