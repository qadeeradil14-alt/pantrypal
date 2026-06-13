import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { ChipSelect } from '../shared/Field';
import { Button } from '../shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import type { PantryItem, PantryStatus, Unit } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import {
  PANTRY_CATALOG,
  PANTRY_CATEGORIES,
  type PantryCatalogCategory,
  type PantryCatalogItem,
} from '../../constants/pantryCatalog';
import { ItemAvatar } from '../shared/ItemAvatar';

interface SelectedItem {
  catalog: PantryCatalogItem;
  quantity: number;
  unit: Unit;
  status: PantryStatus;
  storeId: string | null;
}

export function AddItemSheet({
  visible,
  onClose,
  defaultStatus = 'stocked',
  defaultStoreId = null,
  title = 'Add to pantry',
  subtitle = 'Select multiple items and add them all at once.',
  hideStorePicker = false,
  onItemsAdded,
}: {
  visible: boolean;
  onClose: () => void;
  defaultStatus?: PantryStatus;
  defaultStoreId?: string | null;
  title?: string;
  subtitle?: string;
  hideStorePicker?: boolean;
  onItemsAdded?: (items: PantryItem[]) => void;
}) {
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const addItem = useDurableStore((s) => s.addItem);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<typeof PANTRY_CATEGORIES[number]>('Produce');
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const reset = () => {
    setQuery('');
    setCategory('Produce');
    setSelected({});
  };

  const submit = () => {
    const chosen = Object.values(selected);
    if (!chosen.length) return;
    const addedItems: PantryItem[] = [];
    chosen.forEach(({ catalog, quantity, unit, status, storeId }) => {
      const item = addItem({ name: catalog.name, quantity, unit, status, storeId });
      addedItems.push(item);
    });
    reset();
    onClose();
    if (onItemsAdded) onItemsAdded(addedItems);
  };

  const close = () => {
    reset();
    onClose();
  };

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));
  const selectedItems = Object.values(selected);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCatalog = useMemo(() => PANTRY_CATALOG.filter((catalogItem) => {
    if (normalizedQuery) {
      return [
        catalogItem.name,
        catalogItem.category,
        ...(catalogItem.keywords ?? []),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    }
    return catalogItem.category === category;
  }), [category, normalizedQuery]);

  const exactMatch = useMemo(
    () => PANTRY_CATALOG.some((catalogItem) => catalogItem.name.toLowerCase() === normalizedQuery),
    [normalizedQuery],
  );

  const toggle = (catalogItem: PantryCatalogItem) => {
    setSelected((current) => {
      if (current[catalogItem.id]) {
        const next = { ...current };
        delete next[catalogItem.id];
        return next;
      }
      return {
        ...current,
        [catalogItem.id]: {
          catalog: catalogItem,
          quantity: 1,
          unit: catalogItem.defaultUnit ?? 'unit',
          status: defaultStatus,
          storeId: defaultStoreId,
        },
      };
    });
  };

  const updateSelected = (id: string, patch: Partial<Omit<SelectedItem, 'catalog'>>) => {
    setSelected((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const addCustomItem = () => {
    const name = query.trim();
    if (!name) return;
    const custom: PantryCatalogItem = {
      id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      category: 'Other',
      icon: '📦',
      defaultUnit: 'unit',
    };
    toggle(custom);
  };

  const submitLabel = selectedItems.length === 0
    ? 'Select items'
    : selectedItems.length === 1
      ? 'Add 1 item'
      : `Add ${selectedItems.length} items`;

  return (
    <Sheet visible={visible} title={title} onClose={close}>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search groceries, kitchen, cleaning…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {PANTRY_CATEGORIES.map((option) => {
          const active = category === option;
          return (
            <Pressable
              key={option}
              onPress={() => setCategory(option)}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.catalogHeader}>
        <Text style={styles.sectionTitle}>Catalog</Text>
        <Text style={styles.count}>{filteredCatalog.length} items</Text>
      </View>
      {filteredCatalog.length ? (
        <View style={styles.catalogGrid}>
          {filteredCatalog.map((catalogItem) => {
            const active = !!selected[catalogItem.id];
            return (
              <Pressable
                key={catalogItem.id}
                onPress={() => toggle(catalogItem)}
                style={[styles.catalogItem, active && styles.catalogItemActive]}
              >
                <ItemAvatar name={catalogItem.name} size={40} />
                <View style={styles.catalogText}>
                  <Text style={styles.catalogName} numberOfLines={1}>{catalogItem.name}</Text>
                  <Text style={styles.catalogCategory} numberOfLines={1}>{catalogItem.category}</Text>
                </View>
                <MaterialCommunityIcons
                  name={active ? 'check-circle' : 'plus-circle-outline'}
                  size={20}
                  color={active ? colors.primary : colors.muted}
                />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptySearch}>
          <Ionicons name="search-outline" size={26} color={colors.muted} />
          <Text style={styles.emptyTitle}>No catalog matches</Text>
          <Text style={styles.hint}>Try another search or add this as a custom item.</Text>
        </View>
      )}

      {query.trim().length >= 3 && !exactMatch ? (
        <Button
          label={`Add “${query.trim()}” as custom item`}
          variant="subtle"
          onPress={addCustomItem}
          style={{ marginBottom: spacing.lg }}
        />
      ) : null}

      {selectedItems.length ? (
        <>
          <View style={styles.selectedHeader}>
            <Text style={styles.sectionTitle}>Selected items</Text>
            <Text style={styles.selectedCount}>{selectedItems.length}</Text>
          </View>
          {selectedItems.map(({ catalog, quantity, storeId }) => (
            <View key={catalog.id} style={styles.selectedCard}>
              <View style={styles.selectedTop}>
                <ItemAvatar name={catalog.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{catalog.name}</Text>
                  <Text style={styles.catalogCategory}>{catalog.category}</Text>
                </View>
                <Pressable onPress={() => toggle(catalog)} hitSlop={8} style={styles.remove}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
                <View style={styles.quantity}>
                  <Pressable
                    onPress={() => updateSelected(catalog.id, { quantity: Math.max(1, quantity - 1) })}
                    hitSlop={6}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="remove" size={16} color={colors.ink} />
                  </Pressable>
                  <Text style={styles.quantityValue}>×{quantity}</Text>
                  <Pressable
                    onPress={() => updateSelected(catalog.id, { quantity: quantity + 1 })}
                    hitSlop={6}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="add" size={16} color={colors.ink} />
                  </Pressable>
                </View>
              </View>
              {!hideStorePicker && storeOptions.length ? (
                <ChipSelect
                  label="Buy at store"
                  options={storeOptions}
                  value={storeId}
                  onChange={(value) => updateSelected(catalog.id, { storeId: value })}
                />
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      <Button
        label={submitLabel}
        onPress={submit}
        disabled={!selectedItems.length}
        style={styles.submit}
      />
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    subtitle: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.muted,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
    },
    search: {
      height: 48,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: 14,
    },
    categories: { gap: spacing.sm, paddingBottom: spacing.lg },
    categoryChip: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryChipText: { color: colors.muted, fontFamily: fonts.sansSemibold, fontSize: 12 },
    categoryChipTextActive: { color: colors.onPrimary },
    catalogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    sectionTitle: { fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink },
    count: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
    catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    catalogItem: {
      width: '48.5%',
      minHeight: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    catalogItemActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    catalogIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catalogEmoji: { fontSize: 19 },
    catalogText: { flex: 1, minWidth: 0 },
    catalogName: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.ink },
    catalogCategory: { fontFamily: fonts.sans, fontSize: 10, color: colors.muted, marginTop: 2 },
    emptySearch: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      marginBottom: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    emptyTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    hint: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    selectedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    selectedCount: {
      minWidth: 24,
      textAlign: 'center',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.primarySoft,
      color: colors.primary,
      fontFamily: fonts.mono,
      fontSize: 11,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    selectedCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    selectedTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    selectedEmoji: { fontSize: 25 },
    selectedName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    remove: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.dangerSoft,
    },
    quantity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    quantityButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quantityValue: {
      minWidth: 28,
      textAlign: 'center',
      fontFamily: fonts.mono,
      fontSize: 12,
      color: colors.ink,
    },
    submit: { marginTop: spacing.md, marginBottom: spacing.sm },
  });
}
