import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  Alert, ActivityIndicator, TextInput, ScrollView, Modal, useWindowDimensions,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHouseholdStore } from '../../../store/household';
import { useStoresStore } from '../../../store/stores';
import { useItemsStore } from '../../../store/items';
import {
  fetchStores, addStoreWithQueue, deleteStoreWithQueue, PRESET_STORES,
  addStoreFromPlace, searchNearbyStores, searchStoreBrands, type Store, type StoreBrand, type StorePlace,
} from '../../../lib/stores';
import { startGeofencing, stopGeofencing } from '../../../lib/geofencing';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../../lib/haptics';
import { fonts, radii, shadow } from '../../../constants/theme';
import { makeSheetStyles } from '../../../constants/sheetStyles';
import type { AppColors } from '../../../constants/theme';
import { useTheme } from '../../../hooks/useTheme';
import ScalePressable from '../../../components/ScalePressable';
import EmptyState from '../../../components/EmptyState';
import StoreLogo from '../../../components/StoreLogo';

function compactAddress(address: string, storeName: string): string {
  const raw = address.trim();
  if (!raw) return raw;

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const storeKey = storeName.trim().toLowerCase();
  const deduped = parts.filter((part, idx) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (idx > 0 && key === storeKey) return false;
    return true;
  });

  const compact = deduped.slice(0, 4).join(', ');
  return compact || raw;
}

export default function StoresScreen() {
  const { colors } = useTheme();
  const { household } = useHouseholdStore();
  const { stores, setStores, addStore: addToStore, removeStore } = useStoresStore();
  const { items } = useItemsStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const householdId = household?.id ?? null;
  const canManageStores = !!householdId;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Count pantry items assigned to each store
  const itemCountByStore = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.preferred_store_id) {
        counts[item.preferred_store_id] = (counts[item.preferred_store_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const load = useCallback(async () => {
    if (!householdId) {
      setStores([]);
      return;
    }
    const data = await fetchStores(householdId);
    setStores(data);
  }, [householdId, setStores]);

  useEffect(() => {
    load()
      .catch(() => {
        Alert.alert('Could not load stores', 'Please try again.');
      })
      .finally(() => setLoading(false));
  }, [load]);

  // Re-fetch when tab comes into focus (picks up changes from other devices)
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!householdId) setShowAdd(false);
  }, [householdId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  async function handleDelete(store: Store) {
    Alert.alert(`Remove ${store.name}?`, 'This will also clear it from all items assigned here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          void hapticWarning();
          if (!canManageStores) {
            Alert.alert('Household not ready', 'Please wait a moment and try again.');
            return;
          }
          try {
            setRemovingId(store.id);
            await deleteStoreWithQueue(store.id);
            removeStore(store.id);
            await stopGeofencing();
            const updated = stores.filter((s) => s.id !== store.id);
            if (updated.some((s) => s.latitude != null)) await startGeofencing(updated);
            void hapticSuccess();
          } catch (e: any) {
            Alert.alert('Could not remove store', e?.message ?? 'Please try again.');
            void hapticError();
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Stores</Text>
          <Text style={styles.headerTitle} testID="stores-header">My Stores</Text>
        </View>
        <ScalePressable
          style={[styles.addBtn, !canManageStores && styles.addBtnDisabled]}
          onPress={() => {
            void hapticSelection();
            if (!canManageStores) {
              Alert.alert('Household not ready', 'Please wait a moment and try again.');
              return;
            }
            setShowAdd(true);
          }}
          disabled={!canManageStores}
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.addBtnText}>Add</Text>
        </ScalePressable>
      </View>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroNumber}>{stores.length}</Text>
          <Text style={styles.heroLabel}>{stores.length === 1 ? 'store saved' : 'stores saved'}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="location-outline" size={18} color={colors.primary} />
          <Text style={styles.heroBadgeText}>
            {stores.filter((s) => s.latitude != null).length} with location
          </Text>
        </View>
      </View>

      {stores.length === 0 ? (
        <EmptyState
          emoji="🏪"
          title="No stores yet"
          subtitle="Add the stores you shop at. Include an address and the app will alert your partner the moment you arrive."
          action={canManageStores ? { label: 'Add your first store', onPress: () => { void hapticSelection(); setShowAdd(true); } } : undefined}
        />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const itemCount = itemCountByStore[item.id] ?? 0;
            return (
              <View style={styles.row}>
                <StoreLogo name={item.name} size={40} domain={item.brand_domain} logoUrl={item.logo_url} />
                <View style={styles.rowLeft}>
                  <Text style={styles.storeName}>{item.name}</Text>
                  {item.address
                    ? (
                      <Text style={styles.storeAddress} numberOfLines={2} ellipsizeMode="tail">
                        {compactAddress(item.address, item.name)}
                      </Text>
                    )
                    : <Text style={styles.noAddress}>No address · geofencing off</Text>
                  }
                  {itemCount > 0 && (
                    <Text style={styles.itemCount}>{itemCount} {itemCount === 1 ? 'item' : 'items'} assigned</Text>
                  )}
                </View>
                <View style={styles.rowRight}>
                  {item.latitude != null && (
                    <ScalePressable
                      profile="chip"
                      style={styles.directionsBtn}
                      onPress={() => {
                        void hapticSelection();
                        const label = encodeURIComponent(item.name);
                        const url = Platform.OS === 'ios'
                          ? `maps://?daddr=${item.latitude},${item.longitude}&dirflg=d`
                          : `google.navigation:q=${item.latitude},${item.longitude}`;
                        Linking.canOpenURL(url).then((can) => {
                          if (can) return Linking.openURL(url);
                          // Fallback to Apple Maps web
                          return Linking.openURL(`https://maps.apple.com/?daddr=${item.latitude},${item.longitude}&dirflg=d&t=m`);
                        }).catch(() => {});
                      }}
                    >
                      <Ionicons name="navigate" size={14} color={colors.primary} />
                      <Text style={styles.directionsBtnText}>Directions</Text>
                    </ScalePressable>
                  )}
                  <ScalePressable
                    profile="danger"
                    onPress={() => {
                      void hapticSelection();
                      handleDelete(item);
                    }}
                    style={styles.deleteBtn}
                    disabled={removingId === item.id}
                  >
                    <Text style={styles.deleteBtnText}>{removingId === item.id ? 'Removing…' : 'Remove'}</Text>
                  </ScalePressable>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {showAdd && householdId && (
        <AddStoreModal
          householdId={householdId}
          existingStores={stores}
          onAdd={async (store) => {
            try {
              addToStore(store);
              await stopGeofencing();
              const all = [...stores, store];
              if (all.some((s) => s.latitude != null)) await startGeofencing(all);
              setShowAdd(false);
            } catch (e: any) {
              Alert.alert('Store saved, but geofencing failed', e?.message ?? 'Please check location permissions.');
            }
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </SafeAreaView>
  );
}

function AddStoreModal({
  householdId, existingStores, onAdd, onClose,
}: {
  householdId: string;
  existingStores: Store[];
  onAdd: (store: Store) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
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

  const placeCardWidth = Math.min(320, Math.max(236, width - 112));
  const styles = useMemo(() => makeStyles(colors, placeCardWidth), [colors, placeCardWidth]);
  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);

  const existingNames = useMemo(() => existingStores.map((s) => s.name.toLowerCase()), [existingStores]);
  const presets = PRESET_STORES.filter((p) => !existingNames.includes(p.toLowerCase()));

  useEffect(() => {
    const q = name.trim();
    if (q.length < 2) {
      setBrands([]);
      return;
    }
    const timer = setTimeout(() => {
      searchStoreBrands(q)
        .then((found) => setBrands(found.filter((brand) => !existingNames.includes(brand.name.toLowerCase()))))
        .catch(() => setBrands([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [existingNames, name]);

  async function openNearbyPicker(storeName: string) {
    const trimmed = storeName.trim();
    if (!trimmed) return;
    setSearching(true);
    setError('');
    setMapQuery(trimmed);
    setGeocodedPlace(null);
    setManualAddress('');
    try {
      const found = await searchNearbyStores(trimmed, zipCode.trim() || undefined);
      setPlaces(found);
      setSelectedPlace(found[0] ?? null);
      // If nothing found, stay in map view but show the manual address entry
      if (found.length === 0) setError('');
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
      // Use expo-location geocodeAsync first, Nominatim as fallback
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
          { headers: { 'User-Agent': 'PantryPal/1.0', Accept: 'application/json' } },
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

  async function handleSave(storeName: string, storeAddress?: string) {
    if (existingNames.includes(storeName.toLowerCase())) {
      setError(`"${storeName}" is already in your stores.`);
      void hapticError();
      return;
    }
    if (!storeAddress?.trim()) {
      await openNearbyPicker(storeName);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { store, queued } = await addStoreWithQueue(householdId, storeName, storeAddress, selectedBrand);
      onAdd(store);
      if (queued) {
        setError("Saved offline — will sync when you're back online.");
      }
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePlace(place: StorePlace) {
    setSaving(true);
    setError('');
    try {
      const store = await addStoreFromPlace(householdId, place, selectedBrand);
      onAdd(store);
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  // Compute map region that fits all pins with padding — must be before any conditional return
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
    // Clamp to valid MapView ranges — longitudeDelta > 360 crashes react-native-maps
    // (happens with global chains like Kmart that appear on multiple continents in Nominatim)
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
                  {noResults ? 'Not found automatically — enter the address below.' : 'Tap a pin to select the right location.'}
                </Text>
              </View>
              <ScalePressable profile="chip" style={styles.mapBackBtn} onPress={() => { setMapQuery(''); setError(''); }}>
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
              /* ── Manual address entry when auto-search finds nothing ── */
              <View style={styles.manualWrap}>
                <View style={styles.manualIconWrap}>
                  <Ionicons name="location-outline" size={28} color={colors.primary} />
                </View>
                <Text style={styles.manualTitle}>Enter the address</Text>
                <Text style={styles.manualSub}>
                  We'll pin it on the map so geofencing works when you arrive.
                </Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="e.g. 123 Main St, Springfield, VA"
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
                  onPress={() => {
                    // Save without coordinates — no geofencing but store is saved
                    void handleSave(mapQuery, undefined);
                    setMapQuery('');
                  }}
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
                      description={place.address}
                      pinColor={selectedPlace === place ? colors.primary : '#9CA3AF'}
                      onPress={() => setSelectedPlace(place)}
                    />
                  ))}
                </MapView>

                {/* Address cards — scrollable if multiple results, single card if geocoded */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeList}>
                  {places.map((place) => {
                    const active = selectedPlace === place;
                    return (
                      <ScalePressable
                        key={`${place.latitude}-${place.longitude}-${place.address}`}
                        profile="chip"
                        style={[styles.placeCard, active && styles.placeCardActive]}
                        onPress={() => {
                          void hapticSelection();
                          setSelectedPlace(place);
                        }}
                      >
                        <Text style={[styles.placeName, active && styles.placeNameActive]} numberOfLines={1}>{place.name}</Text>
                        <Text style={styles.placeAddress} numberOfLines={2}>{place.address}</Text>
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
                <ScalePressable
                  style={styles.skipBtn}
                  profile="chip"
                  onPress={() => {
                    void handleSave(mapQuery, undefined);
                    setMapQuery('');
                  }}
                >
                  <Text style={styles.skipText}>Save without location (no geofencing)</Text>
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

          <Text style={styles.label}>Quick add</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow} contentContainerStyle={styles.presetsContent}>
            {presets.map((p) => (
              <ScalePressable
                key={p}
                profile="chip"
                style={styles.presetChip}
                onPress={() => {
                  void hapticSelection();
                  void openNearbyPicker(p);
                }}
                disabled={saving}
              >
                <StoreLogo name={p} size={24} />
                <Text style={styles.presetChipText}>{p}</Text>
                <Ionicons name="navigate-outline" size={12} color={colors.primary} style={{ opacity: 0.6 }} />
              </ScalePressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Custom store</Text>
          <TextInput
            style={styles.input}
            placeholder="Store name (e.g. Kabul Halal Market)"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (selectedBrand && selectedBrand.name !== text) setSelectedBrand(null);
            }}
            placeholderTextColor={colors.placeholder}
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Zip code (optional — for accurate local results)"
            value={zipCode}
            onChangeText={setZipCode}
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            maxLength={5}
          />
          {name.trim().length >= 2 && brands.length === 0 && !selectedBrand && (
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
                    onPress={() => {
                      void hapticSelection();
                      setSelectedBrand(brand);
                      setName(brand.name);
                    }}
                  >
                    <StoreLogo name={brand.name} size={24} domain={brand.domain} logoUrl={brand.logo_url} />
                    <Text style={[styles.brandName, active && styles.brandNameActive]} numberOfLines={1}>{brand.name}</Text>
                  </ScalePressable>
                );
              })}
            </ScrollView>
          )}
          {selectedBrand && brands.length === 0 && (
            <View style={styles.selectedBrand}>
              <StoreLogo name={selectedBrand.name} size={24} domain={selectedBrand.domain} logoUrl={selectedBrand.logo_url} />
              <Text style={styles.selectedBrandText} numberOfLines={1}>{selectedBrand.name}</Text>
              <ScalePressable
                profile="chip"
                style={styles.clearBrandBtn}
                onPress={() => {
                  void hapticSelection();
                  setSelectedBrand(null);
                }}
              >
                <Ionicons name="close" size={16} color={colors.primary} />
              </ScalePressable>
            </View>
          )}
          <View style={styles.addressWrap}>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              placeholder="Street address (optional)"
              value={address}
              onChangeText={setAddress}
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
            />
            <View style={styles.addressHint}>
              <Ionicons name="location-outline" size={13} color={colors.primary} />
              <Text style={styles.addressHintText}>
                {address.trim()
                  ? 'Will be used for automatic arrival detection'
                  : 'Leave empty to search nearby locations after tapping Add'}
              </Text>
            </View>
          </View>

          <ScalePressable
            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
            onPress={() => {
              void hapticSelection();
              handleSave(name.trim(), address.trim() || undefined);
            }}
            disabled={!name.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color={colors.onPrimary} />
              : <Text style={styles.saveBtnText}>
                  {name.trim() && !address.trim() ? 'Add store & search nearby' : 'Add store'}
                </Text>
            }
          </ScalePressable>

          <ScalePressable
            style={styles.cancelBtn}
            profile="chip"
            onPress={() => {
              void hapticSelection();
              onClose();
            }}
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
    safe: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    },
    headerLeft: { flex: 1, gap: 2 },
    eyebrow: { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold },
    headerTitle: { fontSize: 26, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, backgroundColor: colors.primary, borderRadius: 999,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.onPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold },
    heroCard: {
      marginHorizontal: 16, marginBottom: 12, borderRadius: radii.lg,
      backgroundColor: colors.surface, padding: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    heroNumber: { fontSize: 38, lineHeight: 42, fontFamily: fonts.monoMedium, color: colors.ink, fontVariant: ['tabular-nums'] },
    heroLabel: { fontSize: 14, color: colors.muted, fontFamily: fonts.bodySemiBold },
    heroBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: colors.primarySoft, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    heroBadgeText: { color: colors.primary, fontFamily: fonts.bodySemiBold, fontSize: 13 },
    list: { paddingHorizontal: 16, paddingBottom: 120 },
    separator: { height: 10 },
    row: {
      backgroundColor: colors.surface, borderRadius: radii.md, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    rowLeft: { flex: 1, gap: 3 },
    storeName: { fontSize: 17, fontFamily: fonts.bodySemiBold, color: colors.ink },
    storeAddress: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.body },
    noAddress: { fontSize: 13, color: colors.muted, fontFamily: fonts.bodyMedium },
    itemCount: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodyMedium },
    rowRight: { alignItems: 'flex-end', gap: 8 },
    geoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
    },
    geoPillText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold },
    directionsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      backgroundColor: colors.primarySoft,
      borderWidth: 1, borderColor: colors.primary + '33',
    },
    directionsBtnText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bodySemiBold },
    deleteBtn: { padding: 4 },
    deleteBtnText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bodySemiBold },
    mapSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 36,
      maxHeight: '86%',
    },
    mapHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    mapBackBtn: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.primarySoft,
    },
    mapBackText: { color: colors.primary, fontSize: 13, fontFamily: fonts.bodySemiBold },
    map: {
      height: 280,
      borderRadius: 18,
      marginBottom: 12,
      overflow: 'hidden',
    },
    mapLoading: {
      height: 280,
      borderRadius: 18,
      backgroundColor: colors.faint,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    mapLoadingText: { color: colors.muted, fontSize: 14, fontFamily: fonts.bodySemiBold },
    placeList: {
      gap: 10,
      paddingRight: 20,
      paddingBottom: 14,
    },
    placeCard: {
      width: placeCardWidth,
      borderRadius: radii.md,
      backgroundColor: colors.faint,
      padding: 12,
      gap: 4,
    },
    placeCardActive: {
      backgroundColor: colors.primarySoft,
    },
    placeName: { color: colors.ink, fontSize: 14, fontFamily: fonts.bodySemiBold },
    placeNameActive: { color: colors.primary },
    placeAddress: { color: colors.muted, fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 17 },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 12, marginBottom: 12 },
    error: { color: colors.dangerText, fontSize: 14 },
    label: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
    presetsRow: { marginBottom: 20 },
    presetsContent: { paddingRight: 20 },
    noBrandsText: { fontSize: 13, color: colors.muted, fontFamily: fonts.body, marginBottom: 10, paddingHorizontal: 4 },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8,
    },
    presetChipText: { color: colors.primary, fontSize: 14, fontFamily: fonts.bodySemiBold },
    input: {
      borderRadius: radii.md,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 16,
      marginBottom: 12,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.body,
    },
    brandResults: { maxHeight: 180, marginBottom: 12, gap: 8 },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.faint,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    brandRowActive: { backgroundColor: colors.primarySoft },
    brandName: { flex: 1, color: colors.ink, fontSize: 15, fontFamily: fonts.bodySemiBold },
    brandNameActive: { color: colors.primary },
    selectedBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.primarySoft,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    selectedBrandText: { flex: 1, color: colors.primary, fontSize: 15, fontFamily: fonts.bodySemiBold },
    clearBrandBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    addressWrap: { marginBottom: 16, gap: 6 },
    addressHint: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
    addressHintText: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodyMedium, flex: 1 },
    saveBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
    saveBtnDisabled: { backgroundColor: colors.disabled },
    saveBtnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },

    // Manual address entry (when auto-search returns nothing)
    manualWrap: {
      paddingTop: 12,
      paddingBottom: 8,
      gap: 12,
    },
    manualIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 4,
    },
    manualTitle: {
      fontSize: 18,
      fontFamily: fonts.bodySemiBold,
      color: colors.ink,
      textAlign: 'center',
    },
    manualSub: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 20,
      fontFamily: fonts.body,
      marginBottom: 4,
    },
    manualInput: {
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 15,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.body,
    },
    skipBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    skipText: {
      fontSize: 13,
      color: colors.muted,
      fontFamily: fonts.bodyMedium,
      textDecorationLine: 'underline',
    },
  });
}
