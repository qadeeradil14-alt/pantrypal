import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View, Image, Linking, Platform, ActionSheetIOS, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
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
import { geocodeLocation } from '../../core/services/places';
import { hasValidStoreCoordinates, storeBackfillQuery } from '../../core/services/storeCoordinates';
import { dedupeStoresForDisplay } from '../../core/services/storeDuplicates';
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  const router = useRouter();
  const { fixLocationStoreId, fixLocationRequest } = useGlobalSearchParams<{
    fixLocationStoreId?: string;
    fixLocationRequest?: string;
  }>();
  const { colors } = useTheme();
  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const deleteStore = useDurableStore((s) => s.deleteStore);
  const updateStore = useDurableStore((s) => s.updateStore);
  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [locationRecoveryStore, setLocationRecoveryStore] = useState<Store | null>(null);
  const backfillInFlightRef = useRef(new Set<string>());
  const handledFixLocationRef = useRef<string | null>(null);
  // Live open/closed status — fetched fresh from Google on every tab focus, never persisted
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean | undefined>>({});

  // Records that reached this device already duplicated (see dedupeStoresForDisplay)
  // are collapsed for rendering only — `stores` itself is untouched, so every
  // storeId held by an item, trip or receipt still resolves.
  const { stores: visibleStores, canonicalIdFor } = useMemo(
    () => dedupeStoresForDisplay(stores),
    [stores],
  );

  useFocusEffect(
    useCallback(() => {
      const googleKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
      if (!googleKey) return;

      visibleStores.forEach((store) => {
        if (!store.placeId) return;
        const params = new URLSearchParams({
          place_id: store.placeId,
          fields: 'opening_hours',
          key: googleKey,
        });
        fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
          headers: { 'X-Ios-Bundle-Identifier': 'com.hewadadil.pantrypal' },
        })
          .then((r) => r.json())
          .then((data) => {
            const openNow: boolean | undefined = data.result?.opening_hours?.open_now;
            if (openNow !== undefined) {
              setLiveStatus((prev) => ({ ...prev, [store.id]: openNow }));
            }
          })
          .catch(() => {});
      });
    }, [visibleStores])
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      if (!fixLocationStoreId || !fixLocationRequest || handledFixLocationRef.current === fixLocationRequest) return;
      const store = stores.find((candidate) => candidate.id === fixLocationStoreId);
      if (!store) return;
      handledFixLocationRef.current = fixLocationRequest;
      setLocationRecoveryStore(store);
      setAddOpen(true);
      router.setParams({ fixLocationStoreId: undefined, fixLocationRequest: undefined });
    }, [fixLocationRequest, fixLocationStoreId, router, stores]),
  );

  // Count against the surviving card, so items still pointing at a collapsed
  // duplicate are reported on the store the user can actually see.
  const countFor = (storeId: string) =>
    items.filter((i) => i.storeId && canonicalIdFor.get(i.storeId) === storeId).length;

  const openDirections = async (name: string, lat: number, lng: number) => {
    const latLng = `${lat},${lng}`;
    const label = encodeURIComponent(name);
    
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
        if (__DEV__) console.log('Failed to open native map app:', err);
      }
    }
    
    // Fallback to browser
    Linking.openURL(browserUrl).catch(() => {
      Alert.alert('Error', 'Could not open maps.');
    });
  };

  const handleDirections = async (store: Store) => {
    const { lat, lng } = store;
    if (hasValidStoreCoordinates(lat, lng) && lat !== undefined && lng !== undefined) {
      return openDirections(store.name, lat, lng);
    }

    const query = store.address ? storeBackfillQuery(store) : '';
    if (query) {
      if (backfillInFlightRef.current.has(store.id)) return;
      backfillInFlightRef.current.add(store.id);
      try {
        const backfill = await geocodeLocation(query);
        if (backfill && hasValidStoreCoordinates(backfill.lat, backfill.lng)) {
          updateStore(store.id, { lat: backfill.lat, lng: backfill.lng });
          return openDirections(store.name, backfill.lat, backfill.lng);
        }
      } finally {
        backfillInFlightRef.current.delete(store.id);
      }
    }

    Alert.alert(
      'Location Missing',
      'We could not find a precise location for this saved store.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update location',
          onPress: () => {
            setLocationRecoveryStore(store);
            setAddOpen(true);
          },
        },
      ],
    );
  };

  const closeAddStore = () => {
    setAddOpen(false);
    setLocationRecoveryStore(null);
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
          onPress: () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            deleteStore(store.id);
          },
        },
      ]
    );
  };

  if (visibleStores.length === 0) {
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
          <AddStoreSheet visible={addOpen} onClose={closeAddStore} storeToUpdate={locationRecoveryStore} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <PageTitle eyebrow="Where you shop" title="Stores" />
        <Card style={styles.overviewCard}>
          <View style={styles.overviewIcon}>
            <Ionicons name="storefront-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>YOUR STORES</Text>
            <Text style={styles.overviewTitle}>
              {visibleStores.length} saved location{visibleStores.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.overviewMeta}>
              {items.filter((item) => item.storeId).length} assigned item{items.filter((item) => item.storeId).length === 1 ? '' : 's'}
            </Text>
          </View>
        </Card>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Saved stores</Text>
          <Text style={styles.listCount}>{visibleStores.length}</Text>
        </View>
        <View style={{ gap: spacing.md }}>
          {visibleStores.map((store) => (
          <Card key={store.id} style={styles.cardContainer}>
            <View style={styles.cardPressable}>
              <View style={styles.storeHeader}>
                <Pressable 
                  style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: spacing.md }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleDirections(store)}
                >
                  <StoreChip store={store} size={48} />
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

                      {liveStatus[store.id] !== undefined ? (
                          <View style={[styles.hoursBadge, liveStatus[store.id] ? styles.hoursBadgeOpen : styles.hoursBadgeClosed]}>
                            <View style={[styles.statusDot, liveStatus[store.id] ? styles.statusDotOpen : styles.statusDotClosed]} />
                            <Text style={[styles.hoursText, liveStatus[store.id] ? styles.hoursTextOpen : styles.hoursTextClosed]}>
                              {liveStatus[store.id] ? 'Open now' : 'Closed'}
                            </Text>
                          </View>
                        ) : null}
                    </View>
                  </View>
                </Pressable>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingLeft: spacing.sm }}>
                  <Pressable hitSlop={12} onPress={() => handleDirections(store)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="navigate" size={18} color={colors.primary} />
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

        <AddStoreSheet visible={addOpen} onClose={closeAddStore} storeToUpdate={locationRecoveryStore} />
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
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    cardPressable: {
      padding: spacing.lg,
    },
    overviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.backgroundElevated,
      borderColor: colors.primary + '24',
    },
    overviewIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overviewLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: colors.primary },
    overviewTitle: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.ink, marginTop: 2 },
    overviewMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    listHeader: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    listTitle: { flex: 1, fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: colors.ink },
    listCount: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceRaised, textAlign: 'center', paddingTop: 6, fontFamily: fonts.monoMedium, fontSize: 11, color: colors.muted },
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
      fontSize: 17,
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
    statusDotOpen: { backgroundColor: colors.success },
    statusDotClosed: { backgroundColor: colors.danger },
    hoursText: { fontSize: 13, fontFamily: fonts.sansMedium },
    hoursTextOpen: { color: colors.success },
    hoursTextClosed: { color: colors.danger },
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
