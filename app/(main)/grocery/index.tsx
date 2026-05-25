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
import { CATEGORY_LABELS } from '../../../constants/defaultItems';
import { colors, radii, shadow } from '../../../constants/theme';

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
    if (shoppingMode) activateKeepAwakeAsync(tag);
    else deactivateKeepAwake(tag);
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

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>{shoppingMode ? 'Shopping mode' : 'Grocery run'}</Text>
          <Text style={styles.headerTitle}>{activeStore ? activeStore.name : 'Shopping list'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
          onPress={() => { setShoppingMode((v) => !v); if (shoppingMode) setActiveStore(null); }}
          activeOpacity={0.75}
        >
          <Ionicons
            name={shoppingMode ? 'checkmark-circle' : 'cart-outline'}
            size={18}
            color={shoppingMode ? colors.surface : colors.primaryDeep}
          />
          <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
            {shoppingMode ? 'In store' : 'Shop'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.statusCard, shoppingMode && styles.statusCardActive]}>
        <View>
          <Text style={styles.statusNumber}>{lowItems.length}</Text>
          <Text style={styles.statusLabel}>
            {lowItems.length === 1 ? 'thing to grab' : 'things to grab'}
          </Text>
        </View>
        {arrivalCountdown !== null ? (
          <View style={styles.countdownPill}>
            <Ionicons name="timer-outline" size={18} color={colors.low} />
            <Text style={styles.countdownText}>{formatCountdown(arrivalCountdown)}</Text>
          </View>
        ) : (
          <View style={styles.countdownPill}>
            <Ionicons name="bag-handle-outline" size={18} color={colors.primary} />
            <Text style={styles.readyText}>{shoppingMode ? 'Keep awake' : 'Ready'}</Text>
          </View>
        )}
      </View>

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
            <Text style={[styles.chipText, !activeStoreId && styles.chipTextActive]}>All stores</Text>
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

      {lowItems.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="checkmark-circle-outline" size={64} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>All stocked up</Text>
          <Text style={styles.emptySub}>Mark items low from the Pantry tab and they will show up here.</Text>
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
            const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

            return (
              <TouchableOpacity
                style={[styles.row, shoppingMode && styles.rowShop]}
                onPress={() => handleGotIt(item)}
                disabled={isTapping}
                activeOpacity={0.72}
              >
                <View style={[styles.checkbox, isTapping && styles.checkboxTapping]}>
                  {isTapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="checkmark" size={18} color={colors.faint} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {categoryLabel}{storeName ? ` · ${storeName}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.faint} />
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerLeft: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 13, color: colors.primary, fontWeight: '800' },
  headerTitle: { fontSize: 30, fontWeight: '900', color: colors.ink },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
  },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeBtnText: { fontSize: 14, fontWeight: '800', color: colors.primaryDeep },
  modeBtnTextActive: { color: colors.surface },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadow,
  },
  statusCardActive: { backgroundColor: colors.primarySoft },
  statusNumber: { fontSize: 44, lineHeight: 48, fontWeight: '900', color: colors.ink },
  statusLabel: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  countdownText: { color: colors.low, fontWeight: '900', fontSize: 15 },
  readyText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  storeBar: { height: 50, flexGrow: 0, flexShrink: 0, backgroundColor: colors.background },
  storeBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  chipTextActive: { color: colors.surface },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  separator: { height: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.faint,
    gap: 12,
  },
  rowShop: { paddingVertical: 18 },
  checkbox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.faint,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  checkboxTapping: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowBody: { flex: 1 },
  itemName: { fontSize: 17, color: colors.ink, fontWeight: '800' },
  itemNameShop: { fontSize: 21 },
  itemMeta: { fontSize: 13, color: colors.muted, marginTop: 3, fontWeight: '600' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 48,
  },
  emptyIconWrap: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 23, fontWeight: '900', color: colors.ink },
  emptySub: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 23 },
});
