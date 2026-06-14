import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { fonts, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/auth-store';
import { Logo } from '../../components/shared/Logo';
const { width: SCREEN_W } = Dimensions.get('window');
const S = SCREEN_W / 1080;
const u = (value: number) => value * S;
const DEG = Math.PI / 180;
const DRIFT_DPS = 12;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

const heartbeat = (t: number) => {
  const x = (((t % 1.5) + 1.5) % 1.5) / 1.5;
  const pulse = (center: number, width: number) =>
    Math.exp(-((x - center) * (x - center)) / (2 * width * width));
  return pulse(0.1, 0.034) + 0.62 * pulse(0.27, 0.04);
};

type Phase = 'emerge' | 'orbit' | 'suck' | 'beat';
type Chip = { emoji: string; radius: number; size: number; angle: number };
type Scene = {
  hubRadius: number;
  center: 'home' | 'cart' | 'receipt';
  centerSize: number;
  rings: number[];
  chips: Chip[];
};

const ring = (emojis: string[], radius: number, size: number): Chip[] =>
  emojis.map((emoji, index) => ({
    emoji,
    radius,
    size,
    angle: -90 + (360 / emojis.length) * index,
  }));

const SCENES: Scene[] = [
  {
    hubRadius: 178,
    center: 'home',
    centerSize: 144,
    rings: [314, 420],
    chips: ring(['🏪', '🥫', '🥑', '🧾', '🥚', '🧂', '🥕', '🥛', '🍞', '🧀', '🍅', '🫑'], 314, 114),
  },
  {
    hubRadius: 196,
    center: 'cart',
    centerSize: 196,
    rings: [420],
    chips: ring(['🥕', '🫑', '🥚', '🍌', '🍞', '🥦', '🍅', '🧅', '🥛', '🍎', '🥬'], 322, 114),
  },
  {
    hubRadius: 196,
    center: 'receipt',
    centerSize: 1,
    rings: [420],
    chips: ring(['🧾', '💵', '💳', '📈', '📊', '💰', '🪙', '🏷️', '🧮', '🛒', '💲'], 322, 114),
  },
];

const COPY = [
  {
    title: ['Your kitchen,', 'always in order'],
    subtitle: 'Shop, stock your pantry, and track receipts — everything managed from one home.',
  },
  {
    title: ['Shop smarter,', 'together'],
    subtitle: 'Mark items low and they appear on your grocery list. Check them off in-store.',
  },
  {
    title: ['Receipts into', 'real numbers'],
    subtitle: 'Save receipts, watch the weekly budget, and spot where grocery money goes.',
  },
];

const PHASE_DURATION: Record<Phase, number> = { emerge: 1.0, orbit: 2.7, suck: 1.2, beat: 0.55 };

function useOrbitCycle(active: boolean) {
  const state = useRef({ phase: 'emerge' as Phase, phaseStarted: 0, started: 0, frozenDrift: 0 });
  const [, tick] = useState(0);

  useEffect(() => {
    if (active) {
      const now = Date.now();
      state.current = { phase: 'emerge', phaseStarted: now, started: now, frozenDrift: 0 };
    }
  }, [active]);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    const loop = () => {
      if (!alive) return;
      if (active) {
        const now = Date.now();
        const current = state.current;
        const elapsed = (now - current.phaseStarted) / 1000;
        if (elapsed >= PHASE_DURATION[current.phase]) {
          if (current.phase === 'emerge') current.phase = 'orbit';
          else if (current.phase === 'orbit') {
            current.phase = 'suck';
            current.frozenDrift = ((now - current.started) / 1000) * DRIFT_DPS;
          } else if (current.phase === 'suck') current.phase = 'beat';
          else current.phase = 'emerge';
          current.phaseStarted = now;
        }
        tick((value) => (value + 1) % 100000);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [active]);

  const trigger = useCallback(() => {
    const current = state.current;
    if (current.phase !== 'suck') {
      current.frozenDrift = ((Date.now() - current.started) / 1000) * DRIFT_DPS;
      current.phase = 'suck';
      current.phaseStarted = Date.now();
    }
  }, []);

  const now = Date.now();
  return {
    phase: state.current.phase,
    phaseTime: (now - state.current.phaseStarted) / 1000,
    globalTime: (now - state.current.started) / 1000,
    frozenDrift: state.current.frozenDrift,
    trigger,
  };
}

function ReceiptGraphic() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.receipt}>
      <Text style={styles.receiptTitle}>RECEIPT</Text>
      <Text style={styles.receiptDate}>TODAY</Text>
      {['PANTRY', 'GROCERIES', 'HOUSEHOLD'].map((label) => (
        <View key={label} style={styles.receiptLine}>
          <Text style={styles.receiptText}>{label}</Text>
          <View style={styles.receiptDots} />
          <Text style={styles.receiptText}>0.00</Text>
        </View>
      ))}
    </View>
  );
}

function Orbit({
  scene,
  phase,
  phaseTime,
  globalTime,
  frozenDrift,
}: {
  scene: Scene;
  phase: Phase;
  phaseTime: number;
  globalTime: number;
  frozenDrift: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const width = 968;
  const center = width / 2;
  const hubScale = 1 + heartbeat(globalTime) * 0.05;
  const drift = phase === 'suck' || phase === 'beat' ? frozenDrift : globalTime * DRIFT_DPS;

  return (
    <View style={{ width: u(width), height: u(width) }}>
      {scene.rings.map((radius) => (
        <View
          key={radius}
          style={[
            styles.ring,
            {
              left: u(center - radius),
              top: u(center - radius),
              width: u(radius * 2),
              height: u(radius * 2),
              borderRadius: u(radius),
            },
          ]}
        />
      ))}
      <View
        style={[
          styles.hub,
          {
            left: u(center - scene.hubRadius),
            top: u(center - scene.hubRadius),
            width: u(scene.hubRadius * 2),
            height: u(scene.hubRadius * 2),
            borderRadius: u(scene.hubRadius),
            transform: [{ scale: hubScale }],
          },
        ]}
      >
        {scene.center === 'receipt' ? (
          <ReceiptGraphic />
        ) : (
          <Text style={{ fontSize: u(scene.centerSize), transform: scene.center === 'cart' ? [{ scaleX: -1 }] : [] }}>
            {scene.center === 'home' ? '🏠' : '🛒'}
          </Text>
        )}
      </View>
      {scene.chips.map((chip, index) => {
        const envelope =
          phase === 'emerge'
            ? easeOutCubic(clamp((phaseTime - (index / scene.chips.length) * 0.26) / 0.6))
            : phase === 'orbit'
              ? 1
              : phase === 'suck'
                ? 1 - easeInCubic(clamp((phaseTime - (index / scene.chips.length) * 0.26) / 0.78))
                : 0;
        const radius = (chip.radius + Math.sin(globalTime * 0.8 + index * 1.7) * 7) * envelope;
        const angle = (chip.angle + drift) * DEG;
        return (
          <View
            key={`${chip.emoji}-${index}`}
            style={[
              styles.chip,
              {
                left: u(center),
                top: u(center),
                width: u(chip.size),
                height: u(chip.size),
                borderRadius: u(chip.size / 2),
                marginLeft: -u(chip.size) / 2,
                marginTop: -u(chip.size) / 2,
                opacity: phase === 'suck' ? clamp(envelope / 0.45) : envelope,
                transform: [
                  { translateX: u(radius * Math.cos(angle)) },
                  { translateY: u(radius * Math.sin(angle)) },
                  { scale: lerp(0.12, 1, envelope) },
                ],
              },
            ]}
          >
            <Text style={{ fontSize: u(chip.size * 0.5) }}>{chip.emoji}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Panel({
  index,
  active,
  registerTrigger,
}: {
  index: number;
  active: boolean;
  registerTrigger: (trigger: () => void) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const cycle = useOrbitCycle(active);
  useEffect(() => {
    if (active) registerTrigger(cycle.trigger);
  }, [active, cycle.trigger, registerTrigger]);
  return (
    <View style={{ width: SCREEN_W }}>
      <View style={styles.orbitFrame}>
        <Orbit scene={SCENES[index]} {...cycle} />
      </View>
      <Text style={styles.headline}>{COPY[index].title.join('\n')}</Text>
      <Text style={styles.subtitle}>{COPY[index].subtitle}</Text>
    </View>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = u(170);
  const stroke = u(6);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <Svg width={size} height={size} style={styles.progressRing}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.primarySoft} strokeWidth={stroke} fill="transparent" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.primary}
        strokeWidth={stroke}
        fill="transparent"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - progress)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const enterGuestMode = useAuthStore((s) => s.enterGuestMode);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const triggerRef = useRef<() => void>(() => {});
  const navigationLocked = useRef(false);
  const slideX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  indexRef.current = index;
  const last = index === SCENES.length - 1;

  const goSignUp = useCallback(() => {
    try {
      router.push('/sign-up');
    } catch (err: any) {
      // ignore
    }
  }, [router]);
  const advance = useCallback(() => {
    if (indexRef.current >= SCENES.length - 1) {
      Animated.timing(opacity, { toValue: 0, duration: 550, useNativeDriver: true }).start(goSignUp);
      return;
    }
    const nextIndex = indexRef.current + 1;
    setIndex(nextIndex);
    Animated.timing(slideX, {
      toValue: -nextIndex * SCREEN_W,
      duration: 520,
      useNativeDriver: true,
    }).start();
  }, [goSignUp, opacity, slideX]);

  const next = () => {
    if (navigationLocked.current) return;
    navigationLocked.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (indexRef.current >= SCENES.length - 1) {
      advance();
      navigationLocked.current = false;
      return;
    }

    triggerRef.current();
    setTimeout(() => {
      advance();
      navigationLocked.current = false;
    }, 150);
  };

  const skip = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    indexRef.current = SCENES.length - 1;
    advance();
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.safe, { opacity }]}>
          <View style={styles.wordmark}>
            <Logo size={u(110)} color={colors.ink} accent={colors.primary} />
            <Text style={styles.brand}>Stokit</Text>
          </View>
          <View style={styles.carousel}>
            <Animated.View style={{ flexDirection: 'row', width: SCREEN_W * SCENES.length, transform: [{ translateX: slideX }] }}>
              {SCENES.map((_, sceneIndex) => (
                <Panel
                  key={sceneIndex}
                  index={sceneIndex}
                  active={sceneIndex === index}
                  registerTrigger={(trigger) => { triggerRef.current = trigger; }}
                />
              ))}
            </Animated.View>
          </View>
          <View style={styles.dots}>
            {SCENES.map((_, dotIndex) => (
              <View key={dotIndex} style={[styles.dot, dotIndex === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
          {last ? (
            <Pressable
              onPress={next}
              style={({ pressed }) => [styles.getStarted, pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] }]}
            >
              <Text style={styles.getStartedText}>Get Started  →</Text>
            </Pressable>
          ) : (
            <View style={styles.navigation}>
              <Pressable
                onPress={skip}
                hitSlop={20}
                style={({ pressed }) => pressed && { opacity: 0.5 }}
              >
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
              <View style={styles.nextWrap}>
                <ProgressRing progress={(index + 1) / SCENES.length} />
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    next();
                  }}
                  hitSlop={24}
                  style={({ pressed }) => [
                    styles.nextButton,
                    pressed && { opacity: 0.82, transform: [{ scale: 0.92 }] },
                  ]}
                >
                  <Text style={styles.nextArrow}>→</Text>
                </Pressable>
              </View>
            </View>
          )}
          <Text style={styles.signInRow}>
            Already have an account?{'  '}
            <Text onPress={() => {
              try {
                router.push('/sign-in');
              } catch (err: any) {
                // ignore
              }
            }} style={styles.signInLink}>Sign in</Text>
          </Text>
        </Animated.View>
      </SafeAreaView>
      <Text style={{ position: 'absolute', top: 50, right: 15, fontSize: 10, color: colors.faintText, fontFamily: fonts.sans, zIndex: 10 }}>v1.0.0 (OTA 87)</Text>
    </View>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    safe: { flex: 1 },
    wordmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(18), marginTop: u(20) },
    brand: { fontFamily: fonts.serifItalic, fontSize: u(120), color: colors.ink },
    brandIcon: { fontSize: u(56) },
    carousel: { marginTop: u(48), height: u(1448), overflow: 'hidden' },
    orbitFrame: { marginHorizontal: u(56), height: u(968), width: u(968), overflow: 'visible' },
    ring: { position: 'absolute', borderWidth: u(2), borderColor: 'rgba(150,112,74,0.16)' },
    hub: { position: 'absolute', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: u(28), shadowOffset: { width: 0, height: u(18) } },
    chip: { position: 'absolute', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: u(18), shadowOffset: { width: 0, height: u(10) } },
    headline: { marginTop: u(76), textAlign: 'center', fontFamily: fonts.serifItalic, fontSize: u(91), lineHeight: u(104), color: colors.ink },
    subtitle: { marginTop: u(28), marginHorizontal: u(96), textAlign: 'center', fontFamily: fonts.sansMedium, fontSize: u(41), lineHeight: u(54), color: colors.muted },
    receipt: { width: u(248), backgroundColor: colors.surface, borderRadius: u(8), padding: u(26), paddingBottom: u(34) },
    receiptTitle: { textAlign: 'center', fontFamily: fonts.serif, fontSize: u(30), color: colors.ink, borderBottomWidth: u(2), borderColor: colors.ink, paddingBottom: u(8) },
    receiptDate: { textAlign: 'center', fontSize: u(17), color: colors.inkSoft, marginTop: u(12), marginBottom: u(18) },
    receiptLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: u(12) },
    receiptText: { fontSize: u(16), color: colors.inkSoft },
    receiptDots: { flex: 1, borderBottomWidth: u(2), borderColor: colors.border, borderStyle: 'dotted', marginHorizontal: u(6), marginBottom: u(4) },
    dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: u(16), marginTop: u(28) },
    dot: { height: u(18), borderRadius: u(9) },
    dotActive: { width: u(64), backgroundColor: colors.primary },
    dotInactive: { width: u(18), backgroundColor: colors.border },
    navigation: { marginTop: u(38), marginHorizontal: u(76), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    skip: { fontFamily: fonts.sansSemibold, fontSize: u(44), color: colors.muted },
    nextWrap: { width: u(170), height: u(170), alignItems: 'center', justifyContent: 'center' },
    progressRing: { position: 'absolute' },
    nextButton: { width: u(150), height: u(150), borderRadius: u(75), backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: u(20), shadowOffset: { width: 0, height: u(12) } },
    nextArrow: { fontSize: u(60), lineHeight: u(64), color: colors.background },
    getStarted: { height: u(150), marginTop: u(48), marginHorizontal: u(64), borderRadius: u(75), backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: u(24), shadowOffset: { width: 0, height: u(14) } },
    getStartedText: { fontFamily: fonts.sansSemibold, fontSize: u(46), color: colors.background },
    signInRow: { textAlign: 'center', marginTop: u(36), fontFamily: fonts.sansSemibold, fontSize: u(39), color: colors.muted },
    signInLink: { color: colors.primary },
    guestBtn: { alignSelf: 'center', marginTop: u(20), paddingVertical: u(16), paddingHorizontal: u(40) },
    guestBtnText: { fontFamily: fonts.sans, fontSize: u(34), color: colors.faintText, textDecorationLine: 'underline' },
  });
}
