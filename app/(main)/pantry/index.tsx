import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, SectionList, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
  Animated, Easing, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useItemsStore } from '../../../store/items';
import { ensureDefaultItems, fetchItems, markItemOkWithQueue } from '../../../lib/items';
import { registerPushToken } from '../../../lib/notifications';
import { hapticSelection, hapticSuccess } from '../../../lib/haptics';
import ItemRow from '../../../components/ItemRow';
import AddItemModal from '../../../components/AddItemModal';
import EmptyState from '../../../components/EmptyState';
import EditItemModal from '../../../components/EditItemModal';
import type { Item } from '../../../lib/items';
import ScalePressable from '../../../components/ScalePressable';
import { CATEGORY_LABELS, type ItemCategory } from '../../../constants/defaultItems';
import { getItemEmoji } from '../../../constants/itemEmojis';
import { useTheme } from '../../../hooks/useTheme';
import type { AppColors } from '../../../constants/theme';

const CATEGORY_ORDER: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const CATEGORY_SET = new Set<ItemCategory>(CATEGORY_ORDER);

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  fridge: '🥛',
  freezer: '🧊',
  pantry: '🧺',
};


function normalizeCategory(value: string | null | undefined): ItemCategory | null {
  const normalized = (value ?? '').toLowerCase().trim() as ItemCategory;
  return CATEGORY_SET.has(normalized) ? normalized : null;
}

function getFirstName(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const STREAK_KEY = 'pantry_streak';
const STREAK_DATE_KEY = 'pantry_streak_date';

async function computeStreak(allStocked: boolean): Promise<number> {
  const today = new Date().toDateString();
  const storedDate = await AsyncStorage.getItem(STREAK_DATE_KEY);
  const storedStreak = parseInt((await AsyncStorage.getItem(STREAK_KEY)) ?? '0', 10);
  if (storedDate === today) return storedStreak;
  const yesterday = new Date(Date.now() - 864e5).toDateString();
  const newStreak = allStocked ? (storedDate === yesterday ? storedStreak + 1 : 1) : 0;
  await AsyncStorage.multiSet([[STREAK_KEY, String(newStreak)], [STREAK_DATE_KEY, today]]);
  return newStreak;
}

export default function PantryScreen() {
  const { colors, isDark } = useTheme();
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const { items, setItems, updateItem } = useItemsStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ItemCategory>('all');
  const [streak, setStreak] = useState(0);
  const householdId = household?.id ?? null;
  const canAdd = !!householdId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fabPulse = useRef(new Animated.Value(0)).current;
  const fabRotate = useRef(new Animated.Value(0)).current;

  // Only pulse when pantry is empty — avoids a forever-running animation
  useEffect(() => {
    if (items.length > 0) {
      fabPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, {
          toValue: 1, duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fabPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fabPulse, items.length]);

  useEffect(() => {
    Animated.spring(fabRotate, {
      toValue: showAdd ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [showAdd, fabRotate]);

  const pulseScale = fabPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const pulseOpacity = fabPulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.55, 0.35, 0] });
  const iconRotation = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const load = useCallback(async () => {
    if (!householdId) { setItems([]); return; }
    let data = await fetchItems(householdId);
    if (data.length === 0) {
      const inserted = await ensureDefaultItems(householdId, session?.user.id);
      if (inserted > 0) data = await fetchItems(householdId);
    }
    setItems(data);
  }, [householdId, session?.user.id, setItems]);

  useEffect(() => {
    load()
      .catch(() => Alert.alert('Could not load items', 'Please try again.'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (household && session?.user.id) {
      void registerPushToken(household.id, session.user.id).catch(() => {});
    }
  }, [household?.id, session?.user.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } catch { Alert.alert('Refresh failed', 'Please try again.'); }
    setRefreshing(false);
  }, [load]);

  const handleGotIt = useCallback(async (itemId: string) => {
    void hapticSuccess();
    updateItem(itemId, { is_low: false, marked_low_by: null, got_it_by: session?.user.id ?? null });
    try {
      await markItemOkWithQueue(itemId);
    } catch {
      updateItem(itemId, { is_low: true });
    }
  }, [session?.user.id, updateItem]);

  const q = useMemo(() => query.toLowerCase().trim(), [query]);

  const queryFiltered = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items),
    [items, q],
  );

  const filtered = useMemo(
    () => (selectedCategory === 'all'
      ? queryFiltered
      : queryFiltered.filter((i) => normalizeCategory(i.category) === selectedCategory)),
    [queryFiltered, selectedCategory],
  );

  const sections = useMemo(() => {
    const visibleCategories = selectedCategory === 'all' ? CATEGORY_ORDER : [selectedCategory as ItemCategory];
    return visibleCategories
      .map((cat) => {
        const catItems = filtered.filter((i) => normalizeCategory(i.category) === cat);
        const low = catItems.filter((i) => i.is_low).sort((a, b) => a.name.localeCompare(b.name));
        const ok = catItems.filter((i) => !i.is_low).sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
          title: CATEGORY_LABELS[cat],
          emoji: CATEGORY_EMOJI[cat],
          data: [...low, ...ok],
          key: cat,
          count: catItems.length,
          lowCount: low.length,
        };
      })
      .filter((s) => s.data.length > 0);
  }, [filtered, selectedCategory]);

  const lowItems = useMemo(
    () => items.filter((i) => i.is_low).sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const categoryStats = useMemo(
    () => CATEGORY_ORDER.map((cat) => ({
      key: cat as ItemCategory,
      label: CATEGORY_LABELS[cat],
      emoji: CATEGORY_EMOJI[cat],
      count: queryFiltered.filter((i) => normalizeCategory(i.category) === cat).length,
      low: items.filter((i) => normalizeCategory(i.category) === cat && i.is_low).length,
    })),
    [queryFiltered, items],
  );

  const firstName = useMemo(() => getFirstName(session?.user.email ?? 'there'), [session?.user.email]);

  const healthScore = useMemo(() => {
    if (items.length === 0) return 100;
    const stocked = items.filter((i) => !i.is_low).length;
    return Math.round((stocked / items.length) * 100);
  }, [items]);

  const allStocked = healthScore === 100 && items.length > 0;

  useEffect(() => {
    computeStreak(allStocked).then(setStreak).catch(() => {});
  }, [allStocked]);

  const listHeader = useMemo(() => (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {firstName} 👋</Text>
          <Text style={styles.householdSub}>{household?.name ?? 'Your pantry'}</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={[styles.healthPill, { backgroundColor: healthScore >= 80 ? colors.successSoft : healthScore >= 50 ? colors.warningSoft : colors.lowSoft }]}>
            <Text style={[styles.healthPillText, { color: healthScore >= 80 ? colors.success : healthScore >= 50 ? colors.warning : colors.low }]}>
              {healthScore}%
            </Text>
          </View>
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your pantry..."
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', ...CATEGORY_ORDER] as Array<'all' | ItemCategory>).map((key) => {
          const active = selectedCategory === key;
          const stat = categoryStats.find((s) => s.key === key);
          const label = key === 'all' ? 'All' : CATEGORY_LABELS[key];
          const emoji = key === 'all' ? '🏠' : CATEGORY_EMOJI[key];
          const hasLow = stat ? stat.low > 0 : false;
          return (
            <ScalePressable
              key={key}
              profile="chip"
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => {
                void hapticSelection();
                setSelectedCategory(active && key !== 'all' ? 'all' : key);
              }}
            >
              <Text style={styles.filterPillEmoji}>{emoji}</Text>
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
              {stat && <Text style={[styles.filterPillCount, active && styles.filterPillCountActive]}>{stat.count}</Text>}
              {hasLow && !active && <View style={styles.filterLowDot} />}
            </ScalePressable>
          );
        })}
      </View>

      {lowItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionIcon}>⚠️</Text>
            <Text style={styles.sectionTitle}>Running Low</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{lowItems.length}</Text>
            </View>
          </View>
          {lowItems.map((item) => (
            <View key={item.id} style={styles.lowCard}>
              <Text style={styles.lowCardEmoji}>
                {getItemEmoji(item.name, item.category ?? '')}
              </Text>
              <View style={styles.lowCardContent}>
                <Text style={styles.lowCardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.lowCardCat}>
                  {CATEGORY_LABELS[normalizeCategory(item.category) ?? 'pantry']}
                </Text>
              </View>
              <ScalePressable
                style={styles.gotItBtn}
                profile="chip"
                onPress={() => void handleGotIt(item.id)}
              >
                <Text style={styles.gotItText}>Got it</Text>
              </ScalePressable>
            </View>
          ))}
        </View>
      )}

      {filtered.length > 0 && (
        <View style={styles.allItemsRow}>
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'all' ? 'All Items' : CATEGORY_LABELS[selectedCategory as ItemCategory]}
          </Text>
          <Text style={styles.allItemsCount}>{filtered.length}</Text>
        </View>
      )}
    </>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [firstName, household?.name, styles, colors, categoryStats, selectedCategory, lowItems, filtered, handleGotIt, query, healthScore, streak]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        extraData={[items, isDark]}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            userId={session?.user.id ?? ''}
            onEditPress={setEditingItem}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.listSectionHeader}>
            <Text style={styles.listSectionEmoji}>{section.emoji}</Text>
            <Text style={styles.listSectionTitle}>{section.title}</Text>
            {section.lowCount > 0 && (
              <View style={styles.lowBadge}>
                <Text style={styles.lowBadgeText}>{section.lowCount} low</Text>
              </View>
            )}
            <Text style={styles.listSectionCount}>{section.count}</Text>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            emoji={q ? '🔍' : '🌿'}
            title={q ? `No results for "${query}"` : 'Nothing here yet'}
            subtitle={q ? 'Try a different search term.' : 'Add the first item your household uses regularly.'}
            action={q ? undefined : { label: 'Add first item', onPress: () => { void hapticSelection(); setShowAdd(true); } }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Animated.View style={[
          styles.fabRing,
          { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
        ]} />
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            !canAdd && styles.fabDisabled,
            { transform: [{ scale: pressed ? 0.90 : 1 }] },
          ]}
          onPress={() => {
            void hapticSelection();
            if (!canAdd) {
              Alert.alert('Still loading', 'Please try again in a moment.');
              return;
            }
            setShowAdd(true);
          }}
        >
          <Animated.View style={{ transform: [{ rotate: iconRotation }] }}>
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>

      {showAdd && household?.id && (
        <AddItemModal
          householdId={household.id}
          userId={session?.user.id ?? ''}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { paddingHorizontal: 16, paddingBottom: 120 },
    separator: { height: 8 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 14,
    },
    headerLeft: { flex: 1, gap: 2 },
    headerStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    healthPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    healthPillText: { fontSize: 13, fontWeight: '900' },
    streakPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.warningSoft,
    },
    streakText: { fontSize: 13, fontWeight: '900', color: colors.warning },
    greeting: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
    householdSub: { fontSize: 14, color: colors.muted, fontWeight: '600' },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      gap: 8,
    },
    searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink },

    filterRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 20,
      flexWrap: 'nowrap',
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      position: 'relative',
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillEmoji: { fontSize: 14 },
    filterPillText: { fontSize: 13, fontWeight: '700', color: colors.ink },
    filterPillTextActive: { color: '#FFFFFF' },
    filterPillCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      backgroundColor: colors.faint,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      textAlign: 'center',
    },
    filterPillCountActive: {
      color: colors.primary,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    filterLowDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.warning,
    },

    section: { marginHorizontal: 16, marginBottom: 20 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    sectionIcon: { fontSize: 15 },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, flex: 1 },
    sectionBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    sectionBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },

    lowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    lowCardEmoji: { fontSize: 26 },
    lowCardContent: { flex: 1 },
    lowCardName: { fontSize: 16, fontWeight: '700', color: colors.ink },
    lowCardCat: { fontSize: 13, color: colors.muted, marginTop: 2 },
    gotItBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    gotItText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

    allItemsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    allItemsCount: { fontSize: 14, fontWeight: '700', color: colors.muted },

    listSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    listSectionEmoji: { fontSize: 15 },
    listSectionTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, flex: 1 },
    listSectionCount: { fontSize: 13, color: colors.muted, fontWeight: '600' },
    lowBadge: {
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    lowBadgeText: { fontSize: 11, color: colors.warning, fontWeight: '800' },

    fabWrap: {
      position: 'absolute',
      bottom: 28,
      right: 20,
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabRing: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
    },
    fab: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 14,
      elevation: 9,
    },
    fabDisabled: { backgroundColor: colors.disabled },

    empty: {
      paddingTop: 48,
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
    emptySub: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  });
}
