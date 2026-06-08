/**
 * "Everything else" category row — Pantry / Fridge / Freezer / Beverages.
 * Matches the reference: icon chip + label + item count + chevron.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { StorageLocation } from '../../types';

const LOCATION_META: Record<
  StorageLocation,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  pantry:    { label: 'Pantry',    icon: 'storefront-outline', color: '#C98752', bg: '#F7EADB' },
  fridge:    { label: 'Fridge',    icon: 'thermometer-outline', color: '#4A86B0', bg: '#E3EFF7' },
  freezer:   { label: 'Freezer',   icon: 'snow-outline',        color: '#4A86B0', bg: '#EDF4FB' },
  beverages: { label: 'Beverages', icon: 'wine-outline',        color: '#3D6B4F', bg: '#E5F0E8' },
};

export function CategoryRow({
  location,
  count,
  onPress,
  expanded,
}: {
  location: StorageLocation;
  count: number;
  onPress?: () => void;
  expanded?: boolean;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const meta = LOCATION_META[location];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.iconChip, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <Text style={styles.label}>{meta.label}</Text>
      <Text style={styles.count}>{count} {count === 1 ? 'item' : 'items'}</Text>
      <Ionicons
        name={expanded ? 'chevron-down' : 'chevron-forward'}
        size={16}
        color={colors.muted}
      />
    </Pressable>
  );
}

export const STORAGE_LOCATIONS: StorageLocation[] = ['pantry', 'fridge', 'freezer', 'beverages'];

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
    },
    iconChip: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.ink,
    },
    count: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.muted,
    },
  });
}
