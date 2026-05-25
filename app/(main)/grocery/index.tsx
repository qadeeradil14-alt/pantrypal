import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useStoresStore } from '../../../store/stores';
import { markItemGotIt } from '../../../lib/items';
import type { Item } from '../../../lib/items';

const ARRIVAL_WINDOW_SECS = 120;

export default function GroceryScreen() {
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {activeStore ? activeStore.name : 'Shopping list'}
          </Text>
          {arrivalCountdown !== null ? (
            <Text style={styles.countdownText}>
              Partner has {formatCountdown(arrivalCountdown)} to add items
            </Text>
          ) : lowItems.length > 0 ? (
            <Text style={styles.subText}>
              {lowItems.length} item{lowItems.length !== 1 ? 's' : ''} to grab
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
          onPress={() => { setShoppingMode((v) => !v); if (shoppingMode) setActiveStore(null); }}
          activeOpacity={0.75}
        >
          <Ionicons
            name={shoppingMode ? 'checkmark-circle' : 'cart-outline'}
            size={16}
            color={shoppingMode ? '#fff' : '#374151'}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
            {shoppingMode ? 'In store' : 'Shop'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Store filter chips ── */}
      {stores.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storeBar}
          contentContainerStyle={styles.storeBarContent}
        >
          <TouchableOpacity
            style={[styles.chip, !activeStoreId && styles.chipActive]}
            onPress={() => setActiveStore(null)}
          >
            <Text style={[styles.chipText, !activeStoreId && styles.chipTextActive]}>
              All stores
            </Text>
          </TouchableOpacity>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, activeStoreId === s.id && styles.chipActive]}
              onPress={() => setActiveStore(activeStoreId === s.id ? null : s.id)}
            >
              <Text style={[styles.chipText, activeStoreId === s.id && styles.chipTextActive]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── List or empty state ── */}
      {lowItems.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
          </View>
          <Text style={styles.emptyTitle}>All stocked up!</Text>
          <Text style={styles.emptySub}>
            Nothing is marked low.{'\n'}Tap items in your pantry when you run low.
          </Text>
        </View>
      ) : (
        <FlatList
          data={lowItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const storeName = item.preferred_store_id
              ? stores.find((s) => s.id === item.preferred_store_id)?.name
              : null;
            const isTapping = tapping === item.id;

            return (
              <TouchableOpacity
                style={[styles.row, shoppingMode && styles.rowShop]}
                onPress={() => handleGotIt(item)}
                disabled={isTapping}
                activeOpacity={0.6}
              >
                {/* Checkbox */}
                <View style={[styles.checkbox, isTapping && styles.checkboxTapping]}>
                  {isTapping && <ActivityIndicator size="small" color="#16A34A" />}
                </View>

                {/* Name + meta */}
                <View style={styles.rowBody}>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                    {storeName ? `  ·  ${storeName}` : ''}
                  </Text>
                </View>

                {/* Tap hint */}
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  subText: { fontSize: 13, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  countdownText: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginTop: 2 },

  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  modeBtnActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modeBtnTextActive: { color: '#fff' },

  // Store chips — fixed height prevents ScrollView from expanding
  storeBar: {
    height: 50,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  storeBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },

  // List rows
  list: { paddingTop: 4, paddingBottom: 120 },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 68 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    gap: 14,
  },
  rowShop: { paddingVertical: 22 },

  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxTapping: {
    borderColor: '#16A34A',
  },

  rowBody: { flex: 1 },
  itemName: {
    fontSize: 17,
    color: '#111827',
    fontWeight: '500',
  },
  itemNameShop: { fontSize: 20, fontWeight: '600' },
  itemMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 48,
  },
  emptyIconWrap: { marginBottom: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  emptySub: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});
