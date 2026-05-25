import { TouchableOpacity, View, Text, StyleSheet, Alert } from 'react-native';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { markItemLow, markItemOk } from '../lib/items';
import { setItemStore } from '../lib/stores';
import type { Item } from '../lib/items';

interface Props {
  item: Item;
  userId: string;
}

export default function ItemRow({ item, userId }: Props) {
  const { updateItem } = useItemsStore();
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
    if (stores.length === 0) return; // no stores configured — silently skip

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
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
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
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <View style={[styles.dot, item.is_low ? styles.dotLow : styles.dotOk]} />
        <View style={styles.nameCol}>
          <Text style={[styles.name, item.is_low && styles.nameLow]}>{item.name}</Text>
          {assignedStoreName ? (
            <Text style={styles.storeName}>{assignedStoreName}</Text>
          ) : null}
        </View>
      </View>
      {item.is_low && (
        <View style={styles.lowPill}>
          <Text style={styles.lowPillText}>Low</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowLow: { backgroundColor: '#FFF7F7' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOk: { backgroundColor: '#D1FAE5' },
  dotLow: { backgroundColor: '#EF4444' },
  nameCol: { flex: 1 },
  name: { fontSize: 16, color: '#1a1a1a' },
  nameLow: { color: '#991B1B', fontWeight: '500' },
  storeName: { fontSize: 12, color: '#2D9CDB', marginTop: 2 },
  lowPill: {
    backgroundColor: '#FEE2E2', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  lowPillText: { color: '#B91C1C', fontSize: 12, fontWeight: '600' },
});
