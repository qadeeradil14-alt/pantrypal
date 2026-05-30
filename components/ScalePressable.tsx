import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// Layout props that control how children are positioned inside the button.
// These belong on the Pressable (which parents the children), NOT the
// Animated.View. Keeping flexDirection:'row' on Animated.View while
// Pressable has flex:1 causes the outer container to expand unexpectedly
// when the button sits alongside a flex:1 sibling in a row layout.
const CONTENT_LAYOUT_KEYS = new Set([
  'flexDirection', 'flexWrap', 'alignItems', 'alignContent',
  'justifyContent', 'gap', 'rowGap', 'columnGap',
  'padding', 'paddingVertical', 'paddingHorizontal',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingStart', 'paddingEnd',
]);

function partitionStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: ViewStyle = {};
  for (const [key, val] of Object.entries(flat)) {
    if (CONTENT_LAYOUT_KEYS.has(key)) {
      (inner as Record<string, unknown>)[key] = val;
    } else {
      (outer as Record<string, unknown>)[key] = val;
    }
  }
  return { outer, inner };
}

interface ScalePressableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  profile?: 'button' | 'chip' | 'card' | 'danger';
  pressedScale?: number;
  pressInDurationMs?: number;
  pressOutDurationMs?: number;
}

export default function ScalePressable({
  style,
  profile = 'button',
  pressedScale,
  pressInDurationMs,
  pressOutDurationMs,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const profileConfig = {
    button: { scale: 0.972, inMs: 80, outMs: 120 },
    chip: { scale: 0.982, inMs: 70, outMs: 110 },
    card: { scale: 0.988, inMs: 85, outMs: 130 },
    danger: { scale: 0.968, inMs: 75, outMs: 130 },
  }[profile];

  const targetScale = pressedScale ?? profileConfig.scale;
  const inDuration = pressInDurationMs ?? profileConfig.inMs;
  const outDuration = pressOutDurationMs ?? profileConfig.outMs;

  const animateTo = useCallback((value: number, duration: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const { outer, inner } = useMemo(() => partitionStyle(style), [style]);

  return (
    <Animated.View style={[outer, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        style={[inner, { alignSelf: 'stretch' }]}
        onPressIn={(e) => {
          animateTo(targetScale, inDuration);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          animateTo(1, outDuration);
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
