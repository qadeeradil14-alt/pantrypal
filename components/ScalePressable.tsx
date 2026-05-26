import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface ScalePressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
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

  function animateTo(value: number, duration: number) {
    Animated.timing(scale, {
      toValue: value,
      duration,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        style={{ flex: 1 }}
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
