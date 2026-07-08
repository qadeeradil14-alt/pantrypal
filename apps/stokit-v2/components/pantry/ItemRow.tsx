import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { Pill } from '../shared/ui';
import { classifyItem } from '../../core/services/itemClassifier';
import { resolveItemAsset } from '../../constants/itemAssetResolver';
import { ItemIcon } from '../shared/ItemIcon';
import type { PantryItem, Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';

const STATUS_META = {
  stocked: { tone: 'stocked' as const, label: 'Have it' },
  low: { tone: 'low' as const, label: 'Need more' },
  expiring: { tone: 'expiring' as const, label: 'Use soon' },
  purchased: { tone: 'muted' as const, label: 'Bought' },
};

export function ItemRow({
  item,
  store,
  onPress,
  onMarkLow,
}: {
  item: PantryItem;
  store?: Store;
  onPress?: () => void;
  onMarkLow?: () => void;
}) {
  const { colors } = useTheme();
  const meta = STATUS_META[item.status];
  const { emoji, color } = classifyItem(item.name);
  const asset = resolveItemAsset(item.name, emoji);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      {/* Classified icon chip */}
      <View style={[styles.iconChip, { backgroundColor: color + '28' }]}>
        <ItemIcon asset={asset} size={38} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          ×{item.quantity}
          {store ? ` · ${store.name}` : ''}
        </Text>
      </View>

      {item.status === 'low' || item.status === 'expiring' ? (
        <Pill label={meta.label} tone={meta.tone} />
      ) : onMarkLow ? (
        <Pressable onPress={onMarkLow} hitSlop={8} style={styles.markLow}>
          <Ionicons name="trending-down" size={14} color={colors.primary} />
          <Text style={styles.markLowText}>Need more</Text>
        </Pressable>
      ) : (
        <Pill label={meta.label} tone={meta.tone} />
      )}
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    iconChip: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
    meta: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
    },
    markLow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    markLowText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary },
  });
}
