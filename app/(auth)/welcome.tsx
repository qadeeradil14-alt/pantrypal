import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Animated, Easing, useWindowDimensions, AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, lightColors } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

const B = {
  bg: lightColors.background,
  card: lightColors.surface,
  cardDeep: lightColors.surfaceTint,
  primary: lightColors.primary,
  ink: lightColors.ink,
  muted: lightColors.muted,
  border: lightColors.border,
  onPrimary: lightColors.onPrimary,
};

const SLIDES = [
  {
    key: 'track',
    emoji: '🧊',
    accent: 'rgba(192,112,56,0.18)',
    ring: 'rgba(192,112,56,0.08)',
    floaters: [
      { e: '🥛', angle: 306, radius: 116, size: 21, speed: 'slow' },
      { e: '🥫', angle: 354, radius: 118, size: 21, speed: 'fast' },
      { e: '🍞', angle: 40, radius: 118, size: 21, speed: 'slow' },
      { e: '🧀', angle: 90, radius: 116, size: 21, speed: 'fast' },
      { e: '🥚', angle: 144, radius: 116, size: 20, speed: 'slow' },
      { e: '🍯', angle: 204, radius: 114, size: 20, speed: 'fast' },
      { e: '🧂', angle: 264, radius: 104, size: 18, speed: 'slow' },
    ],
    title: 'Home inventory,\nauto-sorted',
    sub: 'Fridge, freezer, and pantry items settle into the right place before the next store run.',
  },
  {
    key: 'shop',
    emoji: '🛒',
    accent: 'rgba(61,107,79,0.18)',
    ring: 'rgba(61,107,79,0.08)',
    floaters: [
      { e: '🥦', angle: 304, radius: 116, size: 22, speed: 'slow' },
      { e: '🥑', angle: 348, radius: 118, size: 21, speed: 'fast' },
      { e: '🍎', angle: 28, radius: 118, size: 22, speed: 'slow' },
      { e: '🥕', angle: 68, radius: 116, size: 21, speed: 'fast' },
      { e: '🫑', angle: 108, radius: 114, size: 20, speed: 'slow' },
      { e: '🥚', angle: 148, radius: 116, size: 20, speed: 'slow' },
      { e: '🍌', angle: 190, radius: 116, size: 20, speed: 'fast' },
      { e: '🍅', angle: 232, radius: 112, size: 20, speed: 'slow' },
      { e: '🧅', angle: 274, radius: 108, size: 18, speed: 'fast' },
    ],
    title: 'Shop smarter,\ntogether',
    sub: 'Mark items low and they appear on your grocery list. Check them off in-store.',
  },
  {
    key: 'spend',
    emoji: '🧾',
    accent: 'rgba(192,112,56,0.16)',
    ring: 'rgba(61,107,79,0.08)',
    floaters: [
      { e: '💵', angle: 306, radius: 116, size: 21, speed: 'slow' },
      { e: '📈', angle: 354, radius: 118, size: 21, speed: 'fast' },
      { e: '🏪', angle: 38, radius: 116, size: 21, speed: 'slow' },
      { e: '🧮', angle: 92, radius: 116, size: 20, speed: 'fast' },
      { e: '💳', angle: 146, radius: 116, size: 19, speed: 'slow' },
      { e: '🏷️', angle: 206, radius: 114, size: 20, speed: 'fast' },
      { e: '💰', angle: 262, radius: 102, size: 19, speed: 'slow' },
    ],
    title: 'Receipts into\nreal numbers',
    sub: 'Save receipts, watch the weekly budget, and spot where grocery money goes.',
  },
];

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const orbitSlow = useRef(new Animated.Value(0)).current;
  const orbitFast = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;
  const receiptAnim = useRef(new Animated.Value(0)).current;
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroAnim, { toValue: 1, damping: 18, stiffness: 120, useNativeDriver: true }),
    ]).start();

    const slowLoop = Animated.loop(
      Animated.timing(orbitSlow, {
        toValue: 1,
        duration: 26000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const fastLoop = Animated.loop(
      Animated.timing(orbitFast, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
        duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const receiptLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(receiptAnim, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(receiptAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    if (!reduceMotion) {
      slowLoop.start();
      fastLoop.start();
      breatheLoop.start();
      receiptLoop.start();
    }
    return () => {
      slowLoop.stop();
      fastLoop.stop();
      breatheLoop.stop();
      receiptLoop.stop();
    };
  }, [breatheAnim, fadeIn, heroAnim, orbitFast, orbitSlow, receiptAnim, reduceMotion]);

  function goNext() {
    if (page < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } });
    }
  }

  const heroHeight = Math.min(height * 0.42, 360);
  const slowSpin = orbitSlow.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const slowCounter = orbitSlow.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const fastSpin = orbitFast.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const fastCounter = orbitFast.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const receiptOpacity = receiptAnim.interpolate({
    inputRange: [0, 0.14, 0.76, 1],
    outputRange: [0, 1, 1, 0],
  });
  const receiptScale = receiptAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.64, 0.2],
  });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.header, { opacity: fadeIn }]}>
          <Text style={styles.cartIcon}>🛒</Text>
          <Text style={styles.brandName}>Stokit</Text>
        </Animated.View>

        <FlatList
          ref={flatRef}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item, index }) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const floaterX = scrollX.interpolate({
              inputRange,
              outputRange: [-24, 0, 24],
              extrapolate: 'clamp',
            });

            return (
              <View style={[styles.slide, { width }]}>
                <Animated.View
                  style={[
                    styles.heroCard,
                    { height: heroHeight },
                    {
                      opacity: fadeIn,
                      transform: [{ scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
                    },
                  ]}
                >
                  <View style={[styles.glowRing, { borderColor: item.ring }]} />
                  <View style={[styles.glowDot, { backgroundColor: item.accent }]} />
                  {item.key === 'track' && (
                    <View style={styles.trackZones}>
                      <View style={[styles.trackZone, styles.trackZoneFridge]}>
                        <Text style={styles.trackZoneEmoji}>🧊</Text>
                      </View>
                      <View style={[styles.trackZone, styles.trackZoneFreezer]}>
                        <Text style={styles.trackZoneEmoji}>❄️</Text>
                      </View>
                      <View style={[styles.trackZone, styles.trackZonePantry]}>
                        <Text style={styles.trackZoneEmoji}>🥫</Text>
                      </View>
                    </View>
                  )}
                  {(item.key === 'track' || item.key === 'shop') && (
                    <View style={styles.intakeLayer}>
                      {(item.key === 'track'
                        ? [
                            { e: '🥛', x: -118, y: -84, tx: -88, ty: -72, d: 0 },
                            { e: '🧀', x: 118, y: -76, tx: 88, ty: -72, d: 0.07 },
                            { e: '🍞', x: -112, y: 4, tx: 0, ty: 86, d: 0.14 },
                            { e: '🥫', x: 112, y: 8, tx: 0, ty: 86, d: 0.21 },
                            { e: '🥚', x: -82, y: 98, tx: -88, ty: -72, d: 0.28 },
                            { e: '🍯', x: 80, y: 102, tx: 0, ty: 86, d: 0.35 },
                            { e: '🧂', x: 0, y: -120, tx: 0, ty: 86, d: 0.42 },
                            { e: '🥑', x: 0, y: 120, tx: 88, ty: -72, d: 0.49 },
                          ]
                        : [
                            { e: '🥦', x: -118, y: -80, d: 0 },
                            { e: '🥑', x: 118, y: -72, d: 0.06 },
                            { e: '🍎', x: -46, y: -118, d: 0.12 },
                            { e: '🥕', x: 50, y: -116, d: 0.18 },
                            { e: '🫑', x: -120, y: 10, d: 0.24 },
                            { e: '🥚', x: 120, y: 12, d: 0.3 },
                            { e: '🍌', x: -96, y: 86, d: 0.36 },
                            { e: '🍅', x: 98, y: 84, d: 0.42 },
                            { e: '🧅', x: 0, y: 118, d: 0.48 },
                          ] as { e: string; x: number; y: number; tx?: number; ty?: number; d: number }[]).map((flyer, fi) => {
                        const end = Math.min(flyer.d + 0.44, 0.94);
                        const progress = receiptAnim.interpolate({
                          inputRange: [flyer.d, end],
                          outputRange: [0, 1],
                          extrapolate: 'clamp',
                        });
                        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [flyer.x, flyer.tx ?? 0] });
                        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [flyer.y, flyer.ty ?? 0] });
                        const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 1, 1, 0] });
                        const scale = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.62, 0.18] });
                        return (
                          <Animated.View
                            key={fi}
                            style={[
                              styles.intakeChip,
                              {
                                opacity,
                                transform: [
                                  { translateX },
                                  { translateY },
                                  { scale },
                                ],
                              },
                            ]}
                          >
                            <Text style={styles.intakeEmoji}>{flyer.e}</Text>
                          </Animated.View>
                        );
                      })}
                    </View>
                  )}
                  {item.key === 'spend' && (
                    <View style={styles.receiptLayer}>
                      {[
                        { x: -118, y: -78, r: '-12deg', d: 0 },
                        { x: 112, y: -66, r: '10deg', d: 0.12 },
                        { x: -104, y: 74, r: '8deg', d: 0.24 },
                        { x: 104, y: 72, r: '-8deg', d: 0.36 },
                      ].map((receipt, ri) => {
                        const end = Math.min(receipt.d + 0.48, 0.94);
                        const progress = receiptAnim.interpolate({
                          inputRange: [receipt.d, end],
                          outputRange: [0, 1],
                          extrapolate: 'clamp',
                        });
                        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [receipt.x, 0] });
                        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [receipt.y, 0] });
                        const opacity = progress.interpolate({ inputRange: [0, 0.14, 0.82, 1], outputRange: [0, 1, 1, 0] });
                        const scale = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.64, 0.2] });
                        return (
                          <Animated.View
                            key={ri}
                            style={[
                              styles.receiptSlip,
                              {
                                opacity,
                                transform: [
                                  { translateX },
                                  { translateY },
                                  { rotate: receipt.r },
                                  { scale },
                                ],
                              },
                            ]}
                          >
                            <View style={styles.receiptLineLong} />
                            <View style={styles.receiptLine} />
                            <View style={styles.receiptTotalRow}>
                              <View style={styles.receiptTotal} />
                              <Text style={styles.receiptDollar}>$</Text>
                            </View>
                          </Animated.View>
                        );
                      })}
                      {[
                        { e: '📈', x: 0, y: -120, d: 0.08 },
                        { e: '🧮', x: -122, y: 4, d: 0.2 },
                        { e: '💳', x: 122, y: 6, d: 0.32 },
                        { e: '💵', x: 0, y: 120, d: 0.44 },
                      ].map((budget, bi) => {
                        const progress = receiptAnim.interpolate({
                          inputRange: [budget.d, Math.min(budget.d + 0.44, 0.94)],
                          outputRange: [0, 1],
                          extrapolate: 'clamp',
                        });
                        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [budget.x, 0] });
                        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [budget.y, 0] });
                        const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 1, 1, 0] });
                        const scale = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.62, 0.18] });
                        return (
                          <Animated.View
                            key={bi}
                            style={[
                              styles.financeChip,
                              {
                                opacity,
                                transform: [{ translateX }, { translateY }, { scale }],
                              },
                            ]}
                          >
                            <Text style={styles.financeEmoji}>{budget.e}</Text>
                          </Animated.View>
                        );
                      })}
                    </View>
                  )}
                  {false && <Animated.View style={[styles.orbit, { transform: [{ translateX: floaterX }] }]}>
                    {item.floaters.map((f: { e: string; angle: number; radius: number; size: number; speed: string }, fi: number) => {
                      const spin = f.speed === 'fast' ? fastSpin : slowSpin;
                      const counter = f.speed === 'fast' ? fastCounter : slowCounter;
                      return (
                      <Animated.View
                        key={fi}
                        style={[
                          styles.orbitItem,
                          {
                            transform: [
                              { rotate: `${f.angle}deg` },
                              { rotate: spin },
                              { translateX: f.radius },
                              { rotate: counter },
                              { rotate: `${-f.angle}deg` },
                            ],
                          },
                        ]}
                      >
                        <View style={styles.floater}>
                          <Text style={[styles.floaterText, { fontSize: f.size }]}>{f.e}</Text>
                        </View>
                      </Animated.View>
                    );})}
                  </Animated.View>}
                  <Animated.View style={[styles.heroCenter, { transform: [{ scale: breatheScale }] }]}>
                    <Text style={[styles.heroEmoji, item.key === 'shop' && styles.heroEmojiRight]}>
                      {item.emoji}
                    </Text>
                  </Animated.View>
                </Animated.View>

                <Animated.View style={[styles.textBlock, { opacity: fadeIn }]}>
                  <Text style={styles.slideTitle}>{item.title}</Text>
                  <Text style={styles.slideSub}>{item.sub}</Text>
                </Animated.View>
              </View>
            );
          }}
          style={{ flexGrow: 0 }}
        />

        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({ inputRange, outputRange: [6, 22, 6], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
            return (
              <Animated.View key={i} style={[styles.dot, { width: dotWidth, opacity }]} />
            );
          })}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBtnRow}>
            <ScalePressable style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>
                {page === SLIDES.length - 1 ? 'Get Started' : 'Next'}
              </Text>
            </ScalePressable>
            {page < SLIDES.length - 1 && (
              <ScalePressable
                profile="chip"
                style={styles.skipBtn}
                onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } })}
              >
                <Text style={styles.skipBtnText}>Skip</Text>
              </ScalePressable>
            )}
          </View>

          <ScalePressable
            testID="auth-welcome-sign-in"
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/sign-in')}
            profile="chip"
          >
            <Text style={styles.secondaryBtnText}>Already have an account? <Text style={styles.signInLink}>Sign in</Text></Text>
          </ScalePressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: B.bg,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 16,
  },
  cartIcon: {
    fontSize: 22,
  },
  brandName: {
    fontSize: 26,
    fontFamily: fonts.displayExtraBold,
    color: B.ink,
    letterSpacing: 0,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 22,
  },
  heroCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: B.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: B.border,
    boxShadow: '0 12px 30px rgba(34, 26, 18, 0.10)',
  },
  glowRing: {
    position: 'absolute',
    width: 268,
    height: 268,
    borderRadius: 134,
    top: '50%',
    left: '50%',
    marginTop: -134,
    marginLeft: -134,
    borderWidth: 6,
  },
  glowDot: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 63,
    top: '50%',
    left: '50%',
    marginTop: -63,
    marginLeft: -63,
  },
  orbit: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 1,
    height: 1,
  },
  receiptLayer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 2,
  },
  intakeLayer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 2,
  },
  intakeChip: {
    position: 'absolute',
    width: 42,
    height: 42,
    marginLeft: -21,
    marginTop: -21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,251,245,0.88)',
    borderWidth: 1,
    borderColor: B.border,
  },
  intakeEmoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  trackZones: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 1,
  },
  trackZone: {
    position: 'absolute',
    width: 58,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(245,232,213,0.72)',
    borderWidth: 1,
    borderColor: B.border,
  },
  trackZoneFridge: {
    transform: [{ translateX: -88 }, { translateY: -72 }],
  },
  trackZoneFreezer: {
    transform: [{ translateX: 88 }, { translateY: -72 }],
  },
  trackZonePantry: {
    transform: [{ translateX: 0 }, { translateY: 86 }],
  },
  trackZoneEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  receiptSlip: {
    position: 'absolute',
    width: 48,
    height: 62,
    marginLeft: -24,
    marginTop: -31,
    borderRadius: 8,
    backgroundColor: 'rgba(255,251,245,0.92)',
    borderWidth: 1,
    borderColor: B.border,
    padding: 8,
    gap: 6,
  },
  receiptLineLong: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: B.border,
  },
  receiptLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: B.border,
  },
  receiptTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  receiptTotal: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: B.primary,
  },
  receiptDollar: {
    fontSize: 13,
    lineHeight: 14,
    color: B.primary,
    fontFamily: fonts.monoMedium,
  },
  financeChip: {
    position: 'absolute',
    width: 42,
    height: 42,
    marginLeft: -21,
    marginTop: -21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(255,251,245,0.9)',
    borderWidth: 1,
    borderColor: B.border,
  },
  financeEmoji: {
    fontSize: 23,
    lineHeight: 29,
  },
  orbitItem: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  floater: {
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,251,245,0.68)',
    borderWidth: 1,
    borderColor: B.border,
  },
  floaterText: {
    lineHeight: 28,
  },
  heroCenter: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: B.cardDeep,
    borderWidth: 1,
    borderColor: B.border,
    zIndex: 4,
  },
  heroEmoji: {
    fontSize: 78,
    lineHeight: 90,
    zIndex: 2,
  },
  heroEmojiRight: {
    transform: [{ scaleX: -1 }],
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 10,
  },
  slideTitle: {
    fontSize: 32,
    fontFamily: fonts.displayExtraBold,
    color: B.ink,
    textAlign: 'center',
    lineHeight: 39,
    letterSpacing: 0,
  },
  slideSub: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: B.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: B.primary,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 10,
  },
  footerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: B.primary,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  skipBtn: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderRadius: 16,
    backgroundColor: 'rgba(192,112,56,0.12)',
  },
  skipBtnText: {
    color: B.primary,
    fontSize: 15,
    fontFamily: fonts.bodySemiBold,
  },
  primaryBtnText: {
    color: B.onPrimary,
    fontSize: 17,
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: B.muted,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  signInLink: {
    color: B.primary,
    fontFamily: fonts.bodySemiBold,
  },
});
