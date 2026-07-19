/**
 * Onboarding carousel — shown once on first launch. Skip or finishing the last
 * page persists the onboarding-complete flag and routes to the Welcome landing.
 * router.replace() is used so page 2/3 never flash and the back gesture can't
 * re-enter onboarding.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useOnboardingStore } from '../../store/onboarding';
import { ONBOARDING_SLIDES } from '../../constants/onboarding';
import { OnboardingPage, PageDots } from '../../components/onboarding/OnboardingKit';
import { authBackground } from '../../components/auth/AuthKit';

const DARK_ONBOARDING_BACKGROUNDS = ['#0B0C10', '#101115', '#101216'];

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const complete = useOnboardingStore((s) => s.complete);

  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const finishedRef = useRef(false);
  const count = ONBOARDING_SLIDES.length;

  const finish = useCallback(async () => {
    if (finishedRef.current) return;   // guard against double taps / flash
    finishedRef.current = true;
    await complete();                  // persist BEFORE navigating
    router.replace('/(auth)/welcome');
  }, [complete, router]);

  const next = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (index >= count - 1) {
      void finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }, [index, count, width, finish]);

  const skip = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void finish();
  }, [finish]);

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false });
  const onMomentumEnd = (e: any) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const isLast = index === count - 1;
  const backgroundColor = isDark
    ? scrollX.interpolate({
        inputRange: ONBOARDING_SLIDES.map((_, i) => i * width),
        outputRange: DARK_ONBOARDING_BACKGROUNDS,
        extrapolate: 'clamp',
      })
    : authBackground(colors, false);

  return (
    <Animated.View style={[styles.root, { backgroundColor }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top bar: brand, progress, and Skip */}
      <View style={[styles.topBar, { marginTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={styles.brandSlot}>
          <Text style={styles.wordmark}>Stokit</Text>
        </View>
        <Text style={styles.progress}>{index + 1}/{count}</Text>
        {!isLast ? (
          <Pressable onPress={skip} hitSlop={16} accessibilityRole="button" accessibilityLabel="Skip onboarding" style={styles.skipButton}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={styles.flex}
      >
        {ONBOARDING_SLIDES.map((slide, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          const translateY = scrollX.interpolate({ inputRange, outputRange: [18, 0, 18], extrapolate: 'clamp' });
          return (
            <OnboardingPage
              key={slide.key}
              slide={slide}
              isDark={isDark}
              colors={colors}
              pageWidth={width}
              animatedStyle={{ opacity, transform: [{ translateY }] }}
            />
          );
        })}
      </Animated.ScrollView>

      {/* Bottom bar: dots + next/finish */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
        <PageDots scrollX={scrollX} count={count} pageWidth={width} colors={colors} />
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
          style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
        >
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={24} color={colors.onPrimary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    root: { flex: 1, backgroundColor: colors.background },
    topBar: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      marginBottom: spacing.xs,
    },
    brandSlot: { position: 'absolute', left: spacing.xl },
    wordmark: { fontFamily: fonts.serifRegular, fontSize: 26, lineHeight: 32, color: colors.ink },
    progress: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
    skipButton: { position: 'absolute', right: spacing.xl },
    skip: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.primary },
    bottomBar: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    nextBtn: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
  });
}
