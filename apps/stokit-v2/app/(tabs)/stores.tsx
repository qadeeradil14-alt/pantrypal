import React, { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { Fab } from '../../components/shared/Fab';
import { AddStoreSheet } from '../../components/stores/AddStoreSheet';
import { fonts, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';

export default function StoresScreen() {
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const deleteStore = useDurableStore((s) => s.deleteStore);
  const [addOpen, setAddOpen] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const countFor = (storeId: string) =>
    items.filter((i) => i.storeId === storeId).length;

  if (stores.length === 0) {
    return (
      <Screen>
        <PageTitle eyebrow="Where you shop" title="Stores" />
        <EmptyState
          icon="storefront-outline"
          title="No stores yet"
          body="Add the stores you shop at. You'll assign pantry items to them so shopping trips group everything by store."
          ctaLabel="Add your first store"
          onCta={() => setAddOpen(true)}
          steps={['Name your store', 'Pick a color or icon', 'Assign items when you add them']}
        />
        <AddStoreSheet visible={addOpen} onClose={() => setAddOpen(false)} />
        <Fab onPress={() => setAddOpen(true)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle eyebrow="Where you shop" title="Stores" />
      <View style={{ gap: spacing.md }}>
        {stores.map((store) => (
          <Card key={store.id} style={styles.row}>
            <StoreChip name={store.name} emoji={store.logoEmoji} color={store.logoColor} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{store.name}</Text>
              <Text style={styles.meta}>
                {countFor(store.id)} item{countFor(store.id) === 1 ? '' : 's'} assigned
              </Text>
              {store.address ? (
                <Text style={styles.address} numberOfLines={1}>
                  📍 {store.address}
                </Text>
              ) : null}
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => deleteStore(store.id)}
              style={styles.delete}
            >
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
            </Pressable>
          </Card>
        ))}
      </View>

      <AddStoreSheet visible={addOpen} onClose={() => setAddOpen(false)} />
      <Fab onPress={() => setAddOpen(true)} />
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    name: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink },
    meta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
    address: { fontFamily: fonts.sans, fontSize: 11, color: colors.faintText, marginTop: 2 },
    delete: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
}
