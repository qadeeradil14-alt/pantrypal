import React, { useCallback, useRef, useState, useMemo } from 'react';
import { OTA_SEQ } from '../../constants/version';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { fonts, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { Logo } from '../../components/shared/Logo';

const getPages = (colors: AppColors) => [
  {
    title: ['Everything for your kitchen,', 'all in one place.'],
    highlightRow: 1,
    subtitle: 'Shop smarter, stock better, and stay organized with your household.',
    heroContent: (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 64, color: colors.primary, fontFamily: fonts.serif }}>S</Text>
      </View>
    ),
    features: [
      { icon: '🥫', title: 'Smart Pantry', subtitle: 'Track your pantry in real time' },
      { icon: '🛒', title: 'Shared Shopping', subtitle: 'Shop with family, always in sync' },
      { icon: '🧾', title: 'Receipts & Spending', subtitle: 'Scan and save instantly' },
    ],
  },
  {
    title: ['Shop together', 'without confusion.'],
    highlightRow: 1,
    subtitle: 'Mark items low and they instantly sync to your shared grocery list.',
    heroContent: <Text style={{ fontSize: 64 }}>🛒</Text>,
    features: [
      { icon: '📝', title: 'Household Lists', subtitle: 'Everyone on the same page' },
      { icon: '⚡', title: 'Real-time Sync', subtitle: 'Updates instantly across devices' },
      { icon: '🔔', title: 'Shopping Alerts', subtitle: 'Get notified when it matters' },
    ],
  },
  {
    title: ['Know what you', 'bought and spent.'],
    highlightRow: 1,
    subtitle: 'Scan and save instantly. Watch your weekly budget and spot where grocery money goes.',
    heroContent: <Text style={{ fontSize: 64 }}>🧾</Text>,
    features: [
      { icon: '📷', title: 'Receipt Scanning', subtitle: 'Save receipts with one tap' },
      { icon: '📈', title: 'Spending History', subtitle: 'Watch your weekly budget' },
      { icon: '🏷️', title: 'Price Memory', subtitle: 'Spot where grocery money goes' },
    ],
  },
];

export default function WelcomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const pages = useMemo(() => getPages(colors), [colors]);

  const goSignUp = useCallback(() => {
    try { router.push('/sign-up'); } catch (err) {}
  }, [router]);

  const goSignIn = useCallback(() => {
    try { router.push('/sign-in'); } catch (err) {}
  }, [router]);

  const goJoin = useCallback(() => {
    try { router.push('/join'); } catch (err) {}
  }, [router]);

  const advance = useCallback(() => {
    if (index >= pages.length - 1) {
      goSignUp();
      return;
    }
    const nextIndex = index + 1;
    scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  }, [index, width, goSignUp, pages.length]);

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    advance();
  };

  const skip = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollViewRef.current?.scrollTo({ x: (pages.length - 1) * width, animated: true });
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const handleMomentumScrollEnd = (e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(newIndex);
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.logoRow}>
          <Logo size={42} color={colors.primary} />
          <Text style={styles.brandText}>Stokit</Text>
        </View>
        <Text style={styles.tagline}>
          Your kitchen, <Text style={styles.taglineHighlight}>always</Text> in order.
        </Text>
      </View>

      {/* Carousel */}
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        style={styles.carousel}
      >
        {pages.map((page, i) => (
          <View key={i} style={{ width, paddingHorizontal: 24 }}>
            <View style={styles.pageContent}>

              <View style={styles.heroBox}>
                {page.heroContent}
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.pageTitle}>
                  {page.title.map((line, lineIdx) => (
                    <React.Fragment key={lineIdx}>
                      <Text style={lineIdx === page.highlightRow ? styles.pageTitleHighlight : undefined}>
                        {line}
                      </Text>
                      {lineIdx < page.title.length - 1 && '\n'}
                    </React.Fragment>
                  ))}
                </Text>
                <Text style={styles.pageSubtitle}>{page.subtitle}</Text>
              </View>

              <View style={styles.featuresContainer}>
                {page.features.map((feat, featIdx) => (
                  <View key={featIdx} style={styles.featureRow}>
                    <View style={styles.featureIconBox}>
                      <Text style={styles.featureIcon}>{feat.icon}</Text>
                    </View>
                    <View style={styles.featureTextCol}>
                      <Text style={styles.featureTitle}>{feat.title}</Text>
                      <Text style={styles.featureDesc}>{feat.subtitle}</Text>
                    </View>
                  </View>
                ))}
              </View>

            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.navRow}>
          <Pressable onPress={skip} hitSlop={20} style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}>
            <Text style={[styles.skipText, { opacity: index === pages.length - 1 ? 0 : 1 }]}>Skip</Text>
          </Pressable>
          <View style={styles.dots}>
            {pages.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
          <Pressable
            onPress={next}
            hitSlop={20}
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }]}
          >
            <Feather name="arrow-right" size={28} color={colors.background} />
          </Pressable>
        </View>

        <View style={styles.authRow}>
          <Text style={styles.authText}>Already have an account? </Text>
          <Pressable onPress={goSignIn} hitSlop={15}>
            <Text style={styles.authLink}>Sign in</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={goJoin}
          style={({ pressed }) => [styles.joinBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="user-plus" size={20} color={colors.primary} />
          <Text style={styles.joinBtnText}>Join with invite code</Text>
        </Pressable>
      </View>

      <Text style={[styles.versionText, { top: Math.max(insets.top, 20) + 12 }]}>
        v1.0.0 (OTA {OTA_SEQ})
      </Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    brandText: {
      fontFamily: fonts.serifItalic,
      fontSize: 48,
      color: colors.ink,
      lineHeight: 56,
    },
    tagline: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.muted,
      marginTop: 4,
    },
    taglineHighlight: {
      color: colors.primary,
      fontFamily: fonts.sansSemibold,
    },
    carousel: {
      flex: 1,
    },
    pageContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    heroBox: {
      width: 120,
      height: 120,
      backgroundColor: colors.surface,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.ink,
      shadowOpacity: 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
      marginBottom: 32,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    textContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    pageTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 28,
      lineHeight: 36,
      textAlign: 'center',
      color: colors.ink,
    },
    pageTitleHighlight: {
      color: colors.primary,
    },
    pageSubtitle: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: colors.muted,
      marginTop: 12,
    },
    featuresContainer: {
      width: '100%',
      gap: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    featureIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    featureIcon: {
      fontSize: 20,
    },
    featureTextCol: {
      flex: 1,
    },
    featureTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 16,
      color: colors.ink,
      marginBottom: 2,
    },
    featureDesc: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.muted,
    },
    bottomControls: {
      backgroundColor: colors.background,
      paddingTop: 8,
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 32,
      marginBottom: 24,
    },
    skipBtn: {
      padding: 8,
      marginLeft: -8,
    },
    skipText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 18,
      color: colors.muted,
    },
    dots: {
      flexDirection: 'row',
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    dotInactive: {
      backgroundColor: '#E5E7EB',
    },
    nextBtn: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    authRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    authText: {
      fontFamily: fonts.sans,
      fontSize: 15,
      color: colors.muted,
    },
    authLink: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      color: colors.primary,
    },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 56,
      marginHorizontal: 24,
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.background,
    },
    joinBtnText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 17,
      color: colors.primary,
    },
    versionText: {
      position: 'absolute',
      right: 15,
      fontSize: 10,
      color: colors.muted,
      fontFamily: fonts.sans,
      zIndex: 10,
    },
  });
}
