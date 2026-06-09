import React, { useState, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Image, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle, StoreChip } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { Fab } from '../../components/shared/Fab';
import { AddStoreSheet } from '../../components/stores/AddStoreSheet';
import { Sheet } from '../../components/shared/Sheet';
import { TextField, FieldLabel } from '../../components/shared/Field';
import { Button } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import type { Store } from '../../types';

const LOGO_COLORS = ['#C0392B', '#E8913E', '#D8A24A', '#3D7A53', '#2E6DA4', '#6C5CE7', '#444'];
const EMOJIS = ['🛒', '🏬', '🥕', '🧀', '🍞', '🐟', '🍎', '🛍️'];

function EditStoreSheet({
  store,
  onClose,
}: {
  store: Store | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const updateStore = useDurableStore((s) => s.updateStore);
  const styles = useMemo(() => makeEditStyles(colors), [colors]);

  const [name, setName] = useState(store?.name ?? '');
  const [color, setColor] = useState(store?.logoColor ?? LOGO_COLORS[1]);
  const [emoji, setEmoji] = useState<string | undefined>(store?.logoEmoji);

  // Sync local state when store changes (sheet opened for a different store)
  React.useEffect(() => {
    if (store) {
      setName(store.name);
      setColor(store.logoColor ?? LOGO_COLORS[1]);
      setEmoji(store.logoEmoji);
    }
  }, [store?.id]);

  const submit = () => {
    if (!store || !name.trim()) return;
    updateStore(store.id, { name: name.trim(), logoColor: color, logoEmoji: emoji });
    onClose();
  };

  return (
    <Sheet visible={store !== null} title="Edit store" onClose={onClose}>
      <TextField
        label="Store name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Target, Aldi, Whole Foods"
      />

      <View style={{ height: spacing.sm }} />
      <FieldLabel>Logo color</FieldLabel>
      <View style={styles.swatchRow}>
        {LOGO_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
          />
        ))}
      </View>

      <View style={{ height: spacing.lg }} />
      <FieldLabel>Icon (optional)</FieldLabel>
      <View style={styles.swatchRow}>
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => setEmoji(emoji === e ? undefined : e)}
            style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
          >
            <Text style={{ fontSize: 20 }}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <Button label="Save changes" onPress={submit} disabled={!name.trim()} style={{ marginTop: spacing.lg }} />
    </Sheet>
  );
}

export default function StoresScreen() {
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const deleteStore = useDurableStore((s) => s.deleteStore);
  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const countFor = (storeId: string) =>
    items.filter((i) => i.storeId === storeId).length;

  const handleDirections = (store: Store) => {
    if (!store.lat || !store.lng) return;
    const latLng = `${store.lat},${store.lng}`;
    const label = encodeURIComponent(store.name);
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latLng}`);
      });
    }
  };

  const handleDelete = (store: Store) => {
    const count = countFor(store.id);
    const itemNote = count > 0
      ? `\n\n${count} item${count === 1 ? '' : 's'} will be unassigned (not deleted).`
      : '';
    Alert.alert(
      `Remove "${store.name}"?`,
      `This store will be permanently removed.${itemNote}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteStore(store.id),
        },
      ]
    );
  };

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
          <Card key={store.id} style={styles.cardContainer}>
            <View style={styles.row}>
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

              {/* Action buttons */}
              <View style={styles.actions}>
                <Pressable
                  hitSlop={8}
                  onPress={() => setEditStore(store)}
                  style={styles.actionBtn}
                  accessibilityLabel={`Edit ${store.name}`}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.primary} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => handleDelete(store)}
                  style={[styles.actionBtn, styles.deleteBtn]}
                  accessibilityLabel={`Delete ${store.name}`}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.danger ?? '#C0392B'} />
                </Pressable>
              </View>
            </View>

            {/* Static Map & Directions */}
            {store.lat && store.lng ? (
              <Pressable
                style={styles.mapContainer}
                onPress={() => handleDirections(store)}
              >
                <Image
                  source={{
                    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${store.lat},${store.lng}&zoom=15&size=600x200&scale=2&markers=color:red%7C${store.lat},${store.lng}&key=${process.env.EXPO_PUBLIC_GOOGLE_API_KEY || ''}`
                  }}
                  style={styles.mapImage}
                />
                <View style={styles.directionsOverlay}>
                  <Ionicons name="navigate" size={14} color="#FFF" />
                  <Text style={styles.directionsText}>Directions</Text>
                </View>
              </Pressable>
            ) : null}
          </Card>
        ))}
      </View>

      <AddStoreSheet visible={addOpen} onClose={() => setAddOpen(false)} />
      <EditStoreSheet store={editStore} onClose={() => setEditStore(null)} />
      <Fab onPress={() => setAddOpen(true)} />
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    cardContainer: { padding: 0, overflow: 'hidden' },
    row:       { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
    name:      { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink },
    meta:      { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
    address:   { fontFamily: fonts.sans, fontSize: 11, color: colors.faintText, marginTop: 2 },
    actions:   { flexDirection: 'row', gap: spacing.sm },
    actionBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1, borderColor: colors.border,
    },
    deleteBtn: {
      borderColor: (colors as any).dangerSoft ?? colors.border,
    },
    mapContainer: {
      height: 100,
      width: '100%',
      backgroundColor: colors.surfaceRaised,
      position: 'relative',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    mapImage: {
      width: '100%',
      height: '100%',
    },
    directionsOverlay: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    directionsText: {
      color: '#FFF',
      fontFamily: fonts.sansSemibold,
      fontSize: 12,
    },
  });
}

function makeEditStyles(colors: AppColors) {
  return StyleSheet.create({
    swatchRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch:         { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
    swatchActive:   { borderColor: colors.ink },
    emojiBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emojiBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  });
}
