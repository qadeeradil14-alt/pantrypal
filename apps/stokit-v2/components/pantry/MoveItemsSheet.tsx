import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { Button, StoreChip } from '../shared/ui';
import { ItemAvatar } from '../shared/ItemAvatar';
import { AddStoreContent } from '../stores/AddStoreSheet';
import { fonts, radii, spacing } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import type { PantryItem, Store } from '../../types';

export function MoveItemsSheet({
  visible,
  onClose,
  items,
  stores,
}: {
  visible: boolean;
  onClose: () => void;
  items: PantryItem[];
  stores: Store[];
}) {
  const { colors } = useTheme();
  const updateItem = useDurableStore((s) => s.updateItem);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickingStore, setPickingStore] = useState(false);
  const [addingStore, setAddingStore] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelected(new Set());
      setPickingStore(false);
      setAddingStore(false);
    }
  }, [visible]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const move = (storeId: string) => {
    selected.forEach((id) => updateItem(id, { storeId }));
    onClose();
  };

  const title = addingStore
    ? 'Add a store'
    : pickingStore
    ? 'Move to which store?'
    : 'Move items to another store';

  const handleClose = addingStore
    ? () => setAddingStore(false)
    : pickingStore
    ? () => setPickingStore(false)
    : onClose;

  return (
    <Sheet visible={visible} title={title} onClose={handleClose}>
      {addingStore ? (
        <AddStoreContent
          onClose={() => setAddingStore(false)}
          onStoreAdded={(storeId) => move(storeId)}
          isActive={visible && addingStore}
        />
      ) : pickingStore ? (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
            Moving {selected.size} item{selected.size !== 1 ? 's' : ''} — choose a destination.
          </Text>
          {stores.map((store) => (
            <Pressable
              key={store.id}
              onPress={() => move(store.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xs,
                borderRadius: radii.md,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <StoreChip name={store.name} emoji={store.logoEmoji} color={store.logoColor} size={44} />
              <Text style={{ flex: 1, fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink }}>
                {store.name}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => setAddingStore(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.lg,
              marginTop: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.borderSoft,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.primary }}>
              Add a new store
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginBottom: spacing.lg }}>
            Select the items you want to move to a different store.
          </Text>
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {items.map((item, idx) => {
              const checked = selected.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                    borderBottomColor: colors.borderSoft,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={checked ? colors.primary : colors.faintText}
                  />
                  <ItemAvatar name={item.name} size={32} />
                  <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink }}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Button
            label={selected.size > 0 ? `Next — pick a store (${selected.size})` : 'Select items above'}
            onPress={() => { if (selected.size > 0) setPickingStore(true); }}
            style={{ marginTop: spacing.lg, opacity: selected.size === 0 ? 0.45 : 1 }}
          />
        </>
      )}
    </Sheet>
  );
}
