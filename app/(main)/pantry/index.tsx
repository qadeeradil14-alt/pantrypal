import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useItemsStore } from '../../../store/items';
import { ensureDefaultItems, fetchItems } from '../../../lib/items';
import { registerPushToken } from '../../../lib/notifications';
import ItemRow from '../../../components/ItemRow';
import AddItemModal from '../../../components/AddItemModal';
import { CATEGORY_LABELS, type ItemCategory } from '../../../constants/defaultItems';

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
      if (inserted > 0) {
        data = await fetchItems(householdId);
      }
    }

    setItems(data);
  }, [householdId, session?.user.id, setItems]);

  useEffect(() => {
    load()
      .catch(() => {
        Alert.alert('Could not load items', 'Please try again.');
      })
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
    ? [
        ...knownSections,
        { title: 'OTHER', data: unknownItems, key: 'other', count: unknownItems.length, lowCount: 0 },
      ]
    : knownSections;

  const lowCount = items.filter((i) => i.is_low).length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{household?.name ?? 'Pantry'}</Text>
          {lowCount > 0 ? (
            <View style={styles.lowCountBadge}>
              <View style={styles.lowCountDot} />
              <Text style={styles.lowCountText}>{lowCount} running low</Text>
            </View>
          ) : (
            <Text style={styles.allGoodText}>All stocked up ✓</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          onPress={() => {
            if (!canAdd) {
              Alert.alert('Still loading', 'Household is still loading. Please try again in a moment.');
              return;
            }
            setShowAdd(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* ── Category filter chips — single scrollable row ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {(['all', ...CATEGORY_ORDER] as const).map((cat) => {
          const isAll = cat === 'all';
          const count = isAll
            ? queryFiltered.length
            : queryFiltered.filter((i) => normalizeCategory(i.category) === cat).length;
          const active = selectedCategory === cat;
          const label = isAll ? `All  ${count}` : `${CATEGORY_LABELS[cat as ItemCategory]}  ${count}`;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ── */}
      {!hasAnyItems ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🥬</Text>
          <Text style={styles.emptyTitle}>
            {q ? `No results for "${query}"` : 'Nothing here yet'}
          </Text>
          <Text style={styles.emptySub}>
            {q
              ? 'Try a different search term or clear the filter.'
              : 'Tap "+ Add" to add your first item.'}
          </Text>
          {!q && (
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => canAdd && setShowAdd(true)}>
              <Text style={styles.emptyAddBtnText}>+ Add item</Text>
            </TouchableOpacity>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F97316" />
          }
          contentContainerStyle={styles.list}
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
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },

  // Header
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
  headerLeft: { gap: 4 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  lowCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lowCountDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F97316',
  },
  lowCountText: {
    fontSize: 13,
    color: '#C2410C',
    fontWeight: '500',
  },
  allGoodText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#D1D5DB' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
  },

  // Category chips
  chipsScroll: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: '#16A34A',
    backgroundColor: '#16A34A',
  },
  chipText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLowBadge: {
    backgroundColor: '#FED7AA',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sectionLowText: { fontSize: 11, color: '#9A3412', fontWeight: '700' },
  sectionCount: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  sectionEmptyWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  sectionEmptyText: { color: '#9CA3AF', fontSize: 13 },

  list: { paddingBottom: 120 },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 8 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyAddBtn: {
    marginTop: 16,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
