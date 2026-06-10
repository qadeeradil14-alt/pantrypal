import { useEffect, useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import {
  addStoreWithQueue, addStoreFromPlace, searchNearbyStores, searchStoreBrands,
  extractAddressState, normalizeUSState,
  PRESET_STORES, type Store, type StoreBrand, type StorePlace,
} from '../lib/stores';
import { geocodeLocation, haversineDistanceMiles, MAX_STORE_SEARCH_DISTANCE_MILES, type GeoAnchor } from '../lib/storeSearch';
import { isCurrentlyOpen } from '../lib/openingHours';
import { hapticError, hapticSelection, hapticSuccess } from '../lib/haptics';
import { useTheme } from '../hooks/useTheme';
import { fonts, radii } from '../constants/theme';
import type { AppColors } from '../constants/theme';
import { makeSheetStyles } from '../constants/sheetStyles';
import ScalePressable from './ScalePressable';
import StoreLogo from './StoreLogo';

interface Props {
  householdId: string;
  existingStores: Store[];
  onAdd: (store: Store) => void;
  onClose: () => void;
}

export default function AddStoreModal({ householdId, existingStores, onAdd, onClose }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [mapQuery, setMapQuery] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [places, setPlaces] = useState<StorePlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<StorePlace | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [geocodedPlace, setGeocodedPlace] = useState<StorePlace | null>(null);
  const [brands, setBrands] = useState<StoreBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<StoreBrand | null>(null);
  /**
   * The resolved lat/lon + stateCode for the ZIP/city the user typed.
   * Captured during openNearbyPicker and used to validate save-time results.
   */
  const [searchAnchor, setSearchAnchor] = useState<GeoAnchor | null>(null);

  const placeCardWidth = Math.min(320, Math.max(236, width - 112));
  const styles = useMemo(() => makeStyles(colors, placeCardWidth), [colors, placeCardWidth]);
  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);

  const existingNames = useMemo(() => existingStores.map((s) => s.name.toLowerCase()), [existingStores]);
  const presets = PRESET_STORES.filter((p) => !existingNames.includes(p.toLowerCase()));

  function resetCustomSection() {
    setName('');
    setSelectedBrand(null);
    setBrands([]);
    setError('');
  }

  useEffect(() => {
    const q = name.trim();
    if (q.length < 2 || selectedBrand) {
      setBrands([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchStoreBrands(q)
        .then((found) => { if (active) setBrands(found.filter((brand) => !existingNames.includes(brand.name.toLowerCase()))); })
        .catch(() => { if (active) setBrands([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [existingNames, name, selectedBrand]);

  async function openNearbyPicker(storeName: string) {
    const trimmed = storeName.trim();
    if (!trimmed) return;
    if (!zipCode.trim()) {
      setError('Enter a zip, city, or address first so we can search nearby.');
      void hapticError();
      return;
    }
    setSearching(true);
    setError('');
    setMapQuery(trimmed);
    setGeocodedPlace(null);
    setManualAddress('');
    setBrands([]);
    setSelectedBrand(null);
    // Resolve anchor (lat/lon + state) for the location text the user typed.
    // This is used both to drive the search and to validate results before saving.
    const anchor = await geocodeLocation(zipCode.trim());
    setSearchAnchor(anchor);
    // Track whether we already set a meaningful error so we don't overwrite it
    // with the empty-string clear below (React state is async — stale closure).
    let anchorErrorSet = false;
    if (!anchor && zipCode.trim()) {
      setError("We couldn't confirm that location. Try city + state or use your current location.");
      anchorErrorSet = true;
    }
    try {
      const found = await searchNearbyStores(trimmed, zipCode.trim() || undefined);
      setPlaces(found);
      setSelectedPlace(null);
      if (found.length === 0) {
        if (!anchorErrorSet) setError('');
        if (zipCode.trim()) setManualAddress(zipCode.trim());
      }
    } catch (e: any) {
      setPlaces([]);
      setSelectedPlace(null);
      if (String(e?.message ?? '').toLowerCase().includes('location permission')) {
        setMapQuery('');
        setError('Location is off. Enter an address below to add this store manually.');
      } else {
        setError(e.message ?? 'Could not search nearby stores.');
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleGeocodeManual() {
    const trimmed = manualAddress.trim();
    if (!trimmed) return;
    setGeocoding(true);
    setError('');
    try {
      const Location = await import('expo-location');
      let lat: number | null = null;
      let lon: number | null = null;

      try {
        const native = await Location.geocodeAsync(`${trimmed}`);
        if (native.length > 0) {
          lat = native[0].latitude;
          lon = native[0].longitude;
        }
      } catch { /* fallback below */ }

      if (!lat || !lon) {
        const encoded = encodeURIComponent(trimmed);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`,
          { headers: { 'User-Agent': 'Stokit/1.0', Accept: 'application/json' } },
        );
        const results = await res.json();
        if (results.length > 0) {
          lat = parseFloat(results[0].lat);
          lon = parseFloat(results[0].lon);
        }
      }

      if (!lat || !lon) {
        setError("Couldn't find that address. Double-check it and try again.");
        return;
      }

      const place: StorePlace = {
        name: mapQuery || name.trim(),
        address: trimmed,
        latitude: lat,
        longitude: lon,
      };
      setGeocodedPlace(place);
      setSelectedPlace(place);
      setPlaces([place]);
      setError('');
      void hapticSuccess();
    } catch {
      setError("Couldn't look up that address. Please try again.");
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSave(storeName: string, storeAddress?: string, allowNoLocation = false) {
    if (existingNames.includes(storeName.toLowerCase())) {
      setError(`"${storeName}" is already in your stores.`);
      void hapticError();
      return;
    }
    if (!storeAddress?.trim() && !allowNoLocation) {
      await openNearbyPicker(storeName);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { store, queued } = await addStoreWithQueue(householdId, storeName, storeAddress, selectedBrand, allowNoLocation);
      resetCustomSection();
      onAdd(store);
      if (queued) setError("Saved offline — will sync when you're back online.");
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePlace(place: StorePlace) {
    // ── Save-time validation ─────────────────────────────────────────────────
    // Guard 1: coordinates must be present.
    if (!place.latitude || !place.longitude) {
      setError('This store is missing location data. Try searching again.');
      void hapticError();
      return;
    }

    // Guard 2: distance from search anchor must stay within the expanded search radius.
    if (searchAnchor) {
      const miles = haversineDistanceMiles(
        searchAnchor.lat, searchAnchor.lon,
        place.latitude, place.longitude,
      );
      if (miles > MAX_STORE_SEARCH_DISTANCE_MILES) {
        setError('This store appears outside your search area. Try searching again with city and state.');
        void hapticError();
        return;
      }

      // Guard 3: state must match when anchor has a state code.
      if (searchAnchor.stateCode) {
        const placeState = normalizeUSState(extractAddressState(place.address));
        if (placeState && placeState !== searchAnchor.stateCode) {
          setError(`This store is in ${placeState}, not ${searchAnchor.stateCode}. Try searching again with city and state.`);
          void hapticError();
          return;
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    setSaving(true);
    setError('');
    try {
      const store = await addStoreFromPlace(householdId, place, selectedBrand);
      resetCustomSection();
      onAdd(store);
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  const mapRegion = useMemo(() => {
    if (places.length === 0) {
      return selectedPlace
        ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }
        : { latitude: 37.0902, longitude: -95.7129, latitudeDelta: 40, longitudeDelta: 40 };
    }
    if (places.length === 1) {
      return { latitude: places[0].latitude, longitude: places[0].longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    }
    const lats = places.map((p) => p.latitude);
    const lons = places.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.min(Math.max((maxLat - minLat) * 1.6, 0.03), 170),
      longitudeDelta: Math.min(Math.max((maxLon - minLon) * 1.6, 0.03), 350),
    };
  }, [places, selectedPlace]);

  if (mapQuery) {
    const noResults = !searching && places.length === 0 && !geocodedPlace;

    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={sheetStyles.formOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.mapSheet}>
            <View style={sheetStyles.handle} />
            <View style={styles.mapHeader}>
              <StoreLogo name={mapQuery} size={36} domain={selectedBrand?.domain} logoUrl={selectedBrand?.logo_url} />
              <View style={{ flex: 1 }}>
                <Text style={sheetStyles.headerTitle} numberOfLines={1}>{mapQuery}</Text>
                <Text style={sheetStyles.headerSubtitle}>
                  {noResults
                    ? `${mapQuery} wasn't found automatically. Enter its address below.`
                    : 'Tap a pin to select the right location.'}
                </Text>
              </View>
              <ScalePressable profile="chip" style={styles.mapBackBtn} onPress={() => { setMapQuery(''); resetCustomSection(); }}>
                <Text style={styles.mapBackText}>Back</Text>
              </ScalePressable>
            </View>

            {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

            {searching ? (
              <View style={styles.mapLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.mapLoadingText}>Searching nearby...</Text>
              </View>
            ) : noResults ? (
              <View style={styles.manualWrap}>
                <View style={styles.manualIconWrap}>
                  <Ionicons name="location-outline" size={28} color={colors.primary} />
                </View>
                <Text style={styles.manualTitle}>{`Enter ${mapQuery}'s address`}</Text>
                <Text style={styles.manualSub}>
                  {`${mapQuery} isn't in our search index yet. Enter its street address to pin it for arrival alerts, or save without geofencing.`}
                </Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="e.g. 1234 Jefferson Davis Hwy, Woodbridge VA 22191"
                  placeholderTextColor={colors.placeholder}
                  value={manualAddress}
                  onChangeText={setManualAddress}
                  returnKeyType="search"
                  onSubmitEditing={handleGeocodeManual}
                  autoFocus
                />
                <ScalePressable
                  style={[styles.saveBtn, (!manualAddress.trim() || geocoding) && styles.saveBtnDisabled]}
                  onPress={handleGeocodeManual}
                  disabled={!manualAddress.trim() || geocoding}
                >
                  {geocoding
                    ? <ActivityIndicator color={colors.onPrimary} />
                    : <Text style={styles.saveBtnText}>Look up address</Text>
                  }
                </ScalePressable>
                <ScalePressable
                  style={styles.skipBtn}
                  profile="chip"
                  onPress={() => { void handleSave(mapQuery, undefined, true); setMapQuery(''); }}
                >
                  <Text style={styles.skipText}>Save without address (no geofencing)</Text>
                </ScalePressable>
              </View>
            ) : (
              <>
                <MapView style={styles.map} region={mapRegion}>
                  {places.map((place) => (
                    <Marker
                      key={`${place.latitude}-${place.longitude}-${place.address}`}
                      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                      title={place.name}
                      description={(() => {
                        const openStatus = isCurrentlyOpen(place.opening_hours);
                        if (openStatus === null) return place.address;
                        return `${openStatus ? '🟢 Open now' : '🔴 Closed'} • ${place.address}`;
                      })()}
                      pinColor={selectedPlace === place ? colors.primary : colors.muted}
                      onPress={() => setSelectedPlace(place)}
                    />
                  ))}
                </MapView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeList}>
                  {places.map((place) => {
                    const active = selectedPlace === place;
                    return (
                      <ScalePressable
                        key={`${place.latitude}-${place.longitude}-${place.address}`}
                        profile="chip"
                        style={[styles.placeCard, active && styles.placeCardActive]}
                        onPress={() => { void hapticSelection(); setSelectedPlace(place); }}
                      >
                        <Text style={[styles.placeName, active && styles.placeNameActive]} numberOfLines={1}>{place.name}</Text>
                        <Text style={styles.placeAddress} numberOfLines={2}>{place.address}</Text>
                        
                        {(() => {
                          const openStatus = isCurrentlyOpen(place.opening_hours);
                          if (openStatus === null) return null;
                          return (
                            <View style={[styles.hoursBadge, openStatus ? styles.hoursBadgeOpen : styles.hoursBadgeClosed]}>
                              <Text style={[styles.hoursText, openStatus ? styles.hoursTextOpen : styles.hoursTextClosed]}>
                                {openStatus ? 'Open now' : 'Closed'}
                              </Text>
                            </View>
                          );
                        })()}
                      </ScalePressable>
                    );
                  })}
                </ScrollView>

                <ScalePressable
                  style={[styles.saveBtn, (!selectedPlace || saving) && styles.saveBtnDisabled]}
                  onPress={() => selectedPlace && handleSavePlace(selectedPlace)}
                  disabled={!selectedPlace || saving}
                >
                  {saving
                    ? <ActivityIndicator color={colors.onPrimary} />
                    : <Text style={styles.saveBtnText}>
                        {geocodedPlace ? 'Add store at this address' : 'Add selected location'}
                      </Text>
                  }
                </ScalePressable>
                <ScalePressable style={styles.skipBtn} profile="chip" onPress={() => setPlaces([])}>
                  <Text style={styles.skipText}>Enter address manually instead</Text>
                </ScalePressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={sheetStyles.formOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={sheetStyles.formSheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.headerTitle}>Add store</Text>
          <Text style={[sheetStyles.headerSubtitle, { marginBottom: 16 }]}>Save places your household shops often.</Text>

          {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            placeholder="Zip, city, or address (e.g. 22193 or Woodbridge VA)"
            value={zipCode}
            onChangeText={setZipCode}
            placeholderTextColor={colors.placeholder}
            keyboardType="default"
            returnKeyType="next"
            autoCorrect={false}
          />

          {presets.length > 0 && (
            <>
              <Text style={styles.label}>Quick add</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.presetsRow}
                contentContainerStyle={styles.presetsContent}
              >
                {presets.map((p) => (
                  <ScalePressable
                    key={p}
                    profile="chip"
                    style={styles.presetChip}
                    onPress={() => { void hapticSelection(); void handleSave(p); }}
                    disabled={saving}
                  >
                    <StoreLogo name={p} size={24} />
                    <Text style={styles.presetChipText}>{p}</Text>
                    <Ionicons name="navigate-outline" size={12} color={colors.primary} style={{ opacity: 0.6 }} />
                  </ScalePressable>
                ))}
              </ScrollView>
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Store name (e.g. Kroger, ALDI, Kabul Halal Market)"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError('');
              if (selectedBrand && selectedBrand.name !== text) setSelectedBrand(null);
            }}
            placeholderTextColor={colors.placeholder}
          />

          {name.trim().length >= 2 && brands.length === 0 && !selectedBrand && !existingNames.includes(name.trim().toLowerCase()) && (
            <Text style={styles.noBrandsText}>No known brands matched — you can still add it as a custom store.</Text>
          )}

          {brands.length > 0 && (
            <ScrollView style={styles.brandResults} scrollEnabled={brands.length > 3} nestedScrollEnabled>
              {brands.map((brand) => {
                const active = selectedBrand?.id === brand.id;
                return (
                  <ScalePressable
                    key={brand.id}
                    profile="chip"
                    style={[styles.brandRow, active && styles.brandRowActive]}
                    onPress={() => { void hapticSelection(); setSelectedBrand(brand); setName(brand.name); setBrands([]); }}
                  >
                    <StoreLogo name={brand.name} size={24} domain={brand.domain} logoUrl={brand.logo_url} />
                    <Text style={[styles.brandName, active && styles.brandNameActive]} numberOfLines={1}>{brand.name}</Text>
                  </ScalePressable>
                );
              })}
            </ScrollView>
          )}

          <ScalePressable
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={() => { void hapticSelection(); void handleSave(name.trim()); }}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color={colors.onPrimary} />
              : <Text style={styles.saveBtnText}>Find nearby stores</Text>
            }
          </ScalePressable>

          <ScalePressable
            style={styles.skipBtn}
            profile="chip"
            onPress={() => { void hapticSelection(); void handleSave(name.trim(), undefined, true); }}
            disabled={!name.trim() || saving}
          >
            <Text style={styles.skipText}>Save without address (no geofencing)</Text>
          </ScalePressable>

          <ScalePressable
            style={styles.cancelBtn}
            profile="chip"
            onPress={() => { void hapticSelection(); onClose(); }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: AppColors, placeCardWidth = 210) {
  return StyleSheet.create({
    mapSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 36,
      maxHeight: '86%',
    },
    mapHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    mapBackBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primarySoft },
    mapBackText: { color: colors.primary, fontSize: 13, fontFamily: fonts.bodySemiBold },
    map: { height: 280, borderRadius: 18, marginBottom: 12, overflow: 'hidden' },
    mapLoading: {
      height: 280, borderRadius: 18, backgroundColor: colors.faint,
      alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    mapLoadingText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bodySemiBold },
    placeList: { gap: 10, paddingRight: 20, paddingBottom: 14 },
    placeCard: { width: placeCardWidth, borderRadius: radii.md, backgroundColor: colors.faint, padding: 12, gap: 4 },
    placeCardActive: { backgroundColor: colors.primarySoft },
    placeName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bodySemiBold },
    placeNameActive: { color: colors.primary },
    placeAddress: { color: colors.muted, fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 17 },
    hoursBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
    hoursBadgeOpen: { backgroundColor: colors.successSoft },
    hoursBadgeClosed: { backgroundColor: colors.dangerSoft },
    hoursText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
    hoursTextOpen: { color: colors.success },
    hoursTextClosed: { color: colors.danger },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 12, marginBottom: 12 },
    error: { color: colors.dangerText, fontSize: 14 },
    label: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
    presetsRow: { marginBottom: 20 },
    presetsContent: { paddingRight: 20 },
    noBrandsText: { fontSize: 13, color: colors.muted, fontFamily: fonts.body, marginBottom: 10, paddingHorizontal: 4 },
    presetChip: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: colors.primarySoft, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 8, marginRight: 8,
    },
    presetChipText: { color: colors.primary, fontSize: 14, fontFamily: fonts.bodySemiBold },
    input: {
      borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 15,
      fontSize: 16, marginBottom: 12, color: colors.ink,
      backgroundColor: colors.faint, fontFamily: fonts.body,
    },
    brandResults: { maxHeight: 180, marginBottom: 12, gap: 8 },
    brandRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.faint, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
    },
    brandRowActive: { backgroundColor: colors.primarySoft },
    brandName: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.bodySemiBold },
    brandNameActive: { color: colors.primary },
    saveBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    saveBtnDisabled: { backgroundColor: colors.disabled },
    saveBtnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },
    skipBtn: { paddingVertical: 12, alignItems: 'center' },
    skipText: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium, textDecorationLine: 'underline' },
    manualWrap: { paddingTop: 12, paddingBottom: 8, gap: 12 },
    manualIconWrap: {
      width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft,
      alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4,
    },
    manualTitle: { fontSize: 18, fontFamily: fonts.bodySemiBold, color: colors.ink, textAlign: 'center' },
    manualSub: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body, marginBottom: 4 },
    manualInput: {
      borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
      fontSize: 15, color: colors.ink, backgroundColor: colors.faint, fontFamily: fonts.body,
    },
  });
}
