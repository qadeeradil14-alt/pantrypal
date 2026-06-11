/**
 * StorePickerSheet — assign or change the store for a single pantry item.
 *
 * The one reusable place to put an item "on the route". Used from Pantry
 * (Needs attention / Everything else) and Shopping (unassigned warning).
 * Lists existing household stores with their assigned-item counts, lets the
 * user unassign, and supports adding a brand-new store inline.
 *
 * Pure UI over durable-store actions — never touches the shopping session.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { StoreChip } from '../shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import type { PantryItem } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { AddStoreContent } from '../stores/AddStoreSheet';

export function StorePickerSheet({
  item,
  visible,
  onClose,
  onSelect,
}: {
  /** The item to assign. If omitted, uses visible prop. */
  item?: PantryItem | null;
  /** Force the sheet open regardless of item. */
  visible?: boolean;
  onClose: () => void;
  /** Optional callback to bypass default assignment behavior */
  onSelect?: (storeId: string) => void;
}) {
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const updateItem = useDurableStore((s) => s.updateItem);

  const [addOpen, setAddOpen] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const countFor = (storeId: string) =>
    items.filter((i) => i.storeId === storeId).length;

  const assign = (storeId: string | null) => {
    if (onSelect && storeId) {
      onSelect(storeId);
      close();
      return;
    }
    if (!item) return;
    updateItem(item.id, { storeId });
    close();
  };

  const close = () => {
    setAddOpen(false);
    onClose();
  };

  const isOpen = visible !== undefined ? visible : !!item;

  return (
    <Sheet visible={isOpen} title={addOpen ? "Add a store" : "Assign a store"} onClose={addOpen ? () => setAddOpen(false) : close}>
      {addOpen ? (
        <AddStoreContent
          onClose={() => setAddOpen(false)}
          onStoreAdded={(storeId) => assign(storeId)}
          isActive={isOpen && addOpen}
        />
      ) : (
        <>
          {item ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              Where do you buy {item.name}?
            </Text>
          ) : null}

          {stores.map((store) => {
            const active = item?.storeId === store.id;
            return (
              <Pressable
                key={store.id}
                onPress={() => assign(store.id)}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <StoreChip name={store.name} emoji={store.logoEmoji} color={store.logoColor} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{store.name}</Text>
                  <Text style={styles.meta}>
                    {countFor(store.id)} item{countFor(store.id) === 1 ? '' : 's'} assigned
                  </Text>
                </View>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                )}
              </Pressable>
            );
          })}

          {/* Unassign — only when the item currently has a store */}
          {item?.storeId ? (
            <Pressable
              onPress={() => assign(null)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.iconChip, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </View>
              <Text style={[styles.name, { flex: 1, color: colors.muted }]}>Remove from store</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setAddOpen(true)}
            style={({ pressed }) => [styles.addNew, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.addNewText}>Add a new store</Text>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    subtitle: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.muted,
      marginBottom: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
    },
    rowActive: { backgroundColor: colors.primarySoft },
    iconChip: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    name: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    meta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 2 },
    addBox: {
      marginTop: spacing.md,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      gap: spacing.sm,
    },
    addNew: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    addNewText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.primary },
  });
}
