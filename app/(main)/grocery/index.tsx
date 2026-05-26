import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useStoresStore } from '../../../store/stores';
import { useShoppingStore, type ShoppingEntry } from '../../../store/shopping';
import { markItemGotItWithQueue } from '../../../lib/items';
import { completeShoppingEntryWithQueue } from '../../../lib/shoppingList';
import { hapticError, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import type { Item } from '../../../lib/items';
import { CATEGORY_LABELS } from '../../../constants/defaultItems';
import { colors, radii, shadow } from '../../../constants/theme';
import ScalePressable from '../../../components/ScalePressable';

const ARRIVAL_WINDOW_SECS = 120;

export default function GroceryScreen() {
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
  const { stores, activeStoreId, setActiveStore } = useStoresStore();
  const { entries, removeEntry, upsertEntry } = useShoppingStore();
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
  const sourceItemMap = new Map(items.map((item) => [item.id, item]));
  const activeEntries = entries.filter((e) => e.status === 'active');
  const lowItems = activeEntries
    .filter((entry) => {
      const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
      if (!activeStoreId) return true;
      if (!linked) return true;
      return linked.preferred_store_id === activeStoreId || linked.preferred_store_id == null;
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  async function handleGotIt(entry: ShoppingEntry) {
    const userId = session?.user.id ?? '';
    void hapticSelection();
    setTapping(entry.id);
    removeEntry(entry.id);
    if (entry.source_item_id) {
      updateItem(entry.source_item_id, { is_low: false, got_it_by: userId, macro_status: 'in_stock' as Item['macro_status'] });
    }

    try {
      if (entry.source_item_id) {
        const result = await markItemGotItWithQueue(entry.source_item_id, userId);
        if (result.queued) {
          void hapticSelection();
          return;
        }
      } else {
        const result = await completeShoppingEntryWithQueue(entry.id);
        if (result.queued) {
          void hapticSelection();
          return;
        }
      }
      void hapticSuccess();
    } catch {
      upsertEntry(entry);
      if (entry.source_item_id) {
        updateItem(entry.source_item_id, { is_low: true, got_it_by: null, macro_status: 'running_low' as Item['macro_status'] });
      }
      void hapticError();
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
          <Text style={styles.eyebrow}>{shoppingMode ? 'Shopping mode' : 'Grocery list'}</Text>
          <Text style={styles.headerTitle}>{activeStore ? activeStore.name : 'Shopping list'}</Text>
        </View>
        <ScalePressable
          style={[styles.modeBtn, shoppingMode && styles.modeBtnActive]}
          onPress={() => {
            void hapticSelection();
            setShoppingMode((v) => !v);
            if (shoppingMode) setActiveStore(null);
          }}
        >
          <Ionicons
            name={shoppingMode ? 'checkmark-circle' : 'cart-outline'}
            size={18}
            color={shoppingMode ? colors.surface : colors.primaryDeep}
          />
          <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
            {shoppingMode ? 'In store' : 'Shop'}
          </Text>
        </ScalePressable>
      </View>

      <View style={[styles.statusCard, shoppingMode && styles.statusCardActive]}>
        <View>
          <Text style={[styles.statusKicker, shoppingMode && styles.statusKickerActive]}>{shoppingMode ? 'In progress' : 'To buy'}</Text>
          <Text style={[styles.statusNumber, shoppingMode && styles.statusNumberActive]}>{lowItems.length}</Text>
          <Text style={[styles.statusLabel, shoppingMode && styles.statusLabelActive]}>
            {lowItems.length === 1 ? 'thing to grab' : 'things to grab'}
          </Text>
        </View>
        {arrivalCountdown !== null ? (
          <View style={[styles.countdownPill, shoppingMode && styles.countdownPillActive]}>
            <Ionicons name="timer-outline" size={18} color={colors.low} />
            <Text style={styles.countdownText}>{formatCountdown(arrivalCountdown)}</Text>
          </View>
        ) : (
          <View style={[styles.countdownPill, shoppingMode && styles.countdownPillActive]}>
            <Ionicons name="bag-handle-outline" size={18} color={shoppingMode ? colors.accent : colors.primary} />
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
          <ScalePressable
            profile="chip"
            style={[styles.chip, !activeStoreId && styles.chipActive]}
            onPress={() => {
              void hapticSelection();
              setActiveStore(null);
            }}
          >
            <Text style={[styles.chipText, !activeStoreId && styles.chipTextActive]}>All stores</Text>
          </ScalePressable>
          {stores.map((s) => (
            <ScalePressable
              key={s.id}
              profile="chip"
              style={[styles.chip, activeStoreId === s.id && styles.chipActive]}
              onPress={() => {
                void hapticSelection();
                setActiveStore(activeStoreId === s.id ? null : s.id);
              }}
            >
              <Text style={[styles.chipText, activeStoreId === s.id && styles.chipTextActive]}>
                {s.name}
              </Text>
            </ScalePressable>
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
          keyExtractor={(entry) => entry.id}
          renderItem={({ item: entry }) => {
            const sourceItem = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
            const storeName = sourceItem?.preferred_store_id
              ? stores.find((s) => s.id === sourceItem.preferred_store_id)?.name
              : null;
            const isTapping = tapping === entry.id;
            const categoryLabel = CATEGORY_LABELS[entry.category as keyof typeof CATEGORY_LABELS] ?? entry.category;

            return (
              <ScalePressable
                profile="card"
                style={[styles.row, shoppingMode && styles.rowShop]}
                onPress={() => handleGotIt(entry)}
                disabled={isTapping}
              >
                <View style={[styles.checkbox, shoppingMode && styles.checkboxShop, isTapping && styles.checkboxTapping]}>
                  {isTapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="checkmark" size={18} color={colors.faint} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop]}>
                    {entry.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {categoryLabel}{storeName ? ` · ${storeName}` : ''}
                  </Text>
                </View>
                <Text style={styles.tapHint}>{shoppingMode ? 'Got it' : 'Tap'}</Text>
              </ScalePressable>
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
  headerTitle: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
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
  modeBtnActive: { backgroundColor: colors.surfaceDeep, borderColor: colors.surfaceDeep },
  modeBtnText: { fontSize: 14, fontWeight: '800', color: colors.primaryDeep },
  modeBtnTextActive: { color: colors.surface },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 0,
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadow,
  },
  statusCardActive: { backgroundColor: colors.surfaceDeep, borderColor: colors.surfaceDeep },
  statusKicker: { fontSize: 13, color: colors.primary, fontWeight: '900', marginBottom: 4 },
  statusKickerActive: { color: colors.accentSoft },
  statusNumber: { fontSize: 54, lineHeight: 58, fontWeight: '800', color: colors.ink },
  statusNumberActive: { color: colors.surface },
  statusLabel: { fontSize: 15, color: colors.muted, fontWeight: '800' },
  statusLabelActive: { color: '#D9CDBD' },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  countdownPillActive: { backgroundColor: '#0B1324' },
  countdownText: { color: colors.low, fontWeight: '800', fontSize: 15 },
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
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.faint,
    gap: 12,
    ...shadow,
  },
  rowShop: { paddingVertical: 20, borderColor: colors.accentSoft },
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
  checkboxShop: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowBody: { flex: 1 },
  itemName: { fontSize: 18, color: colors.ink, fontWeight: '700' },
  itemNameShop: { fontSize: 21 },
  itemMeta: { fontSize: 13, color: colors.muted, marginTop: 3, fontWeight: '600' },
  tapHint: { fontSize: 12, color: colors.muted, fontWeight: '900' },
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
