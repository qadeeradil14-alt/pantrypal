/**
 * Stokit — Animated Onboarding
 * Source: design_handoff_onboarding_flow 2/welcome.tsx (Claude Design v2)
 * Wired: fonts → our expo-font families, nav → expo-router, SafeAreaView added.
 * Animation: pure requestAnimationFrame + React state — no Reanimated needed.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Dimensions, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { fonts } from '../../constants/theme';

// ── tokens ────────────────────────────────────────────────────────────────────
const C = {
  cream: '#F3EEE3', card: '#FCFAF3',
  ink: '#1C1714', body: '#2A2420', muted: '#9B948A', subtitle: '#9B8B78',
  faint: '#A99E8E', terra: '#C2692F', onTerra: '#2C1C10',
};

const FONT_SERIF = fonts.welcomeDisplay;
const FONT_BRAND = fonts.welcomeBrand;
const FONT_SANS  = fonts.bodySemiBold;

const { width: SCREEN_W } = Dimensions.get('window');
const S = SCREEN_W / 1080;
const u = (n: number) => n * S;

// ── easing ────────────────────────────────────────────────────────────────────
const clamp       = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp        = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic  = (t: number) => t * t * t;
const DEG = Math.PI / 180;
const DRIFT_DPS = 12;

// Heartbeat pulse on hub center
const heartbeat = (t: number) => {
  const period = 1.5;
  const x = (((t % period) + period) % period) / period;
  const g = (c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  return g(0.10, 0.034) + 0.62 * g(0.27, 0.04);
};

// ── scene configs ─────────────────────────────────────────────────────────────
type Chip  = { emoji: string; r: number; size: number; angle: number };
type Phase = 'emerge' | 'orbit' | 'suck' | 'beat';

const ring = (emojis: string[], r: number, size: number, start = -90): Chip[] =>
  emojis.map((emoji, i) => ({ emoji, r, size, angle: start + (360 / emojis.length) * i }));

type Scene = {
  hubR: number; hubColors: [string, string]; center: 'home' | 'cart' | 'receipt';
  centerSize: number; rings: { r: number; opacity: number }[]; chips: Chip[];
};
const SCENES: Scene[] = [
  {
    hubR: 178, hubColors: ['#FBF6EC', '#F0E7D7'], center: 'home', centerSize: 144,
    rings: [{ r: 314, opacity: 0.9 }, { r: 420, opacity: 0.55 }],
    chips: ring(['🏪','🥫','🥑','🧾','🥚','🧂','🥕','🥛','🍞','🧀','🍅','🫑'], 314, 114),
  },
  {
    hubR: 196, hubColors: ['#F0E2CC', '#E7D6BC'], center: 'cart', centerSize: 196,
    rings: [{ r: 420, opacity: 0.7 }],
    chips: ring(['🥕','🫑','🥚','🍌','🍞','🥦','🍅','🧅','🥛','🍎','🥬'], 322, 114),
  },
  {
    hubR: 196, hubColors: ['#F0E2CC', '#E7D6BC'], center: 'receipt', centerSize: 1,
    rings: [{ r: 420, opacity: 0.7 }],
    chips: ring(['🧾','💵','💳','📈','📊','💰','🪙','🏷️','🧮','🛒','💲'], 322, 114),
  },
];

const COPY = [
  { title: ['Your kitchen,','always in order'], sub: 'Shop, stock your pantry, and track receipts — everything managed from one home.' },
  { title: ['Shop smarter,','together'],        sub: 'Mark items low and they appear on your grocery list. Check them off in-store.' },
  { title: ['Receipts into','real numbers'],    sub: 'Save receipts, watch the weekly budget, and spot where grocery money goes.' },
];

// ── orbit phase machine ───────────────────────────────────────────────────────
const PHASE_DUR: Record<Phase, number> = { emerge: 1.0, orbit: 2.7, suck: 1.2, beat: 0.55 };

function useOrbitCycle(active: boolean) {
  const st = useRef({ phase: 'emerge' as Phase, pStart: 0, t0: 0, driftFrozen: 0 });
  const [, tick] = useState(0);

  useEffect(() => {
    if (active) {
      const now = Date.now();
      st.current = { phase: 'emerge', pStart: now, t0: now, driftFrozen: 0 };
    }
  }, [active]);

  useEffect(() => {
    let alive = true, raf = 0;
    const loop = () => {
      if (!alive) return;
      if (active) {
        const now = Date.now(); const sc = st.current;
        const p = (now - sc.pStart) / 1000;
        if (p >= PHASE_DUR[sc.phase]) {
          if      (sc.phase === 'emerge') sc.phase = 'orbit';
          else if (sc.phase === 'orbit')  { sc.phase = 'suck'; sc.driftFrozen = ((now - sc.t0) / 1000) * DRIFT_DPS; }
          else if (sc.phase === 'suck')   sc.phase = 'beat';
          else                            sc.phase = 'emerge';
          sc.pStart = now;
        }
        tick(x => (x + 1) % 1e6);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [active]);

  const now = Date.now(); const sc = st.current;
  const trigger = useCallback(() => {
    const c = st.current;
    if (c.phase !== 'suck') {
      c.driftFrozen = ((Date.now() - c.t0) / 1000) * DRIFT_DPS;
      c.phase = 'suck';
      c.pStart = Date.now();
    }
  }, []);

  return { phase: sc.phase, p: (now - sc.pStart) / 1000, globalT: (now - sc.t0) / 1000, driftFrozen: sc.driftFrozen, trigger };
}

// ── per-chip transform ────────────────────────────────────────────────────────
function chipState(phase: Phase, p: number, globalT: number, cx: number, cy: number, R: number, baseDeg: number, i: number, n: number, driftFrozen: number) {
  const drift = (phase === 'suck' || phase === 'beat') ? driftFrozen : globalT * DRIFT_DPS;
  const ang   = (baseDeg + drift) * DEG;
  const base  = R + Math.sin(globalT * 0.8 + i * 1.7) * 7;
  let env: number;
  if      (phase === 'emerge') env = easeOutCubic(clamp((p - (i / n) * 0.26) / 0.6));
  else if (phase === 'orbit')  env = 1;
  else if (phase === 'suck')   env = 1 - easeInCubic(clamp((p - (i / n) * 0.26) / 0.78));
  else                         env = 0;
  const r       = base * env;
  const scale   = lerp(0.12, 1, env);
  const opacity = phase === 'emerge' ? clamp(env * 1.8)
                : phase === 'suck'   ? clamp(env / 0.45)
                : phase === 'orbit'  ? 1 : 0;
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), scale, opacity };
}

// ── center icons ──────────────────────────────────────────────────────────────
function ReceiptGraphic() {
  const Line = ({ label }: { label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: u(12) }}>
      <Text style={{ fontSize: u(16), color: C.body }}>{label}</Text>
      <View style={{ flex: 1, borderBottomWidth: u(2), borderColor: '#C9BBA6', borderStyle: 'dotted', marginHorizontal: u(6), marginBottom: u(4) }} />
      <Text style={{ fontSize: u(16), color: C.body }}>0.00</Text>
    </View>
  );
  return (
    <View style={{ width: u(248), backgroundColor: '#FCFAF6', borderRadius: u(8), padding: u(26), paddingBottom: u(34) }}>
      <Text style={{ textAlign: 'center', fontFamily: FONT_SERIF, fontWeight: '800', fontSize: u(30), color: C.ink, borderBottomWidth: u(2), borderColor: C.ink, paddingBottom: u(8) }}>RECEIPT</Text>
      <Text style={{ textAlign: 'center', fontSize: u(17), color: C.body, marginTop: u(12), marginBottom: u(18) }}>JUL 17</Text>
      <Line label="MISFITS" /><Line label="SQUARE HOLES" /><Line label="ROUND PEGS" />
    </View>
  );
}

function CenterIcon({ kind, size }: { kind: Scene['center']; size: number }) {
  if (kind === 'receipt') return <ReceiptGraphic />;
  const flip = kind === 'cart' ? [{ scaleX: -1 as number }] : [];
  return <Text style={{ fontSize: size, transform: flip }}>{kind === 'home' ? '🏠' : '🛒'}</Text>;
}

// ── Orbit ─────────────────────────────────────────────────────────────────────
function Orbit({ scene, phase, p, globalT, driftFrozen }: {
  scene: Scene; phase: Phase; p: number; globalT: number; driftFrozen: number;
}) {
  const W = 968, cx = W / 2, cy = W / 2, n = scene.chips.length;
  const hubScale   = 1 + heartbeat(globalT) * 0.05;
  const hubOpacity = clamp(globalT / 0.5);
  return (
    <View style={{ width: u(W), height: u(W) }}>
      {scene.rings.map((rg, i) => (
        <View key={i} pointerEvents="none" style={{
          position: 'absolute', left: u(cx - rg.r), top: u(cy - rg.r),
          width: u(rg.r * 2), height: u(rg.r * 2), borderRadius: u(rg.r),
          borderWidth: u(2), borderColor: 'rgba(150,112,74,0.16)',
          opacity: rg.opacity * hubOpacity,
        }} />
      ))}
      {/* hub */}
      <View style={{
        position: 'absolute', left: u(cx - scene.hubR), top: u(cy - scene.hubR),
        width: u(scene.hubR * 2), height: u(scene.hubR * 2), borderRadius: u(scene.hubR),
        backgroundColor: scene.hubColors[1], alignItems: 'center', justifyContent: 'center',
        opacity: hubOpacity, transform: [{ scale: hubScale }],
        shadowColor: '#784f28', shadowOpacity: 0.22, shadowRadius: u(28), shadowOffset: { width: 0, height: u(18) },
      }}>
        <CenterIcon kind={scene.center} size={u(scene.centerSize)} />
      </View>
      {/* chips */}
      {scene.chips.map((c, i) => {
        const s = chipState(phase, p, globalT, cx, cy, c.r, c.angle, i, n, driftFrozen);
        return (
          <View key={i} style={{
            position: 'absolute', left: u(cx), top: u(cy),
            marginLeft: -u(c.size) / 2, marginTop: -u(c.size) / 2,
            width: u(c.size), height: u(c.size), borderRadius: u(c.size) / 2,
            backgroundColor: '#FAF5EC', alignItems: 'center', justifyContent: 'center',
            opacity: s.opacity,
            transform: [{ translateX: u(s.x - cx) }, { translateY: u(s.y - cy) }, { scale: s.scale }],
            shadowColor: '#784f28', shadowOpacity: 0.22, shadowRadius: u(18), shadowOffset: { width: 0, height: u(10) },
          }}>
            <Text style={{ fontSize: u(c.size * 0.5) }}>{c.emoji}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ idx, active, registerTrigger }: {
  idx: number; active: boolean; registerTrigger: (fn: () => void) => void;
}) {
  const { phase, p, globalT, driftFrozen, trigger } = useOrbitCycle(active);
  useEffect(() => { if (active) registerTrigger(trigger); }, [active, trigger, registerTrigger]);
  const copy = COPY[idx];
  return (
    <View style={{ width: SCREEN_W }}>
      <View style={{ marginHorizontal: u(56), overflow: 'visible', height: u(968), width: u(968) }}>
        <Orbit scene={SCENES[idx]} phase={phase} p={p} globalT={globalT} driftFrozen={driftFrozen} />
      </View>
      <Text style={{ marginTop: u(76), textAlign: 'center', fontFamily: FONT_SERIF, fontSize: u(91), lineHeight: u(104), color: C.ink }}>
        {copy.title[0]}{'\n'}{copy.title[1]}
      </Text>
      <Text style={{ marginTop: u(28), marginHorizontal: u(96), textAlign: 'center', fontFamily: FONT_SANS, fontWeight: '500', fontSize: u(41), lineHeight: u(54), color: C.subtitle }}>
        {copy.sub}
      </Text>
    </View>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const size = u(170);
  const stroke = u(6);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Svg width={size} height={size} style={styles.progressRing}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(194,105,47,0.18)"
        strokeWidth={stroke}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={C.terra}
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

// ── root ──────────────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last        = index === SCENES.length - 1;
  const triggerRef  = useRef<() => void>(() => {});
  const indexRef    = useRef(0); indexRef.current = index;
  const navLock     = useRef(false);

  const slideX      = useRef(new Animated.Value(0)).current;
  const onbOpacity  = useRef(new Animated.Value(1)).current;

  const goSignUp = useCallback(() =>
    router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } }), [router]);
  const goSignIn = useCallback(() =>
    router.push('/(auth)/sign-in'), [router]);

  const advance = useCallback(() => {
    if (indexRef.current >= SCENES.length - 1) {
      Animated.timing(onbOpacity, { toValue: 0, duration: 550, useNativeDriver: true })
        .start(() => goSignUp());
    } else {
      const ni = indexRef.current + 1;
      setIndex(ni);
      Animated.timing(slideX, { toValue: -ni * SCREEN_W, duration: 520, useNativeDriver: true }).start();
    }
  }, [goSignUp, onbOpacity, slideX]);

  const next = () => {
    if (navLock.current) return;
    navLock.current = true;
    triggerRef.current();
    setTimeout(() => { advance(); navLock.current = false; }, 1100);
  };
  const skip = useCallback(() => { indexRef.current = SCENES.length - 1; advance(); }, [advance]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.safe, { opacity: onbOpacity }]}>

          {/* wordmark */}
          <View style={styles.wordmark}>
            <Text style={[styles.brandName, { fontFamily: FONT_BRAND }]}>Stokit</Text>
            <Text style={styles.brandIcon}>🛒</Text>
          </View>

          {/* carousel */}
          <View style={{ marginTop: u(48), height: u(1448), overflow: 'hidden' }}>
            <Animated.View style={{ flexDirection: 'row', width: SCREEN_W * SCENES.length, transform: [{ translateX: slideX }] }}>
              {SCENES.map((_, i) => (
                <Panel key={i} idx={i} active={i === index} registerTrigger={fn => { triggerRef.current = fn; }} />
              ))}
            </Animated.View>
          </View>

          {/* dots */}
          <View style={styles.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>

          {/* buttons */}
          {last ? (
            <View style={styles.lastBtnWrap}>
              <Pressable onPress={next} style={styles.getStartedBtn}>
                <Text style={[styles.getStartedText, { fontFamily: FONT_SANS }]}>Get Started</Text>
                <Text style={styles.getStartedArrow}>→</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.navBtnRow}>
              <Pressable onPress={skip} hitSlop={20}>
                <Text style={[styles.skipText, { fontFamily: FONT_SANS }]}>Skip</Text>
              </Pressable>
              <View style={styles.nextWrap}>
                <ProgressRing progress={(index + 1) / SCENES.length} />
                <Pressable onPress={next} style={styles.nextCircle}>
                  <Text style={styles.nextArrow}>→</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* sign in */}
          <Text style={[styles.signInRow, { fontFamily: FONT_SANS }]}>
            Already have an account?{'  '}
            <Text testID="auth-welcome-sign-in" onPress={goSignIn} style={styles.signInLink}>Sign in</Text>
          </Text>

        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.cream },
  safe:           { flex: 1 },
  wordmark:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(18), marginTop: u(20), paddingBottom: u(8) },
  brandName:      { fontSize: u(68), color: C.ink },
  brandIcon:      { fontSize: u(56) },
  dots:           { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: u(16), marginTop: u(28) },
  dot:            { height: u(18), borderRadius: u(9) },
  dotActive:      { width: u(64), backgroundColor: C.terra },
  dotInactive:    { width: u(18), backgroundColor: '#D9C9B4' },
  // last slide: full-width pill
  lastBtnWrap:    { marginTop: u(48), marginHorizontal: u(64) },
  getStartedBtn:  { height: u(150), borderRadius: u(75), backgroundColor: C.terra, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(20), shadowColor: C.terra, shadowOpacity: 0.45, shadowRadius: u(24), shadowOffset: { width: 0, height: u(14) } },
  getStartedText: { fontWeight: '600', fontSize: u(46), letterSpacing: u(0.5), color: '#FFF7EF' },
  getStartedArrow:{ fontSize: u(46), lineHeight: u(50), color: '#FFF7EF' },
  // mid slides: text Skip + circular Next
  navBtnRow:      { marginTop: u(38), marginHorizontal: u(76), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipText:       { fontWeight: '600', fontSize: u(44), color: '#A9967F' },
  nextWrap:       { width: u(170), height: u(170), alignItems: 'center', justifyContent: 'center' },
  progressRing:   { position: 'absolute' },
  nextCircle:     { width: u(150), height: u(150), borderRadius: u(75), backgroundColor: C.terra, alignItems: 'center', justifyContent: 'center', shadowColor: C.terra, shadowOpacity: 0.45, shadowRadius: u(20), shadowOffset: { width: 0, height: u(12) } },
  nextArrow:      { fontSize: u(60), lineHeight: u(64), color: '#FFF7EF', fontWeight: '400' },
  // sign in
  signInRow:      { textAlign: 'center', marginTop: u(36), fontSize: u(39), color: C.subtitle },
  signInLink:     { color: C.terra, fontWeight: '700' },
});
