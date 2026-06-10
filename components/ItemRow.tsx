import { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { deleteItemWithQueue, markItemLowWithQueue, markItemOkWithQueue } from '../lib/items';
import { setItemStoreWithQueue } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import type { Item } from '../lib/items';
import type { Store } from '../lib/stores';
import { pantryItemStoreMetaTestId, pantryItemTestId } from '../lib/testIds';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';
import ItemActionSheet from './ItemActionSheet';

interface Props {
  item: Item;
  userId: string;
  inShoppingCart?: boolean;
  onEditPress?: (item: Item) => void;
  onLiftPress?: (item: Item) => void;
}

function ItemRowComponent({ item, userId, inShoppingCart = false, onEditPress, onLiftPress }: Props) {
  const { colors } = useTheme();
  const { removeItem, restoreItem, updateItem } = useItemsStore();
  const assignedStoreName = useStoresStore((state) =>
    state.stores.find((s) => s.id === item.preferred_store_id)?.name,
  );
  const [showSheet, setShowSheet] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleTap() {
    if (inShoppingCart) {
      void hapticWarning();
      return;
    }
    const nextLow = !item.is_low;
    void hapticSelection();
    updateItem(item.id, {
      is_low: nextLow,
      macro_status: nextLow ? 'running_low' : 'in_stock',
      marked_low_by: nextLow ? userId : null,
      got_it_by: null,
    });
    try {
      if (nextLow) {
        const result = await markItemLowWithQueue(item.id, userId);
        if (!result.queued) void hapticWarning();
      } else {
        const result = await markItemOkWithQueue(item.id);
        if (!result.queued) void hapticSuccess();
      }
    } catch (e: any) {
      void hapticError();
      updateItem(item.id, {
        is_low: item.is_low,
        macro_status: item.macro_status,
        marked_low_by: item.marked_low_by,
        got_it_by: item.got_it_by,
      });
    }
  }

  function handleLongPress() {
    void hapticSelection();
    if (onLiftPress) {
      onLiftPress(item);
    } else {
      setShowSheet(true);
    }
  }

  async function handleDelete() {
    void hapticWarning();
    removeItem(item.id);
    try {
      const result = await deleteItemWithQueue(item.id);
      if (!result.queued) void hapticSuccess();
    } catch (e: any) {
      void hapticError();
      restoreItem(item);
    }
  }

  async function assignStore(storeId: string | null) {
    void hapticSelection();
    const prev = item.preferred_store_id;
    updateItem(item.id, { preferred_store_id: storeId });
    try {
      const result = await setItemStoreWithQueue(item.id, storeId);
      if (!result.queued) void hapticSuccess();
    } catch (e: any) {
      void hapticError();
      updateItem(item.id, { preferred_store_id: prev });
    }
  }

  const expiryInfo = useMemo(() => {
    if (!item.expires_at) return null;
    const now = Date.now();
    const exp = new Date(item.expires_at).getTime();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', urgent: true };
    if (diffDays === 0) return { label: 'Expires today', urgent: true };
    if (diffDays <= 3) return { label: `${diffDays}d left`, urgent: true };
    if (diffDays <= 7) return { label: `${diffDays}d left`, urgent: false };
    return null;
  }, [item.expires_at]);

  return (
    <>
      <View testID={pantryItemTestId(item.name)} collapsable={false}>
        <ScalePressable
          style={styles.card}
          onPress={handleTap}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          <View style={styles.content}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text testID={pantryItemStoreMetaTestId(item.name)} style={styles.meta} numberOfLines={1}>
              {assignedStoreName ?? 'No store set'}
            </Text>
          </View>
          {expiryInfo && (
            <View style={[styles.expiryChip, expiryInfo.urgent && styles.expiryChipUrgent]}>
              <Text style={[styles.expiryChipText, expiryInfo.urgent && styles.expiryChipTextUrgent]}>
                {expiryInfo.label}
              </Text>
            </View>
          )}
          {inShoppingCart ? (
            <View style={styles.cartBadge}>
              <Ionicons name="cart-outline" size={11} color={colors.primary} />
              <Text style={styles.cartBadgeText}>In cart</Text>
            </View>
          ) : item.is_low ? (
            <View style={styles.lowBadge}>
              <View style={styles.lowDot} />
              <Text style={styles.lowBadgeText}>Low</Text>
            </View>
          ) : (
            <View style={styles.stockDot} accessibilityLabel="In stock" />
          )}
        </ScalePressable>
      </View>

      {showSheet && !onLiftPress && (
        <ItemRowActionSheetHost
          item={item}
          visible={showSheet}
          onClose={() => setShowSheet(false)}
          onEdit={onEditPress ? () => onEditPress(item) : undefined}
          onAssignStore={assignStore}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}

const ItemRow = memo(ItemRowComponent);
export default ItemRow;

function ItemRowActionSheetHost({
  item,
  visible,
  onClose,
  onEdit,
  onAssignStore,
  onDelete,
}: {
  item: Item;
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onAssignStore: (storeId: string | null) => void;
  onDelete: () => void;
}) {
  const stores = useStoresStore((state): Store[] => state.stores);

  return (
    <ItemActionSheet
      item={item}
      visible={visible}
      onClose={onClose}
      onEdit={onEdit ?? (() => {})}
      onAssignStores={() => {}}
      onDelete={onDelete}
    />
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    content: { flex: 1, gap: 3 },
    name: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.ink },
    meta: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium },
    lowBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    lowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.warning,
    },
    lowBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.warning, letterSpacing: 0.3 },
    cartBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    cartBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.primary, letterSpacing: 0.2 },
    stockDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
      opacity: 0.85,
    },
    expiryChip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.warningSoft,
    },
    expiryChipUrgent: { backgroundColor: colors.dangerSoft },
    expiryChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.warning },
    expiryChipTextUrgent: { color: colors.danger },
  });
}
