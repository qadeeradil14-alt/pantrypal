/**
 * ItemActionSheet — quick actions for a single pantry item.
 *
 * Opened by tapping an item row under "Everything else". Gives the user the
 * "what do I do next?" choices: mark low (→ onto the route), mark stocked,
 * assign / change store, or delete. Store assignment is delegated upward so
 * the caller can chain into StorePickerSheet.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { classifyItem } from '../../core/services/itemClassifier';
import { useDurableStore } from '../../store/durable-store';
import type { PantryItem, Store } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { cheapestRecentPrice, lastPriceAtStore } from '../../core/services/priceHistory';

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
  const updateItem = useDurableStore((s) => s.updateItem);
  const priceHistory = useDurableStore((s) => s.priceHistory);
  const stores = useDurableStore((s) => s.stores);

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [qty, setQty] = useState(item?.quantity ?? 1);

  // Sync qty when a different item is opened
  React.useEffect(() => { if (item) setQty(item.quantity); }, [item?.id]);

  if (!item) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const { emoji, color } = classifyItem(item.name);
  const isLow = item.status === 'low' || item.status === 'expiring';
  const lastHere = store ? lastPriceAtStore(priceHistory, item.name, store.id) : undefined;
  const best = cheapestRecentPrice(priceHistory, item.name);
  const bestStore = best ? stores.find((candidate) => candidate.id === best.storeId) : undefined;

  const changeQty = (delta: number) => {
    const next = Math.max(1, qty + delta);
    setQty(next);
    updateItem(item.id, { quantity: next });
  };

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
            {store ? store.name : 'No store'}
          </Text>
        </View>
        {/* Inline quantity stepper */}
        <View style={styles.stepper}>
          <Pressable
            onPress={() => changeQty(-1)}
            style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.5 }]}
            hitSlop={8}
          >
            <Text style={[styles.stepIcon, { color: qty <= 1 ? colors.muted : colors.ink }]}>−</Text>
          </Pressable>
          <Text style={styles.stepQty}>{qty}</Text>
          <Pressable
            onPress={() => changeQty(1)}
            style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.5 }]}
            hitSlop={8}
          >
            <Text style={[styles.stepIcon, { color: colors.ink }]}>+</Text>
          </Pressable>
        </View>
      </View>

      {best ? (
        <View style={styles.priceCard}>
          <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.priceTitle}>Best known price: ${best.price.toFixed(2)}</Text>
            <Text style={styles.priceSub}>
              {bestStore?.name ?? 'Unknown store'}
              {lastHere ? ` · last paid here $${lastHere.price.toFixed(2)}` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {isLow ? (
        <ActionRow
          icon="checkmark-circle-outline"
          tint={colors.success}
          label="Remove from shopping list"
          sub="Keep this item in your pantry"
          onPress={() => act(() => setItemStatus(item.id, 'stocked'))}
          styles={styles}
          colors={colors}
        />
      ) : (
        <ActionRow
          icon="trending-down"
          tint={colors.warning}
          label="Add to shopping list"
          sub="Keep it in pantry and buy another"
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
    priceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.primarySoft,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    priceTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    priceSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
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
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.sm,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    stepBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepIcon: { fontFamily: fonts.sansSemibold, fontSize: 20, lineHeight: 24 },
    stepQty: { fontFamily: fonts.mono, fontSize: 15, color: colors.ink, minWidth: 24, textAlign: 'center' },
  });
}
