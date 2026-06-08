/**
 * Inline nearby store search — NO Modal wrapper.
 * Rendered directly inside AddStoreSheet to avoid nested-Modal issues on iOS.
 *
 * Two location sources (whichever is available first):
 *   1. Device GPS (works on real device)
 *   2. City / ZIP fallback (works in Simulator and anywhere)
 *
 * Both use the same free OSM Overpass API — no API key needed.
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import {
  findNearbyStores,
  searchNearbyStoresByName,
  geocodeLocation,
  formatDistance,
  type NearbyStore,
} from '../../core/services/places';

type Phase = 'idle' | 'locating' | 'loading' | 'results' | 'error';

interface Props {
  initialSearch?: string;
  onSelect: (store: NearbyStore) => void;
  onBack: () => void;
}

export function NearbyStoreList({ initialSearch, onSelect, onBack }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [stores, setStores]     = useState<NearbyStore[]>([]);
  const [nameQuery, setNameQuery]   = useState(initialSearch ?? '');
  const [cityQuery, setCityQuery]   = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Resolve location ──────────────────────────────────────────────────────

  async function resolveLocation(): Promise<{ lat: number; lng: number } | null> {
    // 1. If user typed a city/ZIP — geocode it
    if (cityQuery.trim()) {
      setPhase('locating');
      const geo = await geocodeLocation(cityQuery.trim());
      if (geo) {
        setLocationLabel(geo.displayName);
        return { lat: geo.lat, lng: geo.lng };
      }
      setErrorMsg(`Could not find "${cityQuery}". Try a different city or ZIP.`);
      setPhase('error');
      return null;
    }

    // 2. GPS from device
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Location permission denied. Enter a city or ZIP below to search there instead.');
      setPhase('error');
      return null;
    }
    setPhase('locating');
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationLabel('your location');
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      setErrorMsg('Could not get GPS. Enter a city or ZIP below to search there instead.');
      setPhase('error');
      return null;
    }
  }

  // ── Main search ───────────────────────────────────────────────────────────

  async function search() {
    setStores([]);
    setErrorMsg('');

    const loc = await resolveLocation();
    if (!loc) return;

    locationRef.current = loc;
    setPhase('loading');

    const results = nameQuery.trim()
      ? await searchNearbyStoresByName(loc.lat, loc.lng, nameQuery.trim(), 20000)
      : await findNearbyStores(loc.lat, loc.lng, 8000);

    if (!results.length) {
      const where = locationLabel || 'that area';
      setErrorMsg(
        nameQuery.trim()
          ? `No "${nameQuery}" stores found near ${where}. Try a different name or city.`
          : `No stores found near ${where}.`,
      );
      setPhase('error');
      return;
    }

    setStores(results);
    setPhase('results');
  }

  // Show all results — server-side search already filtered by name
  const displayed = stores;

  return (
    <View>
      {/* Back */}
      <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
        <Ionicons name="chevron-back" size={16} color={colors.primary} />
        <Text style={styles.backText}>Back to form</Text>
      </Pressable>

      {/* Store name search */}
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Store name</Text>
        <View style={styles.inputRow}>
          <Ionicons name="storefront-outline" size={16} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Target, Whole Foods, Aldi…"
            placeholderTextColor={colors.muted}
            value={nameQuery}
            onChangeText={setNameQuery}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {nameQuery.length > 0 && (
            <Pressable onPress={() => setNameQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* City / ZIP fallback — always visible */}
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>City, state or ZIP <Text style={styles.optional}>(or leave blank to use GPS)</Text></Text>
        <View style={styles.inputRow}>
          <Ionicons name="location-outline" size={16} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="e.g. Washington DC, 20001"
            placeholderTextColor={colors.muted}
            value={cityQuery}
            onChangeText={setCityQuery}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Search button */}
      <Pressable
        onPress={() => void search()}
        style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="search" size={16} color={colors.onPrimary} />
        <Text style={styles.searchBtnText}>Find stores</Text>
      </Pressable>

      {/* Results / states */}
      {phase === 'locating' || phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerText}>
            {phase === 'locating' ? 'Finding your location…' : 'Searching stores…'}
          </Text>
        </View>
      ) : phase === 'error' ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
          <Text style={styles.centerText}>{errorMsg}</Text>
        </View>
      ) : phase === 'results' && displayed.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>No match for "{nameQuery}" in results. Try adjusting the name.</Text>
        </View>
      ) : phase === 'results' ? (
        <View style={styles.resultList}>
          {locationLabel ? (
            <Text style={styles.nearLabel}>Near {locationLabel}</Text>
          ) : null}
          {displayed.map((store, idx) => (
            <View key={store.placeId}>
              {idx > 0 && <View style={styles.sep} />}
              <StoreRow store={store} onPress={() => onSelect(store)} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StoreRow({ store, onPress }: { store: NearbyStore; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>{store.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        {store.address ? <Text style={styles.storeAddr} numberOfLines={1}>{store.address}</Text> : null}
        <Text style={styles.distance}>{formatDistance(store.distanceMetres)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    backRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.lg },
    backText:  { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.primary },
  
    fieldWrap: { marginBottom: spacing.md },
    fieldLabel:{ fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.muted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
    optional:  { fontFamily: fonts.sans, fontSize: 11, color: colors.faintText, textTransform: 'none', letterSpacing: 0 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    input: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink, paddingVertical: 4 },
  
    searchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radii.lg,
      paddingVertical: 13, marginTop: spacing.sm, marginBottom: spacing.xl,
    },
    searchBtnText: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.onPrimary },
  
    center:    { alignItems: 'center', paddingVertical: 28, gap: spacing.lg },
    centerText:{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  
    resultList:{ marginTop: spacing.sm },
    nearLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.6 },
    sep:  { height: 1, backgroundColor: colors.borderSoft },
    row:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
    avatar: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarLetter:{ fontFamily: fonts.serifItalic, fontSize: 18, color: colors.ink },
    storeName:   { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    storeAddr:   { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    distance:    { fontFamily: fonts.mono, fontSize: 12, color: colors.primary, marginTop: 3 },
  });
}
