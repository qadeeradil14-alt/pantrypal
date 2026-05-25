import { TouchableOpacity, View, Text, StyleSheet, Alert } from 'react-native';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { deleteItem, markItemLow, markItemOk } from '../lib/items';
import { setItemStore } from '../lib/stores';
import type { Item } from '../lib/items';

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
    if (stores.length === 0) return;

    const assignedStore = stores.find((s) => s.id === item.preferred_store_id);

    const storeButtons = stores.map((s) => ({
      text: s.id === item.preferred_store_id ? `${s.name} ✓` : s.name,
      onPress: () => assignStore(s.id),
    }));

    Alert.alert(
      'Assign to store',
      assignedStore
        ? `Currently buying at ${assignedStore.name}. Pick a different store or clear it.`
        : 'Which store do you usually get this from?',
      [
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

  return (
    <TouchableOpacity
      style={[styles.row, item.is_low && styles.rowLow]}
      onPress={handleTap}
      onLongPress={stores.length > 0 ? handleLongPress : undefined}
      delayLongPress={400}
      activeOpacity={0.65}
    >
      {/* Left: status bar accent */}
      <View style={[styles.accentBar, item.is_low ? styles.accentBarLow : styles.accentBarOk]} />

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

        {assignedStoreName ? (
          <Text style={styles.storeName}>📍 {assignedStoreName}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 56,
  },
  rowLow: {
    backgroundColor: '#FFF8F0',
  },
  // Left-edge accent bar (replaces dot — easier to see at a glance)
  accentBar: {
    width: 4,
    borderRadius: 0,
  },
  accentBarOk: {
    backgroundColor: '#D1FAE5',
  },
  accentBarLow: {
    backgroundColor: '#F97316',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '400',
    flex: 1,
  },
  nameLow: {
    color: '#C2410C',
    fontWeight: '600',
  },
  lowBadge: {
    backgroundColor: '#FED7AA',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lowBadgeText: {
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '400',
  },
});
