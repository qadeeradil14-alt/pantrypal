/**
 * Stokit — Animated Onboarding
 * Orbit animation runs 100% on the UI thread via Reanimated 4:
 *   useFrameCallback  → math runs on UI thread every frame (no JS bridge)
 *   useAnimatedStyle  → style updates on UI thread (no JS bridge)
 *   makeMutable       → shared values created outside hooks (for arrays)
 * Result: true 60 fps, no JS-thread jank.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  makeMutable,
  runOnUI,
  SharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts } from '../../constants/theme';

// ── tokens ────────────────────────────────────────────────────────────────────
const C = {
  cream: '#F3EEE3', card: '#FCFAF3',
  ink: '#1C1714', body: '#2A2420', subtitle: '#9B8B78',
  terra: '#C2692F', onTerra: '#2C1C10', ghostBtn: '#EFE6D6',
};
const FONT_SERIF = fonts.displayExtraBold;
const FONT_SANS  = fonts.bodySemiBold;

const { width: SCREEN_W } = Dimensions.get('window');
const SCALE = SCREEN_W / 1080;
const u = (n: number) => {
  'worklet';
  return n * SCALE;
};

// ── worklet-safe easing & math ────────────────────────────────────────────────
// 'worklet' directive makes these compile to run on the UI thread

function wClamp(v: number, a = 0, b = 1) {
  'worklet';
  return Math.min(b, Math.max(a, v));
}
function wLerp(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}
function wEaseOutCubic(t: number) {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
function wEaseInQuart(t: number) {
  'worklet';
  return t * t * t * t;
}

const DEG = Math.PI / 180;

// Phase as number: 0=in 1=orbit 2=suck 3=beat
const PHASE_DURS = [1.1, 2.6, 1.3, 0.5];

function wChipState(
  phase: number, p: number, gT: number,
  cx: number, cy: number, R: number,
  baseDeg: number, i: number, n: number,
) {
  'worklet';
  const baseAng = baseDeg * DEG + gT * 14 * DEG;
  let r = R, ang = baseAng, scale = 1, opacity = 1;
  if (phase === 0) {
    const stag = (i / n) * 0.3;
    const pp = wEaseOutCubic(wClamp((p - stag) / 0.62));
    r = wLerp(0, R, pp);
    ang = baseAng + (1 - pp) * 190 * DEG;
    scale = wLerp(0.08, 1, pp);
    opacity = wClamp(pp * 1.9);
  } else if (phase === 1) {
    r = R + Math.sin(gT * 0.85 + i * 1.7) * 7;
  } else if (phase === 2) {
    const stag = (i / n) * 0.22;
    const pp = wEaseInQuart(wClamp((p - stag) / 0.82));
    r = wLerp(R, 0, pp);
    ang = baseAng + pp * 195 * DEG;
    scale = wLerp(1, 0.08, pp);
    opacity = 1 - wClamp((pp - 0.6) / 0.4);
  } else {
    r = 0; scale = 0.1; opacity = 0;
  }
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), scale, opacity };
}

function wCenterPulse(phase: number, p: number, n: number) {
  'worklet';
  if (phase !== 2) return 0;
  let pulse = 0;
  for (let i = 0; i < n; i++) {
    const x = p - ((i / n) * 0.22 + 0.82);
    if (x > 0 && x < 0.42) pulse += 0.07 * Math.sin((x / 0.42) * Math.PI);
  }
  return Math.min(pulse, 0.16);
}

// ── scene configs ─────────────────────────────────────────────────────────────
type Chip  = { emoji: string; r: number; size: number; angle: number };
type Scene = {
  hubR: number; hubColors: [string, string]; center: 'home' | 'cart' | 'receipt';
  centerSize: number; rings: { r: number; opacity: number }[]; chips: Chip[];
};

const mkRing = (emojis: string[], r: number, size: number, start = -90): Chip[] =>
  emojis.map((emoji, i) => ({ emoji, r, size, angle: start + (360 / emojis.length) * i }));

const SCENES: Scene[] = [
  {
    hubR: 178, hubColors: ['#FFFFFF', '#F6F0E5'], center: 'home', centerSize: 144,
    rings: [{ r: 314, opacity: 0.16 }, { r: 420, opacity: 0.09 }],
    chips: mkRing(['🏪','🥫','🥑','🧾','🥚','🧂','🥕','🥛','🍞','🧀','🍅','🫑'], 314, 114),
  },
  {
    hubR: 196, hubColors: ['#F0E2CC', '#E7D6BC'], center: 'cart', centerSize: 196,
    rings: [{ r: 420, opacity: 0.11 }],
    chips: mkRing(['🥕','🫑','🥚','🍌','🍞','🥦','🍅','🧅','🥛','🍎','🥬'], 322, 114),
  },
  {
    hubR: 196, hubColors: ['#F0E2CC', '#E7D6BC'], center: 'receipt', centerSize: 1,
    rings: [{ r: 420, opacity: 0.11 }],
    chips: mkRing(['🧾','💵','💳','📈','📊','💰','🪙','🏷️','🧮','🛒','💲'], 322, 114),
  },
];

const COPY = [
  { title: ['Your kitchen,','always in order'],  sub: 'Shop, stock your pantry, and track receipts — everything managed from one home.' },
  { title: ['Shop smarter,','together'],          sub: 'Mark items low and they appear on your grocery list. Check them off in-store.' },
  { title: ['Receipts into','real numbers'],      sub: 'Save receipts, watch the weekly budget, and spot where grocery money goes.' },
];

// ── animated sub-components (each has its own useAnimatedStyle) ───────────────

type ChipAnim = {
  tx: SharedValue<number>; ty: SharedValue<number>;
  sc: SharedValue<number>; op: SharedValue<number>;
};

function AnimChip({ anim, chipSize, emoji, left, top }: {
  anim: ChipAnim; chipSize: number; emoji: string; left: number; top: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: anim.op.value,
    transform: [
      { translateX: anim.tx.value },
      { translateY: anim.ty.value },
      { scale: anim.sc.value },
    ],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', left, top,
      width: chipSize, height: chipSize, borderRadius: chipSize / 2,
      backgroundColor: 'rgba(252,250,243,0.92)',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#784f28', shadowOpacity: 0.18,
      shadowRadius: u(16), shadowOffset: { width: 0, height: u(8) },
    }, style]}>
      <Text style={{ fontSize: chipSize * 0.48 }}>{emoji}</Text>
    </Animated.View>
  );
}

function AnimHub({ hubOp, hubSc, scene }: {
  hubOp: SharedValue<number>; hubSc: SharedValue<number>; scene: Scene;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: hubOp.value,
    transform: [{ scale: hubSc.value }],
  }));
  const W = 968, cx = W / 2, cy = W / 2;
  return (
    <Animated.View style={[{
      position: 'absolute',
      left: u(cx - scene.hubR), top: u(cy - scene.hubR),
      width: u(scene.hubR * 2), height: u(scene.hubR * 2),
      borderRadius: u(scene.hubR),
      backgroundColor: scene.hubColors[1],
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#784f28', shadowOpacity: 0.22,
      shadowRadius: u(32), shadowOffset: { width: 0, height: u(16) },
    }, style]}>
      <CenterIcon kind={scene.center} size={u(scene.centerSize)} />
    </Animated.View>
  );
}

function AnimRing({ hubOp, r, cx, cy, baseOpacity }: {
  hubOp: SharedValue<number>; r: number; cx: number; cy: number; baseOpacity: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: hubOp.value * baseOpacity,
  }));
  return (
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute',
      left: u(cx - r), top: u(cy - r),
      width: u(r * 2), height: u(r * 2), borderRadius: u(r),
      borderWidth: u(2), borderColor: C.terra,
    }, style]} />
  );
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

// ── Orbit — UI-thread animation ───────────────────────────────────────────────
function Orbit({ scene, active, onTriggerReady }: {
  scene: Scene; active: boolean; onTriggerReady?: (fn: () => void) => void;
}) {
  const W = 968, cx = W / 2, cy = W / 2, n = scene.chips.length;

  // Phase control — all shared values, accessible from UI thread
  const phaseIdx    = useSharedValue(0);
  const phaseStartT = useSharedValue(-1);  // -1 = not yet initialized
  const t0          = useSharedValue(-1);
  const suckSignal  = useSharedValue(false);
  const isActive    = useSharedValue(active); // init with current prop

  // Hub shared values
  const hubOp = useSharedValue(0);
  const hubSc = useSharedValue(1);

  // Chip shared values
  const chipAnims = useRef<ChipAnim[]>(
    scene.chips.map(() => ({
      tx: makeMutable(0),
      ty: makeMutable(0),
      sc: makeMutable(0),
      op: makeMutable(0),
    }))
  ).current;

  // Stable chip config arrays for worklet capture
  const chipR     = scene.chips.map(c => c.r);
  const chipAngle = scene.chips.map(c => c.angle);

  // Trigger suck from JS thread
  const trigger = useCallback(() => {
    runOnUI(() => {
      'worklet';
      suckSignal.value = true;
    })();
  }, [suckSignal]);

  useEffect(() => {
    if (active && onTriggerReady) onTriggerReady(trigger);
  }, [active, onTriggerReady, trigger]);

  // Sync active state and reset on activation
  useEffect(() => {
    isActive.value = active;
    if (active) {
      // Reset so the frame callback re-initializes timestamps on first tick
      phaseIdx.value    = 0;
      phaseStartT.value = -1;
      t0.value          = -1;
      suckSignal.value  = false;
      hubOp.value       = 0;
      hubSc.value       = 1;
    }
  }, [active]);

  // ── UI-thread animation loop (auto-starts, gated by isActive) ────────────
  useFrameCallback(({ timeSinceFirstFrame }) => {
    'worklet';
    if (!isActive.value) return;

    const now = timeSinceFirstFrame;
    if (!Number.isFinite(now)) return;

    // Self-initialize timestamps on first active frame
    if (phaseStartT.value < 0) {
      phaseStartT.value = now;
      t0.value          = now;
    }

    let p    = (now - phaseStartT.value) / 1000;
    const gT = (now - t0.value) / 1000;
    if (!Number.isFinite(p) || !Number.isFinite(gT)) return;

    // Handle suck trigger
    if (suckSignal.value && phaseIdx.value !== 2) {
      phaseIdx.value    = 2;
      phaseStartT.value = now;
      suckSignal.value  = false;
      p = 0;
    }

    const phase = phaseIdx.value;

    if (p >= PHASE_DURS[phase]) {
      phaseIdx.value    = (phase + 1) % 4;
      phaseStartT.value = now;
      return;
    }

    // Hub
    hubSc.value = (1 + wCenterPulse(phase, p, n)) * (1 + Math.sin(gT * 1.1) * 0.012);
    hubOp.value = wClamp(gT / 0.55);

    // Chips
    for (let i = 0; i < n; i++) {
      const s = wChipState(phase, p, gT, cx, cy, chipR[i], chipAngle[i], i, n);
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.scale) || !Number.isFinite(s.opacity)) continue;
      chipAnims[i].tx.value = u(s.x - cx);
      chipAnims[i].ty.value = u(s.y - cy);
      chipAnims[i].sc.value = s.scale;
      chipAnims[i].op.value = s.opacity;
    }
  });

  const ucx = u(cx), ucy = u(cy);

  return (
    <View style={{ width: u(W), height: u(W) }}>
      {scene.rings.map((rg, i) => (
        <AnimRing key={i} hubOp={hubOp} r={rg.r} cx={cx} cy={cy} baseOpacity={rg.opacity} />
      ))}
      <AnimHub hubOp={hubOp} hubSc={hubSc} scene={scene} />
      {scene.chips.map((c, i) => (
        <AnimChip
          key={i}
          anim={chipAnims[i]}
          chipSize={u(c.size)}
          emoji={c.emoji}
          left={ucx - u(c.size) / 2}
          top={ucy - u(c.size) / 2}
        />
      ))}
    </View>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ idx, active, registerTrigger }: {
  idx: number; active: boolean; registerTrigger: (fn: () => void) => void;
}) {
  const copy = COPY[idx];
  return (
    <View style={{ width: SCREEN_W }}>
      <View style={{
        marginHorizontal: u(56), borderRadius: u(46),
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1, borderColor: 'rgba(220,208,190,0.28)',
        overflow: 'hidden', height: u(968), width: u(968),
      }}>
        <Orbit scene={SCENES[idx]} active={active} onTriggerReady={registerTrigger} />
      </View>
      <Text style={{ marginTop: u(76), textAlign: 'center', fontFamily: FONT_SERIF, fontWeight: '800', fontSize: u(98), lineHeight: u(112), color: C.ink }}>
        {copy.title[0]}{'\n'}{copy.title[1]}
      </Text>
      <Text style={{ marginTop: u(28), marginHorizontal: u(96), textAlign: 'center', fontFamily: FONT_SANS, fontWeight: '500', fontSize: u(41), lineHeight: u(54), color: C.subtitle }}>
        {copy.sub}
      </Text>
    </View>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last       = index === SCENES.length - 1;
  const triggerRef = useRef<() => void>(() => {});
  const indexRef   = useRef(0); indexRef.current = index;
  const navLock    = useRef(false);

  const slideX     = useSharedValue(0);
  const onbOpacity = useSharedValue(1);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));
  const onbStyle = useAnimatedStyle(() => ({
    opacity: onbOpacity.value,
  }));

  const goSignUp = useCallback(() => {
    router.push({ pathname: '/(auth)/sign-up', params: { fromJoin: '0' } });
  }, [router]);

  const goSignIn = useCallback(() => {
    router.push('/(auth)/sign-in');
  }, [router]);

  const advance = useCallback(() => {
    if (indexRef.current >= SCENES.length - 1) {
      onbOpacity.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) }, () => {
        'worklet';
      });
      setTimeout(goSignUp, 500);
    } else {
      const ni = indexRef.current + 1;
      setIndex(ni);
      slideX.value = withTiming(-ni * SCREEN_W, { duration: 480, easing: Easing.out(Easing.cubic) });
    }
  }, [goSignUp, onbOpacity, slideX]);

  const next = () => {
    if (navLock.current) return;
    navLock.current = true;
    triggerRef.current();
    setTimeout(() => { advance(); navLock.current = false; }, 1040);
  };

  const skip = useCallback(() => {
    indexRef.current = SCENES.length - 1;
    advance();
  }, [advance]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.safe, onbStyle]}>

          <View style={styles.wordmark}>
            <Text style={[styles.brandName, { fontFamily: FONT_SERIF }]}>Stokit</Text>
            <Text style={styles.brandIcon}>🛒</Text>
          </View>

          <View style={{ marginTop: u(20), height: u(1448), overflow: 'hidden' }}>
            <Animated.View style={[{ flexDirection: 'row', width: SCREEN_W * SCENES.length }, slideStyle]}>
              {SCENES.map((_, i) => (
                <Panel
                  key={i}
                  idx={i}
                  active={i === index}
                  registerTrigger={(fn) => { triggerRef.current = fn; }}
                />
              ))}
            </Animated.View>
          </View>

          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>

          <View style={styles.btnRow}>
            <Pressable onPress={next} style={styles.primaryBtn}>
              <Text style={[styles.primaryBtnText, { fontFamily: FONT_SANS }]}>
                {last ? 'Get Started' : 'Next'}
              </Text>
            </Pressable>
            {!last && (
              <Pressable onPress={skip} style={styles.skipBtn}>
                <Text style={[styles.skipBtnText, { fontFamily: FONT_SANS }]}>Skip</Text>
              </Pressable>
            )}
          </View>

          <Text testID="auth-welcome-sign-in" style={[styles.signInRow, { fontFamily: FONT_SANS }]}>
            Already have an account?{'  '}
            <Text onPress={goSignIn} style={styles.signInLink}>Sign in</Text>
          </Text>

        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.cream },
  safe:        { flex: 1 },
  wordmark:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(18), marginTop: u(20), paddingBottom: u(16) },
  brandName:   { fontWeight: '700', fontSize: u(70), color: C.ink },
  brandIcon:   { fontSize: u(56) },
  dots:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: u(16), marginTop: u(30) },
  dot:         { height: u(18), borderRadius: u(9) },
  dotActive:   { width: u(64), backgroundColor: C.terra },
  dotInactive: { width: u(18), backgroundColor: '#D9C9B4' },
  btnRow:      { flexDirection: 'row', marginTop: u(50), marginHorizontal: u(56), gap: u(24) },
  primaryBtn:  { flex: 1, height: u(152), borderRadius: u(32), backgroundColor: C.terra, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontWeight: '600', fontSize: u(47), color: C.onTerra },
  skipBtn:     { width: u(256), height: u(152), borderRadius: u(32), backgroundColor: C.ghostBtn, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontWeight: '600', fontSize: u(47), color: C.terra },
  signInRow:   { textAlign: 'center', marginTop: u(40), fontSize: u(39), color: C.subtitle },
  signInLink:  { color: C.terra, fontWeight: '700' },
});
