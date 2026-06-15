/**
 * Shows real nearby stores via OpenStreetMap (no API key).
 * Upgrades to Google Places automatically when EXPO_PUBLIC_GOOGLE_API_KEY is set.
 *
 * Two modes:
 *  - Browse (searchTerm undefined): load all nearby stores, live-filter with search bar
 *  - Name search (searchTerm = "Target"): immediately search for that name nearby
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../shared/Sheet';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import {
  findNearbyStores,
  searchNearbyStoresByName,
  formatDistance,
  type NearbyStore,
} from '../../core/services/places';

type Phase = 'permission' | 'locating' | 'loading' | 'results' | 'error';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (store: NearbyStore) => void;
  /** When set, immediately search for this store name instead of browsing all nearby. */
  searchTerm?: string;
}

export function NearbyStorePicker({ visible, onClose, onSelect, searchTerm }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [phase, setPhase]       = useState<Phase>('permission');
  const [allStores, setAllStores] = useState<NearbyStore[]>([]);
  const [filter, setFilter]     = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!visible) { setFilter(''); return; }
    // Pre-fill the filter bar with the search term
    setFilter(searchTerm ?? '');
    void run(searchTerm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, searchTerm]);

  async function run(initialSearch?: string) {
    setAllStores([]);
    setErrorMsg('');
    setPhase('permission');

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Location permission is required to find nearby stores.');
      setPhase('error');
      return;
    }

    setPhase('locating');
    let loc: Location.LocationObject;
    try {
      loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch {
      setErrorMsg('Could not determine your location. Try again.');
      setPhase('error');
      return;
    }

    locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setPhase('loading');

    let results: NearbyStore[];
    if (initialSearch?.trim()) {
      // Name-first search — finds stores matching the typed name
      results = await searchNearbyStoresByName(
        loc.coords.latitude, loc.coords.longitude, initialSearch.trim(),
      );
    } else {
      // Browse all nearby stores
      results = await findNearbyStores(loc.coords.latitude, loc.coords.longitude);
    }

    if (results.length === 0) {
      setErrorMsg(
        initialSearch?.trim()
          ? `No "${initialSearch}" stores found nearby. Try a different name or browse all.`
          : 'No stores found within 5 miles. Check your location or add one manually.',
      );
      setPhase('error');
      return;
    }

    setAllStores(results);
    setPhase('results');
  }

  const handleSearch = async () => {
    if (!filter.trim() || !locationRef.current) return;
    setPhase('loading');
    const results = await searchNearbyStoresByName(
      locationRef.current.lat, locationRef.current.lng, filter.trim(),
    );
    if (results.length === 0) {
      setErrorMsg(`No "${filter}" stores found nearby.`);
      setPhase('error');
      return;
    }
    setAllStores(results);
    setPhase('results');
  };

  // Client-side filter on top of loaded results
  const displayed = filter.trim()
    ? allStores.filter((s) =>
        s.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : allStores;

  return (
    <Sheet visible={visible} title="Nearby stores" onClose={onClose}>
      {/* Search bar — always visible once location is available */}
      {(phase === 'results' || phase === 'error' || phase === 'loading') && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name (Target, Aldi…)"
            placeholderTextColor={colors.muted}
            value={filter}
            onChangeText={setFilter}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="words"
          />
          {filter.trim().length >= 2 && (
            <Pressable onPress={handleSearch} hitSlop={8}>
              <Ionicons name="arrow-forward-circle" size={22} color={colors.primary} />
            </Pressable>
          )}
        </View>
      )}

      {/* Main content */}
      {phase === 'permission' || phase === 'locating' || phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerBody}>
            {phase === 'permission' ? 'Requesting location…'
              : phase === 'locating' ? 'Getting your location…'
              : 'Finding stores…'}
          </Text>
        </View>
      ) : phase === 'error' ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.centerBody}>{errorMsg}</Text>
          <Pressable onPress={() => void run(filter || undefined)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
          {filter.trim() && (
            <Pressable
              onPress={() => { setFilter(''); void run(); }}
              style={[styles.retryBtn, { marginTop: spacing.sm }]}
            >
              <Text style={styles.retryText}>Browse all nearby stores</Text>
            </Pressable>
          )}
        </View>
      ) : displayed.length === 0 && filter.trim() ? (
        <View style={styles.center}>
          <Text style={styles.centerBody}>
            No results for "{filter}" in the loaded list.
          </Text>
          <Pressable onPress={handleSearch} style={styles.retryBtn}>
            <Text style={styles.retryText}>Search OpenStreetMap for "{filter}"</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(s) => s.placeId}
          scrollEnabled={false}
          keyboardShouldPersistTaps="always"
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <StoreRow store={item} onPress={() => { onSelect(item); onClose(); }} />
          )}
          ListFooterComponent={<View style={{ height: spacing.huge ?? 48 }} />}
        />
      )}
    </Sheet>
  );
}

function StoreRow({ store, onPress }: { store: NearbyStore; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const isOpen = store.isOpen;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.logoPlaceholder}>
        <Text style={styles.logoLetter}>{store.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        {store.address ? (
          <Text style={styles.storeAddr} numberOfLines={1}>{store.address}</Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.distance}>{formatDistance(store.distanceMetres)}</Text>
          {isOpen === true  && <Text style={[styles.openLabel, { color: colors.success }]}>Open</Text>}
          {isOpen === false && <Text style={[styles.openLabel, { color: colors.danger }]}>Closed</Text>}
          {store.rating != null && (
            <Text style={styles.rating}>★ {store.rating.toFixed(1)}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      marginBottom: spacing.lg,
    },
    searchInput: {
      flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink,
      paddingVertical: 4,
    },
    center: {
      alignItems: 'center', paddingVertical: 40, gap: spacing.lg,
      paddingBottom: 60,
    },
    centerBody: {
      fontFamily: fonts.sans, fontSize: 14, color: colors.muted,
      textAlign: 'center', maxWidth: 280, lineHeight: 20,
    },
    retryBtn: {
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radii.md, backgroundColor: colors.primarySoft,
      borderWidth: 1, borderColor: colors.primary,
    },
    retryText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.primary },
    sep: { height: 1, backgroundColor: colors.borderSoft },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: spacing.lg, gap: spacing.lg,
    },
    logoPlaceholder: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    logoLetter: { fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink },
    storeName: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    storeAddr: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
    distance: { fontFamily: fonts.mono, fontSize: 12, color: colors.primary },
    openLabel: { fontFamily: fonts.sansSemibold, fontSize: 11 },
    rating: { fontFamily: fonts.mono, fontSize: 11, color: colors.gold ?? colors.primary },
  });
}
