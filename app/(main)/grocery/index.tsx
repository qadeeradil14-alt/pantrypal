import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Animated,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { markItemGotIt } from '../../../lib/items';
import type { Item } from '../../../lib/items';

const ARRIVAL_WINDOW_SECS = 120;

export default function GroceryScreen() {
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
  const { household } = useHouseholdStore();
  const { stores, activeStoreId, setActiveStore } = useStoresStore();
  const [shoppingMode, setShoppingMode] = useState(false);
  const [tapping, setTapping] = useState<string | null>(null);
  const [arrivalCountdown, setArrivalCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep screen awake in shopping mode
  useEffect(() => {
    const tag = 'shopping-mode';
    if (shoppingMode) { activateKeepAwakeAsync(tag); }
    else { deactivateKeepAwake(tag); }
    return () => { deactivateKeepAwake(tag); };
  }, [shoppingMode]);

  // Arrival countdown (triggered by geofence via activeStoreId being set)
  useEffect(() => {
    if (!activeStoreId) return;
    setArrivalCountdown(ARRIVAL_WINDOW_SECS);
    setShoppingMode(true);

    countdownRef.current = setInterval(() => {
      setArrivalCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeStoreId]);

  const activeStore = stores.find((s) => s.id === activeStoreId);

  // Filter items by active store, fall back to all low items
  const lowItems = items
    .filter((i) => i.is_low)
    .filter((i) => activeStoreId ? i.preferred_store_id === activeStoreId || i.preferred_store_id == null : true)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  async function handleGotIt(item: Item) {
    const userId = session?.user.id ?? '';
    setTapping(item.id);
    updateItem(item.id, { is_low: false, got_it_by: userId });
    try {
      await markItemGotIt(item.id, userId);
    } catch {
      updateItem(item.id, { is_low: true, got_it_by: null });
    } finally {
      setTapping(null);
    }
  }

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={[styles.safe, shoppingMode && styles.safeShop]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {activeStore ? `At ${activeStore.name}` : 'Shopping list'}
          </Text>
          {arrivalCountdown !== null && (
            <Text style={styles.countdownText}>
              Partner has {formatCountdown(arrivalCountdown)} to add items
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
          onPress={() => { setShoppingMode((v) => !v); if (shoppingMode) setActiveStore(null); }}
        >
          <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
            {shoppingMode ? '🛒 In store' : '🛒 Shop'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Store filter chips */}
      {stores.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeBar} contentContainerStyle={styles.storeBarContent}>
          <TouchableOpacity
            style={[styles.storeChip, !activeStoreId && styles.storeChipActive]}
            onPress={() => setActiveStore(null)}
          >
            <Text style={[styles.storeChipText, !activeStoreId && styles.storeChipTextActive]}>All</Text>
          </TouchableOpacity>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, activeStoreId === s.id && styles.storeChipActive]}
              onPress={() => setActiveStore(activeStoreId === s.id ? null : s.id)}
            >
              <Text style={[styles.storeChipText, activeStoreId === s.id && styles.storeChipTextActive]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {lowItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyTitle}>All stocked up!</Text>
          <Text style={styles.emptySub}>
            Nothing is marked low.{'\n'}Tap items in your pantry when you run low.
          </Text>
        </View>
      ) : (
        <FlatList
          data={lowItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, shoppingMode && styles.rowShop]}
              onPress={() => handleGotIt(item)}
              disabled={tapping === item.id}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                {tapping === item.id
                  ? <ActivityIndicator size="small" color="#2D9CDB" />
                  : <View style={styles.checkbox} />
                }
                <View>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop]}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                </View>
              </View>
              {item.preferred_store_id && (
                <Text style={styles.storeTag}>
                  {stores.find((s) => s.id === item.preferred_store_id)?.name ?? ''}
                </Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  safeShop: { backgroundColor: '#F0FDF4' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  countdownText: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginTop: 2 },
  modeBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#E5E7EB' },
  modeBtnActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  modeBtnTextActive: { color: '#fff' },
  storeBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  storeBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  storeChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  storeChipActive: { backgroundColor: '#2D9CDB', borderColor: '#2D9CDB' },
  storeChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  storeChipTextActive: { color: '#fff' },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowShop: { paddingVertical: 22 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#2D9CDB' },
  itemName: { fontSize: 17, color: '#1a1a1a' },
  itemNameShop: { fontSize: 20 },
  itemCategory: { fontSize: 12, color: '#999', textTransform: 'capitalize', marginTop: 2 },
  storeTag: { fontSize: 12, color: '#2D9CDB', fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  emptySub: { fontSize: 16, color: '#888', textAlign: 'center', lineHeight: 24 },
});
