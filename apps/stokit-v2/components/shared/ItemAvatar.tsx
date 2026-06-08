import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { PANTRY_CATALOG } from '../../constants/pantryCatalog';

interface ItemAvatarProps {
  name: string;
  size?: number;
}

export function ItemAvatar({ name, size = 44 }: ItemAvatarProps) {
  const { colors } = useTheme();

  const catalogItem = PANTRY_CATALOG.find((i) => i.name.toLowerCase() === name.toLowerCase());
  const fallbackInitial = name.trim().charAt(0).toUpperCase() || '?';
  const displayEmoji = catalogItem?.icon || null;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.fallbackText, { color: displayEmoji ? undefined : colors.muted, fontSize: size * 0.5 }]}>
        {displayEmoji || fallbackInitial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  fallbackText: {
    fontWeight: '600',
  },
});
