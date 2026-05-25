import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
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

  useEffect(() => {
    const tag = 'shopping-mode';
    if (shoppingMode) { activateKeepAwakeAsync(tag); }
    else { deactivateKeepAwake(tag); }
    return () => { deactivateKeepAwake(tag); };
  }, [shoppingMode]);

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

  const lowItems = items
    .filter((i) => i.is_low)
    .filter((i) => activeStoreId
      ? i.preferred_store_id === activeStoreId || i.preferred_store_id == null
      : true)
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

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={[styles.safe, shoppingMode && styles.safeShop]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, shoppingMode && styles.headerShop]}>
        <View>
          <Text style={[styles.headerTitle, shoppingMode && styles.headerTitleShop]}>
            {activeStore ? `At ${activeStore.name}` : 'Shopping list'}
          </Text>
          {arrivalCountdown !== null && (
            <Text style={styles.countdownText}>
              Partner has {formatCountdown(arrivalCountdown)} to add items
            </Text>
          )}
          {lowItems.length > 0 && arrivalCountdown === null && (
            <Text style={[styles.itemCountText, shoppingMode && styles.itemCountTextShop]}>
              {lowItems.length} item{lowItems.length !== 1 ? 's' : ''} to grab
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
          onPress={() => { setShoppingMode((v) => !v); if (shoppingMode) setActiveStore(null); }}
          activeOpacity={0.75}
        >
          <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
            {shoppingMode ? '✓ In store' : '🛒 Shop'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Store filter chips */}
      {stores.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storeBar}
          contentContainerStyle={styles.storeBarContent}
        >
          <TouchableOpacity
            style={[styles.storeChip, !activeStoreId && styles.storeChipActive]}
            onPress={() => setActiveStore(null)}
          >
            <Text style={[styles.storeChipText, !activeStoreId && styles.storeChipTextActive]}>
              All stores
            </Text>
          </TouchableOpacity>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, activeStoreId === s.id && styles.storeChipActive]}
              onPress={() => setActiveStore(activeStoreId === s.id ? null : s.id)}
            >
              <Text style={[styles.storeChipText, activeStoreId === s.id && styles.storeChipTextActive]}>
                {s.name}
              </Text>
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
              activeOpacity={0.65}
            >
              {/* Left accent bar */}
              <View style={styles.rowAccent} />

              <View style={styles.rowContent}>
                <View style={styles.rowLeft}>
                  <View style={styles.checkbox}>
                    {tapping === item.id && (
                      <ActivityIndicator size="small" color="#F97316" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, shoppingMode && styles.itemNameShop]}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                  </View>
                </View>
                {item.preferred_store_id && (
                  <Text style={styles.storeTag}>
                    {stores.find((s) => s.id === item.preferred_store_id)?.name ?? ''}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  safeShop: { backgroundColor: '#F0FDF4' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerShop: {
    backgroundColor: '#DCFCE7',
    borderBottomColor: '#BBF7D0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerTitleShop: { color: '#14532D' },
  countdownText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 2,
  },
  itemCountText: { fontSize: 13, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  itemCountTextShop: { color: '#15803D' },
  modeBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  modeBtnActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modeBtnTextActive: { color: '#fff' },

  storeBar: { maxHeight: 52, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  storeBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  storeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  storeChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  storeChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  storeChipTextActive: { color: '#fff' },

  list: { paddingVertical: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 64,
  },
  rowShop: { minHeight: 80 },
  rowAccent: { width: 4, backgroundColor: '#F97316', borderRadius: 0 },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemName: { fontSize: 17, color: '#111827', fontWeight: '500' },
  itemNameShop: { fontSize: 20, fontWeight: '600' },
  itemCategory: { fontSize: 12, color: '#9CA3AF', textTransform: 'capitalize', marginTop: 2 },
  storeTag: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
});
