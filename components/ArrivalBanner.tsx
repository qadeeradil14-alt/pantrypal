import { useEffect, useRef, useMemo } from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStoresStore } from '../store/stores';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';

// Banner is always dark-on-cream regardless of theme — it's a high-contrast
// toast that must be readable in any lighting condition.
const BANNER_BG   = '#131211';
const BANNER_TEXT = '#F0EDE8';
const BANNER_COPPER = '#D4874E';

export default function ArrivalBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeStoreId, stores, setActiveStore } = useStoresStore();
  const translateY = useRef(new Animated.Value(-120)).current;
  const prevStoreId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activeStore = stores.find((s) => s.id === activeStoreId);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    timerRef.current = setTimeout(hide, 5000);
  }

  function hide(clearShoppingMode = false) {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true,
    }).start();
    if (clearShoppingMode) setActiveStore(null);
  }

  useEffect(() => {
    if (activeStoreId && activeStoreId !== prevStoreId.current) {
      show();
    }
    prevStoreId.current = activeStoreId;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeStoreId]);

  if (!activeStore) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <Pressable
        style={styles.inner}
        onPress={() => {
          hide();
          router.push('/(main)/grocery');
        }}
      >
        <Text style={styles.icon}>🛒</Text>
        <Text style={styles.text} numberOfLines={2}>
          <Text style={styles.bold}>Someone arrived at {activeStore.name}!</Text>
          {'\n'}Tap to open the shopping list.
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
      borderWidth: 1,
      borderColor: BANNER_COPPER + '40',  // copper tint border at 25% opacity
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 12,
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
