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
}: {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);

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

function makeStyles(colors: AppColors, topInset: number) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      top: Math.max(16, topInset + 8),
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      opacity: 0.85,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
