import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { shadow, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Fab({
  onPress,
  icon = 'add',
  position = 'top',
}: {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  position?: 'top' | 'bottom';
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, position === 'top' ? insets.top : insets.bottom, position),
    [colors, insets.top, insets.bottom, position],
  );

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.fab,
        shadow.card,
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={24} color={colors.onPrimary} />
    </Pressable>
  );
}

function makeStyles(colors: AppColors, inset: number, position: 'top' | 'bottom') {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      ...(position === 'top'
        ? { top: Math.max(16, inset + 8) }
        : { bottom: Math.max(16, inset + 8) }),
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      opacity: position === 'top' ? 0.85 : 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
