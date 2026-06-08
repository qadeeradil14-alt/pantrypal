import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { shadow, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

export function Fab({
  onPress,
  icon = 'add',
}: {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
      <Ionicons name={icon} size={28} color={colors.onPrimary} />
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
