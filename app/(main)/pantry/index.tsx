import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useItemsStore } from '../../../store/items';
import { ensureDefaultItems, fetchItems } from '../../../lib/items';
import { registerPushToken } from '../../../lib/notifications';
import { hapticSelection } from '../../../lib/haptics';
import ItemRow from '../../../components/ItemRow';
import AddItemModal from '../../../components/AddItemModal';
import ScalePressable from '../../../components/ScalePressable';
import { CATEGORY_LABELS, type ItemCategory } from '../../../constants/defaultItems';
import { colors, radii } from '../../../constants/theme';

const CATEGORY_ORDER: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const CATEGORY_SET = new Set<ItemCategory>(CATEGORY_ORDER);

function normalizeCategory(value: string | null | undefined): ItemCategory | null {
  const normalized = (value ?? '').toLowerCase().trim() as ItemCategory;
  return CATEGORY_SET.has(normalized) ? normalized : null;
}

export default function PantryScreen() {
  const { household } = useHouseholdStore();
  const { session } = useAuthStore();
  const { items, setItems } = useItemsStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ItemCategory>('all');
  const householdId = household?.id ?? null;
  const canAdd = !!householdId;

  const load = useCallback(async () => {
    if (!householdId) {
      setItems([]);
      return;
    }
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

  const q = query.toLowerCase().trim();
  const queryFiltered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const filtered = selectedCategory === 'all'
    ? queryFiltered
    : queryFiltered.filter((i) => normalizeCategory(i.category) === selectedCategory);
  const hasAnyItems = filtered.length > 0;
  const visibleCategories = selectedCategory === 'all' ? CATEGORY_ORDER : [selectedCategory];

  const knownSections = visibleCategories.map((cat) => {
    const catItems = filtered.filter((i) => normalizeCategory(i.category) === cat);
    const low = catItems.filter((i) => i.is_low).sort((a, b) => a.name.localeCompare(b.name));
    const ok = catItems
      .filter((i) => !i.is_low)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      title: CATEGORY_LABELS[cat].toUpperCase(),
      data: [...low, ...ok],
      key: cat,
      count: catItems.length,
      lowCount: low.length,
    };
  });

  const unknownItems = filtered
    .filter((i) => normalizeCategory(i.category) == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const sections = unknownItems.length > 0 && selectedCategory === 'all'
    ? [...knownSections, { title: 'OTHER', data: unknownItems, key: 'other', count: unknownItems.length, lowCount: 0 }]
    : knownSections;

  const lowCount = items.filter((i) => i.is_low).length;
  const stockedCount = Math.max(items.length - lowCount, 0);
  const urgentItems = items
    .filter((i) => i.is_low)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3);
  const categoryStats = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
    count: queryFiltered.filter((i) => normalizeCategory(i.category) === cat).length,
    low: items.filter((i) => normalizeCategory(i.category) === cat && i.is_low).length,
  }));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.low} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Pantry</Text>
          <Text style={styles.headerTitle}>{household?.name ?? 'My kitchen'}</Text>
        </View>
        <ScalePressable
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          onPress={() => {
            void hapticSelection();
            if (!canAdd) {
              Alert.alert('Still loading', 'Household is still loading. Please try again in a moment.');
              return;
            }
            setShowAdd(true);
          }}
        >
          <Ionicons name="add" size={20} color={colors.surface} />
          <Text style={styles.addBtnText}>Add</Text>
        </ScalePressable>
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{items.length}</Text>
          <Text style={styles.summaryLabel}>Items</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{lowCount}</Text>
          <Text style={styles.summaryLabel}>Low</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{stockedCount}</Text>
          <Text style={styles.summaryLabel}>Stocked</Text>
        </View>
      </View>

      <View style={styles.commandPanel}>
        <View style={styles.commandHeader}>
          <Text style={styles.commandTitle}>Focus list</Text>
          <Text style={styles.commandMeta}>{urgentItems.length > 0 ? 'Needs restock' : 'All clear'}</Text>
        </View>
        {urgentItems.length > 0 ? (
          <View style={styles.urgentStack}>
            {urgentItems.map((item) => (
              <View key={item.id} style={styles.urgentRow}>
                <View style={styles.urgentDot} />
                <Text style={styles.urgentName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.urgentCat}>{CATEGORY_LABELS[normalizeCategory(item.category) ?? 'pantry']}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.clearRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            <Text style={styles.clearText}>Everything is stocked right now</Text>
          </View>
        )}
      </View>

      <View style={styles.statsGrid}>
        {categoryStats.map((stat) => (
          <ScalePressable
            key={stat.key}
            profile="card"
            style={[styles.statCard, selectedCategory === stat.key && styles.statCardActive]}
            onPress={() => {
              void hapticSelection();
              setSelectedCategory(selectedCategory === stat.key ? 'all' : stat.key);
            }}
          >
            <Text style={[styles.statValue, selectedCategory === stat.key && styles.statValueActive]}>{stat.count}</Text>
            <Text style={[styles.statLabel, selectedCategory === stat.key && styles.statLabelActive]}>{stat.label}</Text>
            {stat.low > 0 && <Text style={styles.statLow}>{stat.low} low</Text>}
          </ScalePressable>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your kitchen"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {(['all', ...CATEGORY_ORDER] as const).map((cat) => {
          const count = cat === 'all'
            ? queryFiltered.length
            : queryFiltered.filter((i) => normalizeCategory(i.category) === cat).length;
          const active = selectedCategory === cat;
          const label = cat === 'all' ? `All ${count}` : `${CATEGORY_LABELS[cat as ItemCategory]} ${count}`;
          return (
            <ScalePressable
              key={cat}
              profile="chip"
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                void hapticSelection();
                setSelectedCategory(cat);
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </ScalePressable>
          );
        })}
      </ScrollView>

      {!hasAnyItems ? (
        <View style={styles.empty}>
          <Ionicons name="leaf-outline" size={58} color={colors.primary} />
          <Text style={styles.emptyTitle}>
            {q ? `No results for "${query}"` : 'Your pantry is ready'}
          </Text>
          <Text style={styles.emptySub}>
            {q ? 'Try a different search term or clear the filter.' : 'Add the first item your household checks often.'}
          </Text>
          {!q && (
            <ScalePressable
              style={styles.emptyAddBtn}
              onPress={() => {
                if (!canAdd) return;
                void hapticSelection();
                setShowAdd(true);
              }}
            >
              <Text style={styles.emptyAddBtnText}>Add item</Text>
            </ScalePressable>
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          extraData={items}
          renderItem={({ item }) => (
            <ItemRow item={item} userId={session?.user.id ?? ''} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionMeta}>
                {section.lowCount > 0 && (
                  <View style={styles.sectionLowBadge}>
                    <Text style={styles.sectionLowText}>{section.lowCount} low</Text>
                  </View>
                )}
                <Text style={styles.sectionCount}>{section.count}</Text>
              </View>
            </View>
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <View style={styles.sectionEmptyWrap}>
                <Text style={styles.sectionEmptyText}>No items in this category.</Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.low} />
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
        />
      )}

      {showAdd && household?.id && (
        <AddItemModal
          householdId={household.id}
          userId={session?.user.id ?? ''}
          onClose={() => setShowAdd(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: { gap: 2, flex: 1 },
  eyebrow: { fontSize: 12, color: colors.primary, fontWeight: '800', textTransform: 'uppercase' },
  headerTitle: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnDisabled: { backgroundColor: '#B7C9B8' },
  addBtnText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  summaryStrip: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.faint,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, height: 34, backgroundColor: colors.faint },
  summaryValue: { fontSize: 24, color: colors.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  commandPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: 14,
  },
  commandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commandTitle: { fontSize: 16, color: colors.ink, fontWeight: '800' },
  commandMeta: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  urgentStack: { gap: 8 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 },
  urgentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.low },
  urgentName: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '700' },
  urgentCat: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearText: { color: colors.primary, fontWeight: '700' },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: 12,
    justifyContent: 'space-between',
  },
  statCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statValue: { fontSize: 22, color: colors.ink, fontWeight: '800' },
  statValueActive: { color: colors.surface },
  statLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  statLabelActive: { color: colors.primarySoft },
  statLow: { fontSize: 11, color: colors.low, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink },
  chipsScroll: { height: 50, flexGrow: 0, flexShrink: 0, backgroundColor: colors.background },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  chipTextActive: { color: colors.surface },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLowBadge: {
    backgroundColor: colors.lowSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sectionLowText: { fontSize: 11, color: colors.low, fontWeight: '800' },
  sectionCount: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  sectionEmptyWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  sectionEmptyText: { color: colors.muted, fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  separator: { height: 10 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: { fontSize: 21, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  emptySub: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  emptyAddBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyAddBtnText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
});
