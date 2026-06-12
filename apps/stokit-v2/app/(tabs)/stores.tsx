import React, { useState, useMemo, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Image, Linking, Platform, ActionSheetIOS } from 'react-native';
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
import { isCurrentlyOpen } from '../../lib/openingHours';
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
  const updateStore = useDurableStore((s) => s.updateStore);
  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const fetchedHoursRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
    if (!apiKey) return;

    stores.forEach((store) => {
      if (
        fetchedHoursRef.current.has(store.id) ||
        store.openingHours !== undefined ||
        !store.lat ||
        !store.lng
      ) return;

      fetchedHoursRef.current.add(store.id);

      const url = `https://api.geoapify.com/v2/places?categories=commercial&filter=circle:${store.lng},${store.lat},100&limit=1&apiKey=${apiKey}`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const f = data.features?.[0];
          if (f?.properties?.opening_hours) {
            updateStore(store.id, { openingHours: f.properties.opening_hours });
          } else {
            // Empty string = checked but no data; badge stays hidden (not "Closed")
            updateStore(store.id, { openingHours: '' });
          }
        })
        .catch(() => {
          fetchedHoursRef.current.delete(store.id);
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const countFor = (storeId: string) =>
    items.filter((i) => i.storeId === storeId).length;

  const handleDirections = async (store: Store) => {
    if (!store.lat || !store.lng) {
      Alert.alert('Location Missing', 'This store does not have precise GPS coordinates saved.');
      return;
    }
    const latLng = `${store.lat},${store.lng}`;
    const label = encodeURIComponent(store.name);
    
    // Platform-specific native map schemes
    const nativeUrl = Platform.select({
      ios: `maps:0,0?q=${label}@${latLng}`,
      android: `geo:0,0?q=${latLng}(${label})`
    });
    const browserUrl = `https://www.google.com/maps/search/?api=1&query=${latLng}`;

    if (nativeUrl) {
      try {
        const supported = await Linking.canOpenURL(nativeUrl);
        if (supported) {
          await Linking.openURL(nativeUrl);
          return;
        }
      } catch (err) {
        console.log('Failed to open native map app:', err);
      }
    }
    
    // Fallback to browser
    Linking.openURL(browserUrl).catch(() => {
      Alert.alert('Error', 'Could not open maps.');
    });
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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
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
        </Screen>
        <Fab onPress={() => setAddOpen(true)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <PageTitle eyebrow="Where you shop" title="Stores" />
        <View style={{ gap: spacing.md }}>
          {stores.map((store) => (
          <Card key={store.id} style={styles.cardContainer}>
            <View style={styles.cardPressable}>
              <View style={styles.storeHeader}>
                <Pressable 
                  style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: spacing.md }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleDirections(store)}
                >
                  <StoreChip name={store.name} emoji={store.logoEmoji} color={store.logoColor} size={48} />
                  <View style={styles.storeHeaderText}>
                    <Text style={styles.name}>{store.name}</Text>
                    {store.address ? (
                      <Text style={styles.address} numberOfLines={1}>
                        {store.address}
                      </Text>
                    ) : null}
                    
                    <View style={styles.statsAndStatusRow}>
                      <View style={styles.statsBadge}>
                        <Ionicons name="basket-outline" size={14} color={colors.muted} />
                        <Text style={styles.meta}>
                          {countFor(store.id)} item{countFor(store.id) === 1 ? '' : 's'}
                        </Text>
                      </View>

                      {(() => {
                        let openStatus = store.openingHours ? isCurrentlyOpen(store.openingHours) : null;
                        if (openStatus === null && store.isOpen !== undefined) {
                          openStatus = store.isOpen;
                        }
                        if (openStatus === null) return null;
                        return (
                          <View style={[styles.hoursBadge, openStatus ? styles.hoursBadgeOpen : styles.hoursBadgeClosed]}>
                            <View style={[styles.statusDot, openStatus ? styles.statusDotOpen : styles.statusDotClosed]} />
                            <Text style={[styles.hoursText, openStatus ? styles.hoursTextOpen : styles.hoursTextClosed]}>
                              {openStatus ? 'Open' : 'Closed'}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </Pressable>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.sm }}>
                  <Pressable hitSlop={12} onPress={() => handleDirections(store)}>
                    <Ionicons name="navigate" size={18} color={colors.primary} style={{ opacity: 0.8 }} />
                  </Pressable>
                  <Pressable
                    hitSlop={12}
                    style={styles.moreButton}
                    onPress={() => {
                      if (Platform.OS === 'ios') {
                         ActionSheetIOS.showActionSheetWithOptions(
                           {
                             options: ['Cancel', 'Edit Store', 'Remove Store'],
                             cancelButtonIndex: 0,
                             destructiveButtonIndex: 2,
                           },
                           (buttonIndex) => {
                             if (buttonIndex === 1) setEditStore(store);
                             if (buttonIndex === 2) handleDelete(store);
                           }
                         );
                      } else {
                         Alert.alert(
                           store.name,
                           'Manage this store',
                           [
                             { text: 'Cancel', style: 'cancel' },
                             { text: 'Edit', onPress: () => setEditStore(store) },
                             { text: 'Remove', style: 'destructive', onPress: () => handleDelete(store) },
                           ]
                         );
                      }
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            </View>
          </Card>
        ))}
        </View>

        <AddStoreSheet visible={addOpen} onClose={() => setAddOpen(false)} />
        <EditStoreSheet store={editStore} onClose={() => setEditStore(null)} />
      </Screen>
      <Fab onPress={() => setAddOpen(true)} />
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    cardContainer: { 
      padding: 0, 
      overflow: 'hidden',
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    cardPressable: {
      padding: spacing.lg,
    },
    storeHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    storeHeaderText: {
      flex: 1,
    },
    moreButton: {
      padding: 4,
    },
    name: { 
      fontFamily: fonts.sansSemibold, 
      fontSize: 18, 
      color: colors.ink,
      letterSpacing: -0.3,
    },
    address: { 
      fontFamily: fonts.sans, 
      fontSize: 13, 
      color: colors.muted, 
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    statsAndStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    statsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    meta: { 
      fontFamily: fonts.monoMedium, 
      fontSize: 13, 
      color: colors.muted 
    },
    hoursBadge: { 
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    hoursBadgeOpen: {},
    hoursBadgeClosed: {},
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusDotOpen: { backgroundColor: '#16A34A' },
    statusDotClosed: { backgroundColor: '#DC2626' },
    hoursText: { fontSize: 13, fontFamily: fonts.sansMedium },
    hoursTextOpen: { color: '#16A34A' },
    hoursTextClosed: { color: '#DC2626' },
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
