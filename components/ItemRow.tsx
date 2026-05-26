import { memo, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { deleteItemWithQueue, markItemLowWithQueue, markItemOkWithQueue } from '../lib/items';
import { setItemStoreWithQueue } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import type { Item } from '../lib/items';
import { CATEGORY_LABELS } from '../constants/defaultItems';
import { getItemEmoji } from '../constants/itemEmojis';
import { useTheme } from '../hooks/useTheme';
import type { AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface Props {
  item: Item;
  userId: string;
  onEditPress?: (item: Item) => void;
}

function ItemRowComponent({ item, userId, onEditPress }: Props) {
  const { colors } = useTheme();
  const { removeItem, restoreItem, updateItem } = useItemsStore();
  const assignedStoreName = useStoresStore((state) =>
    state.stores.find((s) => s.id === item.preferred_store_id)?.name,
  );
  const stores = useStoresStore((state) => state.stores);
  const swipeRef = useRef<Swipeable>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleTap() {
    const nextLow = !item.is_low;
    void hapticSelection();
    updateItem(item.id, {
      is_low: nextLow,
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
      console.error('[ItemRow] update failed:', e?.message ?? e);
      void hapticError();
      updateItem(item.id, {
        is_low: item.is_low,
        marked_low_by: item.marked_low_by,
        got_it_by: item.got_it_by,
      });
    }
  }

  function handleLongPress() {
    void hapticSelection();
    const assignedStore = stores.find((s) => s.id === item.preferred_store_id);
    const storeButtons = stores.map((s) => ({
      text: s.id === item.preferred_store_id ? `${s.name} ✓` : s.name,
      onPress: () => assignStore(s.id),
    }));
    Alert.alert(
      item.name,
      assignedStore
        ? `Assigned to ${assignedStore.name}. Pick a store to reassign, or edit/delete.`
        : 'Edit, assign a store, or delete this item.',
      [
        ...(onEditPress ? [{ text: '✏️  Edit name & category', onPress: () => onEditPress(item) }] : []),
        ...storeButtons,
        ...(item.preferred_store_id
          ? [{ text: 'Clear store', style: 'destructive' as const, onPress: () => assignStore(null) }]
          : []),
        { text: 'Delete item', style: 'destructive' as const, onPress: handleDelete },
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }

  async function handleDelete() {
    void hapticWarning();
    removeItem(item.id);
    try {
      const result = await deleteItemWithQueue(item.id);
      if (!result.queued) void hapticSuccess();
    } catch (e: any) {
      console.error('[ItemRow] delete failed:', e?.message ?? e);
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
      console.error('[ItemRow] store assign failed:', e?.message ?? e);
      void hapticError();
      updateItem(item.id, { preferred_store_id: prev });
    }
  }

  async function handleSwipeLeft() {
    swipeRef.current?.close();
    if (item.is_low) return;
    void hapticWarning();
    updateItem(item.id, { is_low: true, marked_low_by: userId, got_it_by: null });
    try {
      await markItemLowWithQueue(item.id, userId);
    } catch {
      void hapticError();
      updateItem(item.id, { is_low: false, marked_low_by: null });
    }
  }

  async function handleSwipeRight() {
    swipeRef.current?.close();
    if (!item.is_low) return;
    void hapticSuccess();
    updateItem(item.id, { is_low: false, marked_low_by: null, got_it_by: userId });
    try {
      await markItemOkWithQueue(item.id);
    } catch {
      void hapticError();
      updateItem(item.id, { is_low: true, marked_low_by: item.marked_low_by });
    }
  }

  const emoji = useMemo(() => getItemEmoji(item.name, item.category ?? ''), [item.name, item.category]);
  const categoryLabel = useMemo(
    () => CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category,
    [item.category],
  );

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
    return (
      <Animated.View style={[styles.swipeAction, styles.swipeActionLow, { transform: [{ translateX }] }]}>
        <Text style={styles.swipeActionEmoji}>⚠️</Text>
        <Text style={styles.swipeActionLabel}>Low</Text>
      </Animated.View>
    );
  };

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
    return (
      <Animated.View style={[styles.swipeAction, styles.swipeActionGotIt, { transform: [{ translateX }] }]}>
        <Text style={styles.swipeActionEmoji}>✅</Text>
        <Text style={styles.swipeActionLabel}>Got it</Text>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={item.is_low ? undefined : renderRightActions}
      renderLeftActions={item.is_low ? renderLeftActions : undefined}
      onSwipeableOpen={(dir) => {
        if (dir === 'right') void handleSwipeLeft();
        else void handleSwipeRight();
      }}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <ScalePressable
        style={styles.card}
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {categoryLabel}{assignedStoreName ? ` · ${assignedStoreName}` : ''}
          </Text>
        </View>
        {item.is_low ? (
          <View style={styles.lowBadge}>
            <Text style={styles.lowBadgeText}>Low</Text>
          </View>
        ) : (
          <View style={styles.okBadge}>
            <Text style={styles.okBadgeText}>✓</Text>
          </View>
        )}
      </ScalePressable>
    </Swipeable>
  );
}

const ItemRow = memo(ItemRowComponent);
export default ItemRow;

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
      borderWidth: 1,
      borderColor: colors.border,
    },
    emoji: { fontSize: 24 },
    content: { flex: 1, gap: 3 },
    name: { fontSize: 16, fontWeight: '700', color: colors.ink },
    meta: { fontSize: 13, color: colors.muted, fontWeight: '500' },
    lowBadge: {
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    lowBadgeText: { fontSize: 12, fontWeight: '800', color: colors.warning },
    okBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    okBadgeText: { fontSize: 13, color: colors.success, fontWeight: '700' },
    swipeAction: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 72,
      borderRadius: 16,
      marginVertical: 0,
      gap: 3,
    },
    swipeActionLow: { backgroundColor: colors.warningSoft },
    swipeActionGotIt: { backgroundColor: colors.successSoft },
    swipeActionEmoji: { fontSize: 20 },
    swipeActionLabel: { fontSize: 11, fontWeight: '800', color: colors.ink },
  });
}

