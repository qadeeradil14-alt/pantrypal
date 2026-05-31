import { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  FlatList, Animated, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

// ── Brand palette – always dark for the welcome screen ─────────────────────
const B = {
  bg:        '#1C1812',
  card:      '#271F19',
  cardDeep:  '#1E1510',
  primary:   '#D4874E',
  ink:       '#F0E8DC',
  muted:     '#9E8770',
  border:    '#3A2E24',
  onPrimary: '#1C1812',
};

// ── Slide data ──────────────────────────────────────────────────────────────
const SLIDES = [
  {
    key:      'track',
    emoji:    '🧺',
    accent:   'rgba(212,135,78,0.22)',
    ring:     'rgba(212,135,78,0.10)',
    floaters: [
      { e: '🥦', top: '12%',  left:  '8%',  size: 28, op: 0.55 },
      { e: '🥩', top: '15%',  right: '10%', size: 26, op: 0.50 },
      { e: '🥛', top: '62%',  left:  '12%', size: 24, op: 0.45 },
      { e: '🧀', top: '58%',  right: '8%',  size: 26, op: 0.50 },
      { e: '🍳', top: '30%',  left:  '6%',  size: 20, op: 0.35 },
      { e: '🫙', top: '40%',  right: '6%',  size: 20, op: 0.35 },
    ],
    title: 'Know what\nyou have',
    sub:   'Track your fridge, freezer, and pantry — shared live with everyone at home.',
  },
  {
    key:      'shop',
    emoji:    '🛒',
    accent:   'rgba(80,160,100,0.20)',
    ring:     'rgba(80,160,100,0.10)',
    floaters: [
      { e: '🍎', top: '10%',  left:  '10%', size: 28, op: 0.55 },
      { e: '🥕', top: '14%',  right: '8%',  size: 26, op: 0.50 },
      { e: '🥚', top: '60%',  left:  '8%',  size: 26, op: 0.45 },
      { e: '🍌', top: '62%',  right: '10%', size: 24, op: 0.50 },
      { e: '🧅', top: '32%',  left:  '4%',  size: 20, op: 0.35 },
      { e: '🫘', top: '38%',  right: '5%',  size: 20, op: 0.35 },
    ],
    title: 'Shop smarter,\ntogether',
    sub:   'Mark items low and they auto-appear on your grocery list. Check them off in-store.',
  },
  {
    key:      'spend',
    emoji:    '🧾',
    accent:   'rgba(100,140,220,0.18)',
    ring:     'rgba(100,140,220,0.09)',
    floaters: [
      { e: '🏪', top: '10%',  left:  '9%',  size: 28, op: 0.50 },
      { e: '📊', top: '13%',  right: '9%',  size: 26, op: 0.45 },
      { e: '💳', top: '60%',  left:  '10%', size: 24, op: 0.45 },
      { e: '🏷️', top: '58%',  right: '8%',  size: 26, op: 0.45 },
      { e: '🛍️', top: '30%',  left:  '5%',  size: 22, op: 0.35 },
      { e: '📦', top: '38%',  right: '5%',  size: 20, op: 0.35 },
    ],
    title: 'See where\nyour money goes',
    sub:   'Scan receipts to track spending by store and spot patterns over time.',
  },
];

// ── Component ───────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const router  = useRouter();
  const [page, setPage] = useState(0);
  const scrollX  = useRef(new Animated.Value(0)).current;
  const fadeIn   = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const flatRef  = useRef<FlatList>(null);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,   { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(heroAnim, { toValue: 1, damping: 18, stiffness: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  function goNext() {
    if (page < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } });
    }
  }

  const heroHeight = height * 0.44;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* ── Brand header ───────────────────────────────────── */}
        <Animated.View style={[styles.header, { opacity: fadeIn }]}>
          <Text style={styles.cartIcon}>🛒</Text>
          <Text style={styles.brandName}>Stokit</Text>
        </Animated.View>

        {/* ── Pager ──────────────────────────────────────────── */}
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
            // Parallax offset for floaters
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const floaterX = scrollX.interpolate({
              inputRange,
              outputRange: [-24, 0, 24],
              extrapolate: 'clamp',
            });

            return (
              <View style={[styles.slide, { width }]}>
                {/* Hero illustration card */}
                <Animated.View
                  style={[
                    styles.heroCard,
                    { height: heroHeight },
                    {
                      opacity:   fadeIn,
                      transform: [{ scale: heroAnim.interpolate({ inputRange: [0,1], outputRange: [0.88, 1] }) }],
                    },
                  ]}
                >
                  {/* Accent glow ring */}
                  <View style={[styles.glowRing, { backgroundColor: item.ring }]} />
                  <View style={[styles.glowDot,  { backgroundColor: item.accent }]} />

                  {/* Floating background emojis */}
                  {item.floaters.map((f: { e: string; top: string; left?: string; right?: string; size: number; op: number }, fi: number) => (
                    <Animated.View
                      key={fi}
                      style={[
                        styles.floater,
                        {
                          top:     f.top  as `${number}%`,
                          left:    f.left  as `${number}%` | undefined,
                          right:   f.right as `${number}%` | undefined,
                          opacity:   f.op,
                          transform: [{ translateX: floaterX }],
                        },
                      ]}
                    >
                      <Text style={{ fontSize: f.size }}>{f.e}</Text>
                    </Animated.View>
                  ))}

                  {/* Main emoji */}
                  <Text style={styles.heroEmoji}>{item.emoji}</Text>
                </Animated.View>

                {/* Text block */}
                <Animated.View style={[styles.textBlock, { opacity: fadeIn }]}>
                  <Text style={styles.slideTitle}>{item.title}</Text>
                  <Text style={styles.slideSub}>{item.sub}</Text>
                </Animated.View>
              </View>
            );
          }}
          style={{ flexGrow: 0 }}
        />

        {/* ── Dots ───────────────────────────────────────────── */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({ inputRange, outputRange: [6, 22, 6], extrapolate: 'clamp' });
            const opacity  = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
            return (
              <Animated.View key={i} style={[styles.dot, { width: dotWidth, opacity }]} />
            );
          })}
        </View>

        {/* ── Footer CTAs ────────────────────────────────────── */}
        <View style={styles.footer}>
          <ScalePressable style={styles.primaryBtn} onPress={goNext}>
            <Text style={styles.primaryBtnText}>
              {page === SLIDES.length - 1 ? 'Get Started' : 'Next →'}
            </Text>
          </ScalePressable>

          <ScalePressable
            testID="auth-welcome-sign-in"
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/sign-in')}
            profile="chip"
          >
            <Text style={styles.secondaryBtnText}>Already have an account?  <Text style={styles.signInLink}>Sign in</Text></Text>
          </ScalePressable>
        </View>

      </SafeAreaView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: B.bg,
  },
  safe: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingTop:     6,
    paddingBottom:  12,
  },
  cartIcon: {
    fontSize: 22,
  },
  brandName: {
    fontSize:    26,
    fontFamily:  fonts.displayExtraBold,
    color:       B.ink,
    letterSpacing: 0,
  },

  // Slide
  slide: {
    alignItems:     'center',
    paddingHorizontal: 20,
    gap:            20,
  },

  // Hero card
  heroCard: {
    width:          '100%',
    borderRadius:   28,
    backgroundColor: B.card,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
    borderWidth:    1,
    borderColor:    B.border,
  },
  glowRing: {
    position:     'absolute',
    width:        320,
    height:       320,
    borderRadius: 160,
    top:          '50%',
    left:         '50%',
    marginTop:    -160,
    marginLeft:   -160,
  },
  glowDot: {
    position:     'absolute',
    width:        160,
    height:       160,
    borderRadius: 80,
    top:          '50%',
    left:         '50%',
    marginTop:    -80,
    marginLeft:   -80,
  },
  floater: {
    position: 'absolute',
  },
  heroEmoji: {
    fontSize:   96,
    lineHeight: 110,
    zIndex:     2,
  },

  // Text
  textBlock: {
    alignItems:     'center',
    paddingHorizontal: 8,
    gap:            10,
  },
  slideTitle: {
    fontSize:    34,
    fontFamily:  fonts.displayExtraBold,
    color:       B.ink,
    textAlign:   'center',
    lineHeight:  42,
    letterSpacing: -0.3,
  },
  slideSub: {
    fontSize:   15,
    fontFamily: fonts.body,
    color:      B.muted,
    textAlign:  'center',
    lineHeight: 22,
  },

  // Dots
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            6,
    paddingVertical: 16,
  },
  dot: {
    height:       6,
    borderRadius: 3,
    backgroundColor: B.primary,
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingBottom:     8,
    gap:               10,
  },
  primaryBtn: {
    backgroundColor: B.primary,
    borderRadius:    16,
    paddingVertical: 17,
    alignItems:      'center',
  },
  primaryBtnText: {
    color:      B.onPrimary,
    fontSize:   17,
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems:      'center',
  },
  secondaryBtnText: {
    color:      B.muted,
    fontSize:   14,
    fontFamily: fonts.bodyMedium,
  },
  signInLink: {
    color:      B.primary,
    fontFamily: fonts.bodySemiBold,
  },
});
