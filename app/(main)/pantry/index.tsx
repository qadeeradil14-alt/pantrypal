import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHouseholdStore } from '../../../store/household';
import { useAuthStore } from '../../../store/auth';
import { useItemsStore } from '../../../store/items';
import { ensureDefaultItems, fetchItems } from '../../../lib/items';
import { registerPushToken } from '../../../lib/notifications';
import ItemRow from '../../../components/ItemRow';
import AddItemModal from '../../../components/AddItemModal';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ItemCategory } from '../../../constants/defaultItems';

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

    // Self-heal households created before default seeding was stable.
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
      void registerPushToken(household.id, session.user.id).catch(() => {
        // Keep pantry usable if push registration fails.
      });
    }
  }, [household?.id, session?.user.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      Alert.alert('Refresh failed', 'Please try again.');
    }
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
      title: `${CATEGORY_ICONS[cat]}  ${CATEGORY_LABELS[cat]}`,
      data: [...low, ...ok],
      key: cat,
      count: catItems.length,
    };
  });

  const unknownItems = filtered
    .filter((i) => normalizeCategory(i.category) == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const sections = unknownItems.length > 0 && selectedCategory === 'all'
    ? [
        ...knownSections,
        {
          title: '📦  Other',
          data: unknownItems,
          key: 'other',
          count: unknownItems.length,
        },
      ]
    : knownSections;

  const lowCount = items.filter((i) => i.is_low).length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2D9CDB" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{household?.name ?? 'Pantry'}</Text>
          {lowCount > 0 && (
            <Text style={styles.lowBadge}>{lowCount} item{lowCount !== 1 ? 's' : ''} running low</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
            onPress={() => {
              if (!canAdd) {
                Alert.alert('Still loading', 'Household is still loading. Please try again in a moment.');
                return;
              }
              setShowAdd(true);
            }}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor="#aaa"
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <View style={styles.categoryFilters}>
        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.filterChipText, selectedCategory === 'all' && styles.filterChipTextActive]}>
            All ({queryFiltered.length})
          </Text>
        </TouchableOpacity>
        {CATEGORY_ORDER.map((cat) => {
          const count = queryFiltered.filter((i) => normalizeCategory(i.category) === cat).length;
          const active = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!hasAnyItems ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {q
              ? `No items matching "${query}" in ${selectedCategory === 'all' ? 'your pantry' : CATEGORY_LABELS[selectedCategory]}.`
              : `No items in ${selectedCategory === 'all' ? 'your pantry' : CATEGORY_LABELS[selectedCategory]} yet.`}
          </Text>
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
              <Text style={styles.sectionTitle}>{section.title} ({section.count})</Text>
            </View>
          )}
          renderSectionFooter={({ section }) => (
            section.data.length === 0
              ? (
                <View style={styles.sectionEmptyWrap}>
                  <Text style={styles.sectionEmptyText}>No items in this category yet.</Text>
                </View>
              )
              : null
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D9CDB" />}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
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
  safe: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  lowBadge: { fontSize: 13, color: '#DC2626', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    backgroundColor: '#2D9CDB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnDisabled: { backgroundColor: '#93C5FD' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  searchInput: {
    backgroundColor: '#F3F4F6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: '#1a1a1a',
  },
  categoryFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: '#2D9CDB',
    backgroundColor: '#F0F9FF',
  },
  filterChipText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#2D9CDB',
  },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionEmptyWrap: { paddingHorizontal: 20, paddingBottom: 6 },
  sectionEmptyText: { color: '#9CA3AF', fontSize: 13 },
  list: { paddingBottom: 120 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },
});
