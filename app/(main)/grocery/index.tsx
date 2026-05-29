import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, SectionList, StyleSheet,
  ActivityIndicator, ScrollView, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getSpendSummary } from '../../../lib/receipts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItemsStore } from '../../../store/items';
import { useAuthStore } from '../../../store/auth';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { useShoppingStore, type ShoppingEntry } from '../../../store/shopping';
import { markItemGotItWithQueue } from '../../../lib/items';
import { completeShoppingEntryWithQueue, setShoppingEntryAisleWithQueue } from '../../../lib/shoppingList';
import { hapticError, hapticSelection, hapticSuccess } from '../../../lib/haptics';
import type { Item } from '../../../lib/items';
import { CATEGORY_LABELS, type ItemCategory } from '../../../constants/defaultItems';
import { getItemEmoji } from '../../../constants/itemEmojis';
import { resolveStoreSection } from '../../../constants/storeSections';
import { groceryItemTestId } from '../../../lib/testIds';
import { radii, shadow, fonts } from '../../../constants/theme';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';
import StoreLogo from '../../../components/StoreLogo';
import { useSettingsStore } from '../../../store/settings';

function normalizeShoppingCategory(category: ShoppingEntry['category']): ItemCategory {
  return category === 'spice_rack' ? 'pantry' : category;
}

export default function GroceryScreen() {
  const { colors } = useTheme();
  const { items, updateItem } = useItemsStore();
  const { session } = useAuthStore();
  const householdId = useHouseholdStore((s) => s.household?.id);
  const { stores, activeStoreId, setActiveStore } = useStoresStore();
  const { entries, removeEntry, upsertEntry } = useShoppingStore();
  const [shoppingMode, setShoppingMode] = useState(false);
  const [tapping, setTapping] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set());
  const weeklyBudget = useSettingsStore((s) => s.weeklyBudget);
  const [weeklySpend, setWeeklySpend] = useState(0);
  const [startCount, setStartCount] = useState(0);
  const [grabbedCount, setGrabbedCount] = useState(0);

  // Pulse animation for the Start button — draws attention before shopping begins
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shoppingMode) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(1000),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shoppingMode, pulseAnim]);

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
    getSpendSummary(householdId)
      .then((s) => setWeeklySpend(s.weeklyTotal))
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

  // Total active entries regardless of store filter — used to keep the store
  // chip bar visible even when the selected store has 0 items.
  const totalActiveCount = useMemo(
    () => entries.filter((e) => e.status === 'active').length,
    [entries],
  );

  const lowItems = useMemo(() => {
    const activeEntries = entries.filter((e) => {
      if (e.status !== 'active') return false;
      if (activeStoreId) {
        const linked = e.source_item_id ? sourceItemMap.get(e.source_item_id) : null;
        return linked?.preferred_store_id === activeStoreId;
      }
      return true;
    });
    return activeEntries
      .sort((a, b) => {
        const linkedA = a.source_item_id ? sourceItemMap.get(a.source_item_id) : null;
        const linkedB = b.source_item_id ? sourceItemMap.get(b.source_item_id) : null;
        const storeA = linkedA?.preferred_store_id ? stores.find((s) => s.id === linkedA.preferred_store_id)?.name ?? 'No store set' : 'No store set';
        const storeB = linkedB?.preferred_store_id ? stores.find((s) => s.id === linkedB.preferred_store_id)?.name ?? 'No store set' : 'No store set';
        const sectionA = resolveStoreSection(a.name, normalizeShoppingCategory(a.category), a.aisle);
        const sectionB = resolveStoreSection(b.name, normalizeShoppingCategory(b.category), b.aisle);
        return storeA.localeCompare(storeB) || sectionA.order - sectionB.order || sectionA.label.localeCompare(sectionB.label) || a.name.localeCompare(b.name);
      });
  }, [entries, sourceItemMap, stores, activeStoreId]);

  // Keep startCount as a running high-water mark: max(startCount, pending + grabbed).
  // This handles three real cases a one-shot snapshot misses:
  //   1. Entries load after mode activates (geofence trigger on cold start)
  //   2. Partner marks items low mid-session (realtime insert)
  //   3. Items sit in lowItems for 520ms after tap while purchasedIds visual plays
  useEffect(() => {
    if (!shoppingMode) {
      setStartCount(0);
      setGrabbedCount(0);
      return;
    }
    setStartCount((prev) => Math.max(prev, lowItems.length + grabbedCount));
  }, [shoppingMode, lowItems.length, grabbedCount]);


  const shoppingSections = useMemo(() => {
    const groups = new Map<string, { title: string; storeId: string | null; data: ShoppingEntry[] }>();

    lowItems.forEach((entry) => {
      const linked = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
      const store = linked?.preferred_store_id ? stores.find((s) => s.id === linked.preferred_store_id) : null;
      const key = store?.id ?? 'unassigned';
      const existing = groups.get(key);
      if (existing) {
        existing.data.push(entry);
        return;
      }
      groups.set(key, {
        title: store?.name ?? 'No store set',
        storeId: store?.id ?? null,
        data: [entry],
      });
    });

    return Array.from(groups.values())
      .sort((a, b) => {
        // "No store set" (unassigned) always goes last
        if (a.title === 'No store set') return 1;
        if (b.title === 'No store set') return -1;
        return a.title.localeCompare(b.title);
      });
  }, [lowItems, sourceItemMap, stores]);

  const spendProgress = useMemo(
    () => Math.min(weeklySpend / weeklyBudget, 1),
    [weeklySpend, weeklyBudget],
  );

  const handleGotIt = useCallback(async (entry: ShoppingEntry) => {
    const userId = session?.user.id ?? '';
    void hapticSelection();
    setTapping(entry.id);
    setPurchasedIds((prev) => new Set(prev).add(entry.id));
    setGrabbedCount((prev) => prev + 1);
    if (entry.source_item_id) {
      updateItem(entry.source_item_id, { is_low: false, got_it_by: userId, macro_status: 'in_stock' as Item['macro_status'] });
    }

    try {
      const finishVisual = () => {
        setTimeout(() => {
          removeEntry(entry.id);
          setPurchasedIds((prev) => {
            const next = new Set(prev);
            next.delete(entry.id);
            return next;
          });
        }, 520);
      };
      if (entry.source_item_id) {
        const result = await markItemGotItWithQueue(entry.source_item_id, userId);
        if (result.queued) {
          void hapticSelection();
          finishVisual();
          return;
        }
      } else {
        const result = await completeShoppingEntryWithQueue(entry.id);
        if (result.queued) {
          void hapticSelection();
          finishVisual();
          return;
        }
      }
      void hapticSuccess();
      finishVisual();
    } catch {
      setPurchasedIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      setGrabbedCount((prev) => Math.max(0, prev - 1));
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
        <Animated.View style={!shoppingMode && { transform: [{ scale: pulseAnim }] }}>
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
              color={colors.surface}
            />
            <Text style={[styles.modeBtnText, shoppingMode && styles.modeBtnTextActive]}>
              {shoppingMode ? 'Done' : 'Start'}
            </Text>
          </ScalePressable>
        </Animated.View>
      </View>

      <View style={[styles.statusCard, shoppingMode && styles.statusCardActive]}>
        <View>
          {shoppingMode && startCount > 0 ? (
            <>
              <Text style={[styles.statusKicker, styles.statusKickerActive]}>In progress</Text>
              <Text style={[styles.statusNumber, styles.statusNumberActive]}>
                {grabbedCount}
                <Text style={[styles.statusNumberDim]}> / {startCount}</Text>
              </Text>
              <Text style={[styles.statusLabel, styles.statusLabelActive]}>grabbed</Text>
            </>
          ) : (
            <>
              <Text style={[styles.statusKicker, shoppingMode && styles.statusKickerActive]}>
                {shoppingMode && lowItems.length > 0 ? 'In progress' : 'To buy'}
              </Text>
              <Text style={[styles.statusNumber, shoppingMode && styles.statusNumberActive]}>{lowItems.length}</Text>
              <Text style={[styles.statusLabel, shoppingMode && styles.statusLabelActive]}>
                {lowItems.length === 1 ? 'thing to grab' : 'things to grab'}
              </Text>
            </>
          )}
        </View>
        <View style={styles.statusRight}>
          {activeStore && (
            <View style={styles.storePill}>
              <Ionicons name="storefront-outline" size={14} color={colors.primary} />
              <Text style={styles.storePillText} numberOfLines={1}>{activeStore.name}</Text>
            </View>
          )}
          <View style={styles.budgetSection}>
            <Text style={styles.budgetTitle}>Weekly spend</Text>
            <View style={styles.budgetBar}>
              <View style={[styles.budgetFill, {
                width: `${Math.round(spendProgress * 100)}%` as any,
                backgroundColor: spendProgress > 0.9 ? colors.danger : spendProgress > 0.65 ? colors.warning : colors.success,
              }]} />
            </View>
            <Text style={styles.budgetLabel}>${Math.round(weeklySpend)} / ${weeklyBudget}</Text>
          </View>
        </View>
      </View>


      {stores.length > 0 && totalActiveCount > 0 && (
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

      {shoppingSections.length > 0 && (
        <View style={styles.routeCard}>
          <View style={styles.routeCardHeader}>
            <Ionicons name="navigate-outline" size={16} color={colors.primary} />
            <Text style={styles.routeCardTitle}>
              {shoppingSections.length} {shoppingSections.length === 1 ? 'stop' : 'stops'}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeSteps}>
            {shoppingSections.map((section, index) => {
              const store = section.storeId ? stores.find((s) => s.id === section.storeId) : null;
              return (
                <View key={section.title} style={styles.routeStep}>
                  <Text style={styles.routeStepNumber}>{index + 1}</Text>
                  <StoreLogo
                    name={section.title}
                    size={20}
                    domain={store?.brand_domain}
                    logoUrl={store?.logo_url}
                  />
                  <Text style={styles.routeStepText}>{section.title}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {lowItems.length === 0 ? (
        <EmptyState
          emoji={
            shoppingMode && startCount > 0
              ? '🍽️'
              : activeStoreId
              ? '🏪'
              : shoppingMode
              ? '🛒'
              : '🧺'
          }
          title={
            shoppingMode && startCount > 0
              ? 'All grabbed!'
              : activeStoreId
              ? `Nothing at ${activeStore?.name ?? 'this store'}`
              : shoppingMode
              ? 'List is clear'
              : 'All stocked up'
          }
          subtitle={
            shoppingMode && startCount > 0
              ? `You picked up all ${startCount} ${startCount === 1 ? 'item' : 'items'}. Tap Done when you're finished.`
              : activeStoreId
              ? 'No low items are assigned to this store. Tap All stores above to see the full list.'
              : shoppingMode
              ? "Nothing on the list right now. Mark items low from the Pantry tab and they'll appear here."
              : "Mark items low from the Pantry tab and they'll show up here when it's time to shop."
          }
        />
      ) : (
        <SectionList
          sections={shoppingSections}
          keyExtractor={(entry) => entry.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <StoreLogo
                name={section.title}
                size={28}
                domain={section.storeId ? stores.find((s) => s.id === section.storeId)?.brand_domain : undefined}
                logoUrl={section.storeId ? stores.find((s) => s.id === section.storeId)?.logo_url : undefined}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
              </View>
            </View>
          )}
          renderItem={({ item: entry }) => {
            const sourceItem = entry.source_item_id ? sourceItemMap.get(entry.source_item_id) : null;
            const storeName = sourceItem?.preferred_store_id
              ? stores.find((s) => s.id === sourceItem.preferred_store_id)?.name
              : null;
            const isTapping = tapping === entry.id;
            const purchased = purchasedIds.has(entry.id);
            const categoryLabel = CATEGORY_LABELS[normalizeShoppingCategory(entry.category)];
            const emoji = getItemEmoji(entry.name, entry.category ?? '');

            function handleSetAisle() {
              void hapticSelection();
              Alert.prompt(
                'Store aisle',
                `Custom section for "${entry.name}" — e.g. "Aisle 7" or "Back wall".`,
                async (text) => {
                  const aisle = text?.trim() || null;
                  const prev = entry.aisle;
                  upsertEntry({ ...entry, aisle });
                  try {
                    await setShoppingEntryAisleWithQueue(entry.id, aisle);
                  } catch {
                    upsertEntry({ ...entry, aisle: prev });
                  }
                },
                'plain-text',
                entry.aisle ?? '',
              );
            }

            return (
              <ScalePressable
                testID={groceryItemTestId(entry.name)}
                profile="card"
                style={[styles.row, shoppingMode && styles.rowShop, purchased && styles.rowPurchased]}
                onPress={shoppingMode ? () => handleGotIt(entry) : undefined}
                onLongPress={shoppingMode ? handleSetAisle : undefined}
                delayLongPress={400}
                disabled={!shoppingMode || isTapping}
              >
                <View style={[styles.lead, shoppingMode && styles.leadShop, isTapping && styles.leadTapping, purchased && styles.leadPurchased]}>
                  {isTapping ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : purchased ? (
                    <Ionicons name="checkmark" size={13} color={colors.surface} />
                  ) : null}
                </View>
                <Text style={styles.itemEmoji}>{emoji}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.itemName, shoppingMode && styles.itemNameShop, purchased && styles.itemPurchased]}>
                    {entry.name}
                  </Text>
                  <Text style={[styles.itemMeta, purchased && styles.itemMetaPurchased]}>
                    {purchased ? 'Purchased ✓' : categoryLabel}{storeName && !purchased ? ` · ${storeName}` : ''}
                  </Text>
                </View>
                {(shoppingMode || purchased) && (
                  <Text style={[styles.tapHint, purchased && styles.tapHintPurchased]}>
                    {purchased ? 'Done' : 'Grab'}
                  </Text>
                )}
              </ScalePressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled={false}
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
    eyebrow: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBold, color: colors.ink, letterSpacing: 0 },
    modeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    modeBtnActive: { backgroundColor: colors.surfaceDeep, borderColor: colors.surfaceDeep },
    modeBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.surface },
    modeBtnTextActive: { color: colors.surface },
    statusCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...shadow,
    },
    statusCardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary + '40' },
    statusKicker: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold, marginBottom: 4 },
    statusKickerActive: { color: colors.primary },
    statusNumber: { fontSize: 38, lineHeight: 46, fontFamily: fonts.mono, color: colors.ink },
    statusNumberActive: { color: colors.primaryDeep },
    statusLabel: { fontSize: 14, color: colors.muted, fontFamily: fonts.bodyMedium },
    statusLabelActive: { color: colors.muted },
    statusNumberDim: { fontSize: 24, color: colors.muted, fontFamily: fonts.mono },
    statusRight: { alignItems: 'flex-end', gap: 9, flex: 1, maxWidth: 154 },
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
    storePillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary, maxWidth: 100 },
    routePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-end',
      borderWidth: 1,
      borderColor: colors.border,
    },
    routePillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
    budgetSection: { alignItems: 'flex-end', gap: 4 },
    budgetTitle: { fontSize: 11, color: colors.muted, fontFamily: fonts.bodyMedium },
    budgetRow: { alignItems: 'flex-end', gap: 4 },
    budgetBar: {
      width: 110,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.faint,
      overflow: 'hidden',
    },
    budgetFill: { height: 6, borderRadius: 3 },
    budgetLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.bodyMedium },
    storeBar: { height: 50, flexGrow: 0, flexShrink: 0, backgroundColor: colors.background },
    storeBarContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
      alignItems: 'center',
      flexDirection: 'row',
    },
    routeCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      gap: 10,
    },
    routeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
    },
    routeCardTitle: { fontSize: 14, color: colors.ink, fontFamily: fonts.bodySemiBold },
    routeSteps: { gap: 8, paddingHorizontal: 14 },
    routeStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    routeStepNumber: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      color: colors.primary,
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 18,
      fontFamily: fonts.monoMedium,
      fontVariant: ['tabular-nums'],
    },
    routeStepText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, maxWidth: 140 },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    chipTextActive: { color: colors.surface },
    list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
    separator: { height: 10 },
    sectionSeparator: { height: 10 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 14,
      paddingBottom: 10,
      paddingHorizontal: 2,
      backgroundColor: colors.background,
    },
    sectionIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    sectionTitle: { flex: 1, fontSize: 20, color: colors.ink, fontFamily: fonts.displayItalic, letterSpacing: 0 },
    sectionBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    sectionBadgeText: {
      fontSize: 12,
      fontFamily: fonts.monoMedium,
      color: colors.primary,
      fontVariant: ['tabular-nums'],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      ...shadow,
    },
    rowShop: { paddingVertical: 16, borderColor: colors.accentSoft },
    rowPurchased: {
      backgroundColor: colors.successSoft,
      borderColor: colors.success,
      opacity: 0.86,
    },
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
    leadPurchased: {
      borderColor: colors.success,
      backgroundColor: colors.success,
    },
    itemEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
    rowBody: { flex: 1 },
    itemName: { fontSize: 16, color: colors.ink, fontFamily: fonts.bodyMedium },
    itemNameShop: { fontSize: 18 },
    itemPurchased: { textDecorationLine: 'line-through', color: colors.muted },
    itemMeta: { fontSize: 13, color: colors.muted, marginTop: 3, fontFamily: fonts.body },
    itemMetaPurchased: { color: colors.success, fontFamily: fonts.bodySemiBold },
    tapHint: { fontSize: 12, color: colors.muted, fontFamily: fonts.bodySemiBold },
    tapHintPurchased: { color: colors.success },
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
    emptyTitle: { fontSize: 23, fontFamily: fonts.display, color: colors.ink },
    emptySub: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 23, fontFamily: fonts.body },

  });
}
