import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getSpendByStore } from '../../../lib/receipts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { useShoppingStore, type ShoppingEntry } from '../../../store/shopping';
import { markItemGotItWithQueue } from '../../../lib/items';
import { completeShoppingEntryWithQueue } from '../../../lib/shoppingList';
import { hapticError, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import type { Item } from '../../../lib/items';
import { CATEGORY_LABELS } from '../../../constants/defaultItems';
import { groceryItemTestId } from '../../../lib/testIds';
import { radii, shadow } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';
import SyncStatusPill from '../../../components/SyncStatusPill';

const WEEKLY_BUDGET = 150;

export default function GroceryScreen() {
  const { colors } = useTheme();
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
  const householdId = useHouseholdStore((s) => s.household?.id);
  const { stores, activeStoreId, setActiveStore } = useStoresStore();
  const { entries, removeEntry, upsertEntry } = useShoppingStore();
  const [shoppingMode, setShoppingMode] = useState(false);
  const [tapping, setTapping] = useState<string | null>(null);
  const [weeklySpend, setWeeklySpend] = useState(0);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    const tag = 'shopping-mode';
    if (shoppingMode) activateKeepAwakeAsync(tag);
    else deactivateKeepAwake(tag);
    return () => { deactivateKeepAwake(tag); };
  }, [shoppingMode]);

  useEffect(() => {
    if (!activeStoreId) return;
    setShoppingMode(true);
  }, [activeStoreId]);

  useEffect(() => {
    if (!householdId) return;
    getSpendByStore(householdId)
      .then((rows) => {
        const total = rows.reduce((sum, r) => sum + r.total, 0);
        setWeeklySpend(total);
      })
      .catch(() => {});
  }, [householdId]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === activeStoreId),
    [stores, activeStoreId],
  );

  const sourceItemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const lowItems = useMemo(() => {
    const activeEntries = entries.filter((e) => e.status === 'active');
    return activeEntries
      .filter((entry) => {
        const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
        if (!activeStoreId) return true;
        if (!linked) return true;
        return linked.preferred_store_id === activeStoreId || linked.preferred_store_id == null;
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [entries, sourceItemMap, activeStoreId]);

  const spendProgress = useMemo(
    () => Math.min(weeklySpend / WEEKLY_BUDGET, 1),
    [weeklySpend],
  );

  const handleGotIt = useCallback(async (entry: ShoppingEntry) => {
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
  }, [session?.user.id, removeEntry, upsertEntry, updateItem]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>{shoppingMode ? 'Shopping mode' : 'Grocery list'}</Text>
          <Text style={styles.headerTitle}>{activeStore ? activeStore.name : 'Shopping list'}</Text>
        </View>
        <SyncStatusPill />
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
        <View style={styles.statusRight}>
          {activeStore ? (
            <View style={styles.storePill}>
              <Ionicons name="storefront-outline" size={14} color={colors.primary} />
              <Text style={styles.storePillText} numberOfLines={1}>{activeStore.name}</Text>
            </View>
          ) : (
            <View style={styles.storePill}>
              <Ionicons name="bag-handle-outline" size={14} color={colors.muted} />
              <Text style={[styles.storePillText, { color: colors.muted }]}>All stores</Text>
            </View>
          )}
          <View style={styles.budgetRow}>
            <View style={styles.budgetBar}>
              <View style={[styles.budgetFill, {
                width: `${Math.round(spendProgress * 100)}%` as any,
                backgroundColor: spendProgress > 0.9 ? colors.low : spendProgress > 0.65 ? colors.warning : colors.success,
              }]} />
            </View>
            <Text style={styles.budgetLabel}>${Math.round(weeklySpend)} / ${WEEKLY_BUDGET}</Text>
          </View>
        </View>
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
        <EmptyState
          emoji="✅"
          title="All stocked up"
          subtitle="Mark items low from the Pantry tab and they'll show up here when it's time to shop."
        />
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
                testID={groceryItemTestId(entry.name)}
                profile="card"
                style={[styles.row, shoppingMode && styles.rowShop]}
                onPress={() => handleGotIt(entry)}
                disabled={isTapping}
              >
                <View style={[styles.lead, shoppingMode && styles.leadShop, isTapping && styles.leadTapping]}>
                  {isTapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : shoppingMode ? (
                    <Ionicons name="checkmark" size={13} color={colors.accent} />
                  ) : null}
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

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
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
    headerTitle: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
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
      marginBottom: 12,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 0,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...shadow,
    },
    statusCardActive: { backgroundColor: colors.surfaceDeep, borderColor: colors.surfaceDeep },
    statusKicker: { fontSize: 13, color: colors.primary, fontWeight: '900', marginBottom: 4 },
    statusKickerActive: { color: colors.accentSoft },
    statusNumber: { fontSize: 38, lineHeight: 42, fontWeight: '800', color: colors.ink },
    statusNumberActive: { color: colors.surface },
    statusLabel: { fontSize: 14, color: colors.muted, fontWeight: '700' },
    statusLabelActive: { color: colors.inkSoft },
    statusRight: { alignItems: 'flex-end', gap: 10, flex: 1, maxWidth: 140 },
    storePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-end',
    },
    storePillText: { fontSize: 12, fontWeight: '800', color: colors.primary, maxWidth: 100 },
    budgetRow: { alignItems: 'flex-end', gap: 4 },
    budgetBar: {
      width: 110,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.faint,
      overflow: 'hidden',
    },
    budgetFill: { height: 6, borderRadius: 3 },
    budgetLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
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
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.faint,
      gap: 12,
      ...shadow,
    },
    rowShop: { paddingVertical: 16, borderColor: colors.accentSoft },
    lead: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    leadTapping: { borderColor: colors.primary },
    leadShop: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    rowBody: { flex: 1 },
    itemName: { fontSize: 16, color: colors.ink, fontWeight: '700' },
    itemNameShop: { fontSize: 18 },
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
}
