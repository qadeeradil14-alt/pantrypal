/**
 * Reusable onboarding building blocks: an animated native page indicator and a
 * single slide (headline + subtitle + theme-aware illustration). Kept separate
 * from the screen so pages stay consistent and easy to restyle.
 */
import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, type } from '../../theme';
import type { AppColors } from '../../theme';
import { slideArtwork, type OnboardingSlide } from '../../constants/onboarding';

/** Animated dots — active dot widens into an orange pill, driven by scroll. */
export function PageDots({
  scrollX,
  count,
  pageWidth,
  colors,
}: {
  scrollX: Animated.Value;
  count: number;
  pageWidth: number;
  colors: AppColors;
}) {
  return (
    <View style={styles.dotsRow} accessibilityRole="tablist">
      {Array.from({ length: count }).map((_, i) => {
        const inputRange = [(i - 1) * pageWidth, i * pageWidth, (i + 1) * pageWidth];
        const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 22, 8], extrapolate: 'clamp' });
        const opacity = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={[styles.dot, { width: dotWidth, opacity, backgroundColor: colors.primary }]}
          />
        );
      })}
    </View>
  );
}

/** A single onboarding page. `animatedStyle` lets the parent apply a subtle
 *  fade/slide as the user scrolls between slides. */
export function OnboardingPage({
  slide,
  isDark,
  colors,
  pageWidth,
  animatedStyle,
}: {
  slide: OnboardingSlide;
  isDark: boolean;
  colors: AppColors;
  pageWidth: number;
  animatedStyle?: any;
}) {
  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <Animated.View style={[styles.pageInner, animatedStyle]}>
        <View style={styles.artArea}>
          <Image
            source={slideArtwork(slide, isDark)}
            style={styles.art}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.ink }]}>
            {slide.title[0]}
            {'\n'}
            <Text>{slide.title[1]}</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{slide.subtitle}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageInner: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
  },
  artArea: { height: 290, width: '100%', alignItems: 'center', justifyContent: 'center' },
  art: { height: '100%', width: '100%', maxWidth: 360 },
  textBlock: { alignItems: 'center', marginTop: spacing.lg },
  title: { ...type.slideTitle, fontFamily: fonts.serifItalic, fontSize: 31, lineHeight: 36, textAlign: 'center' },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { height: 8, borderRadius: 4 },
});
