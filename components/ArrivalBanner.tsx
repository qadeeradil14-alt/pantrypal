import { useEffect, useRef, useMemo } from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStoresStore } from '../store/stores';
import { useTheme } from '../hooks/useTheme';
import type { AppColors } from '../constants/theme';

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
        <Ionicons name="chevron-forward" size={16} color={colors.surface} style={{ opacity: 0.7 }} />
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      top: 56,
      left: 16,
      right: 16,
      zIndex: 999,
      borderRadius: 18,
      backgroundColor: colors.ink,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
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
    text: { flex: 1, fontSize: 13, color: colors.surface, lineHeight: 19 },
    bold: { fontWeight: '800', fontSize: 14 },
  });
}
