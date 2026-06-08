/**
 * ItemActionSheet — quick actions for a single pantry item.
 *
 * Opened by tapping an item row under "Everything else". Gives the user the
 * "what do I do next?" choices: mark low (→ onto the route), mark stocked,
 * assign / change store, or delete. Store assignment is delegated upward so
 * the caller can chain into StorePickerSheet.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { classifyItem } from '../../core/services/itemClassifier';
import { useDurableStore } from '../../store/durable-store';
import type { PantryItem, Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';

export function ItemActionSheet({
  item,
  store,
  onClose,
  onAssignStore,
}: {
  item: PantryItem | null;
  store?: Store;
  onClose: () => void;
  /** Caller opens the StorePickerSheet for this item. */
  onAssignStore: (item: PantryItem) => void;
}) {
  const { colors } = useTheme();
  const setItemStatus = useDurableStore((s) => s.setItemStatus);
  const deleteItem = useDurableStore((s) => s.deleteItem);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!item) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const { emoji, color } = classifyItem(item.name);
  const isLow = item.status === 'low' || item.status === 'expiring';

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Sheet visible={!!item} title="Item actions" onClose={onClose}>
      {/* Item header */}
      <View style={styles.header}>
        <View style={[styles.iconChip, { backgroundColor: color + '28' }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.quantity} {item.unit.toUpperCase()}
            {store ? ` · ${store.name}` : ' · No store'}
          </Text>
        </View>
      </View>

      {isLow ? (
        <ActionRow
          icon="checkmark-circle-outline"
          tint={colors.success}
          label="Mark as stocked"
          sub="Remove from your shopping route"
          onPress={() => act(() => setItemStatus(item.id, 'stocked'))}
          styles={styles}
          colors={colors}
        />
      ) : (
        <ActionRow
          icon="trending-down"
          tint={colors.warning}
          label="Mark as low"
          sub="Add it to your shopping route"
          onPress={() => act(() => setItemStatus(item.id, 'low'))}
          styles={styles}
          colors={colors}
        />
      )}

      <ActionRow
        icon="storefront-outline"
        tint={colors.primary}
        label={store ? 'Change store' : 'Assign a store'}
        sub={store ? `Currently ${store.name}` : 'Pick where to buy this'}
        onPress={() => {
          onClose();
          onAssignStore(item);
        }}
        styles={styles}
        colors={colors}
      />

      <ActionRow
        icon="trash-outline"
        tint={colors.danger}
        label="Delete item"
        onPress={() => act(() => deleteItem(item.id))}
        styles={styles}
        colors={colors}
        last
      />
    </Sheet>
  );
}

function ActionRow({
  icon,
  tint,
  label,
  sub,
  onPress,
  last,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  sub?: string;
  onPress: () => void;
  last?: boolean;
  styles: any;
  colors: AppColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        !last && styles.actionRowDivider,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint + '20' }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.lg,
      marginBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    iconChip: {
      width: 50,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 28 },
    name: { fontFamily: fonts.sansSemibold, fontSize: 18, color: colors.ink },
    meta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3, textTransform: 'uppercase' },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    actionRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    actionSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
  });
}
