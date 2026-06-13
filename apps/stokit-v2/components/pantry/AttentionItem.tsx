/**
 * "Needs attention" item card — mirrors the reference design exactly.
 *
 * Layout:
 *   [product icon]  Name         [• LOW]      [Add to list]  [≡]
 *                   0.5 GAL
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { classifyItem } from '../../core/services/itemClassifier';
import type { PantryItem, Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';

interface Props {
  item: PantryItem;
  store?: Store;
  onAddToList?: () => void;
  onViewItem?: () => void;
  /** Open the store picker for this item (assign or change). */
  onAssignStore?: () => void;
}

export function AttentionItem({ item, store, onAddToList, onViewItem, onAssignStore }: Props) {
  const { colors } = useTheme();
  const { emoji, color } = classifyItem(item.name);
  const isExpiring = item.status === 'expiring';
  // A low item with no store can't be shopped yet — assigning a store is the
  // required next action, so it takes over the primary button.
  const needsStore = !isExpiring && !item.storeId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {/* Product icon — large, rounded-square, white-ish bg */}
      <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      {/* Name + quantity + store */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.qty}>×{item.quantity}</Text>
        {needsStore ? (
          <Text style={styles.noStore}>Any store</Text>
        ) : store ? (
          <Pressable onPress={onAssignStore} hitSlop={6} style={styles.storeLine}>
            <Ionicons name="storefront-outline" size={11} color={colors.primary} />
            <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
            {onAssignStore ? <Text style={styles.changeStore}>· Change</Text> : null}
          </Pressable>
        ) : null}
        {isExpiring && item.expiryDate ? (
          <Text style={styles.expiryNote}>
            {daysUntil(item.expiryDate)} days left
          </Text>
        ) : null}
      </View>

      {/* Status badge */}
      <View style={[styles.badge, isExpiring ? styles.badgeExpiring : styles.badgeLow]}>
        <View style={[styles.dot, { backgroundColor: isExpiring ? colors.danger : colors.warning }]} />
        <Text style={[styles.badgeText, { color: isExpiring ? colors.danger : colors.warning }]}>
          {isExpiring ? 'USE SOON' : 'NEED MORE'}
        </Text>
      </View>

      {/* Action button — assign store takes priority when one is missing */}
      <Pressable
        onPress={needsStore ? onAssignStore : isExpiring ? onViewItem : onAddToList}
        style={({ pressed }) => [
          styles.actionBtn,
          needsStore && styles.actionBtnPrimary,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.actionText, needsStore && styles.actionTextPrimary]}>
          {needsStore ? 'Assign store' : isExpiring ? 'View item' : 'Add to list'}
        </Text>
      </Pressable>
    </View>
  );
}

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    emoji: { fontSize: 30 },
    info: { flex: 1, minWidth: 0 },
    name: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.ink,
    },
    qty: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
      textTransform: 'uppercase',
    },
    expiryNote: {
      fontFamily: fonts.sans,
      fontSize: 11,
      color: colors.danger,
      marginTop: 2,
    },
    noStore: {
      fontFamily: fonts.sansSemibold,
      fontSize: 11,
      color: colors.warning,
      marginTop: 3,
    },
    storeLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 3,
    },
    storeName: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
      color: colors.inkSoft,
      maxWidth: 90,
    },
    changeStore: {
      fontFamily: fonts.sansMedium,
      fontSize: 11,
      color: colors.primary,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.sm,
      flexShrink: 0,
    },
    badgeLow: { backgroundColor: colors.warningSoft },
    badgeExpiring: { backgroundColor: colors.dangerSoft },
    dot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 11,
      letterSpacing: 0.4,
    },
    actionBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexShrink: 0,
    },
    actionBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    actionText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 12,
      color: colors.ink,
    },
    actionTextPrimary: {
      color: colors.onPrimary,
    },
  });
}
