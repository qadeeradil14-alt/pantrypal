import { useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Dimensions, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'track',
    emoji: '🏡',
    title: 'Know what\nyou have',
    sub: 'Track your fridge, freezer and pantry in real-time — shared live with everyone at home.',
  },
  {
    key: 'shop',
    emoji: '🛒',
    title: 'Shop smarter,\ntogether',
    sub: 'Mark items low and they auto-appear on your list. One tap in-store to check them off.',
  },
  {
    key: 'spend',
    emoji: '🧾',
    title: 'See where\nit goes',
    sub: 'Scan receipts after every trip to track spending by store and spot patterns over time.',
  },
];

export default function WelcomeScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatRef = useRef<FlatList>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  function goNext() {
    if (page < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } });
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.emojiWrap}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSub}>{item.sub}</Text>
          </View>
        )}
        style={styles.pager}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
          const width = scrollX.interpolate({ inputRange, outputRange: [6, 20, 6], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[styles.dot, { width, opacity }]} />;
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>
            {page === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="auth-welcome-sign-in"
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/sign-in')}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    pager: { flex: 1 },
    slide: {
      width: W,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      gap: 20,
    },
    emojiWrap: {
      width: 110,
      height: 110,
      borderRadius: 36,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    emoji: { fontSize: 52 },
    slideTitle: {
      fontSize: 36,
      fontFamily: fonts.displayExtraBold,
      color: colors.ink,
      letterSpacing: -0.6,
      textAlign: 'center',
      lineHeight: 46,
    },
    slideSub: {
      fontSize: 16,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 24,
      fontFamily: fonts.body,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 20,
    },
    dot: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: 24,
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 17,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontFamily: fonts.bodySemiBold },
    secondaryBtn: { paddingVertical: 13, alignItems: 'center' },
    secondaryBtnText: { color: colors.muted, fontSize: 15, fontFamily: fonts.bodyMedium },
  });
}
