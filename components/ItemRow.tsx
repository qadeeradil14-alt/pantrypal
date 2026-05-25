import { TouchableOpacity, View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { deleteItem, markItemLow, markItemOk } from '../lib/items';
import { setItemStore } from '../lib/stores';
import type { Item } from '../lib/items';
import { CATEGORY_LABELS } from '../constants/defaultItems';
import { colors, radii } from '../constants/theme';

interface Props {
  item: Item;
  userId: string;
}

export default function ItemRow({ item, userId }: Props) {
  const { removeItem, restoreItem, updateItem } = useItemsStore();
  const { stores } = useStoresStore();

  async function handleTap() {
    const nextLow = !item.is_low;
    updateItem(item.id, {
      is_low: nextLow,
      marked_low_by: nextLow ? userId : null,
      got_it_by: null,
    });
    try {
      if (nextLow) {
        await markItemLow(item.id, userId);
      } else {
        await markItemOk(item.id);
      }
    } catch (e: any) {
      console.error('[ItemRow] update failed:', e?.message ?? e);
      updateItem(item.id, {
        is_low: item.is_low,
        marked_low_by: item.marked_low_by,
        got_it_by: item.got_it_by,
      });
    }
  }

  function handleLongPress() {
    const assignedStore = stores.find((s) => s.id === item.preferred_store_id);

    const storeButtons = stores.map((s) => ({
      text: s.id === item.preferred_store_id ? `${s.name} ✓` : s.name,
      onPress: () => assignStore(s.id),
    }));

    const title = stores.length > 0 ? 'Assign to store' : item.name;
    const message = stores.length > 0
      ? (assignedStore
          ? `Currently buying at ${assignedStore.name}. Pick a different store or clear it.`
          : 'Which store do you usually get this from?')
      : 'What would you like to do?';

    Alert.alert(title, message, [
      ...storeButtons,
      ...(item.preferred_store_id
        ? [{ text: 'Clear store', style: 'destructive' as const, onPress: () => assignStore(null) }]
        : []),
      { text: 'Delete item', style: 'destructive' as const, onPress: handleDelete },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function handleDelete() {
    removeItem(item.id);
    try {
      await deleteItem(item.id);
    } catch (e: any) {
      console.error('[ItemRow] delete failed:', e?.message ?? e);
      restoreItem(item);
    }
  }

  async function assignStore(storeId: string | null) {
    const prev = item.preferred_store_id;
    updateItem(item.id, { preferred_store_id: storeId });
    try {
      await setItemStore(item.id, storeId);
    } catch (e: any) {
      console.error('[ItemRow] store assign failed:', e?.message ?? e);
      updateItem(item.id, { preferred_store_id: prev });
    }
  }

  const assignedStoreName = stores.find((s) => s.id === item.preferred_store_id)?.name;
  const categoryLabel = CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category;

  return (
    <TouchableOpacity
      style={[styles.row, item.is_low && styles.rowLow]}
      onPress={handleTap}
      onLongPress={handleLongPress}
      delayLongPress={400}
      activeOpacity={0.65}
    >
      {/* Status icon circle */}
      <View style={[styles.statusIcon, item.is_low && styles.statusIconLow]}>
        <Ionicons
          name={item.is_low ? 'alert-circle' : 'checkmark'}
          size={18}
          color={item.is_low ? colors.low : colors.primary}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, item.is_low && styles.nameLow]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.is_low && (
            <View style={styles.lowBadge}>
              <Text style={styles.lowBadgeText}>LOW</Text>
            </View>
          )}
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {categoryLabel}{assignedStoreName ? ` · ${assignedStoreName}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  rowLow: {
    backgroundColor: colors.lowSoft,
    borderColor: '#FBBF9A',
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    flexShrink: 0,
  },
  statusIconLow: {
    backgroundColor: colors.lowBadgeBg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: colors.ink,
    fontWeight: '600',
    flex: 1,
  },
  nameLow: {
    color: colors.lowText,
  },
  lowBadge: {
    backgroundColor: colors.lowBadgeBg,
    borderRadius: radii.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lowBadgeText: {
    color: colors.lowBadgeText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '400',
  },
});
