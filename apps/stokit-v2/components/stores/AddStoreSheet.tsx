import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Sheet } from '../shared/Sheet';
import { TextField, FieldLabel } from '../shared/Field';
import { Button } from '../shared/ui';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { autocompleteGooglePlaces, getPlaceDetailsGoogle, geocodeLocation, searchNearbyStoresByName, type AutocompleteSuggestion, type NearbyStore } from '../../core/services/places';
import { useTheme } from '../../hooks/useTheme';

const LOGO_COLORS = ['#C0392B','#E8913E','#D8A24A','#3D7A53','#2E6DA4','#6C5CE7','#444'];
const EMOJIS      = ['🛒','🏬','🥕','🧀','🍞','🐟','🍎','🛍️'];

export function AddStoreSheet({
  visible,
  onClose,
  onStoreAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onStoreAdded?: (storeId: string) => void;
}) {
  return (
    <Sheet visible={visible} title="Add a store" onClose={onClose}>
      <AddStoreContent onClose={onClose} onStoreAdded={onStoreAdded} isActive={visible} />
    </Sheet>
  );
}

export function AddStoreContent({
  onClose,
  onStoreAdded,
  isActive = true,
}: {
  onClose: () => void;
  onStoreAdded?: (storeId: string) => void;
  isActive?: boolean;
}) {
  const { colors } = useTheme();
  const addStore = useDurableStore((s) => s.addStore);

  const [name, setName]   = useState('');
  const [zip, setZip]     = useState('');
  const [color, setColor] = useState(LOGO_COLORS[1]);
  const [emoji, setEmoji] = useState<string | undefined>(undefined);

  const [placeId, setPlaceId]  = useState<string | undefined>(undefined);
  const [address, setAddress]  = useState<string | undefined>(undefined);
  const [lat, setLat]          = useState<number | undefined>(undefined);
  const [lng, setLng]          = useState<number | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [searchError, setSearchError] = useState('');

  const userLocRef = useRef<{lat: number, lng: number} | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache NearbyStore details so selection doesn't need an extra Places API round-trip
  const nearbyStoreCache = useRef<Map<string, NearbyStore>>(new Map());

  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Grab location once when active, store in ref (doesn't trigger re-renders)
  useEffect(() => {
    if (!isActive) return;
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === 'granted') {
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
        return null;
      })
      .then(loc => {
        if (loc) {
          userLocRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      })
      .catch(() => { /* silently ignore */ });
  }, [isActive]);

  // Debounced autocomplete — runs 400ms after user stops typing
  const runAutocomplete = useCallback((currentName: string, currentZip: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (currentName.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        let searchLat = userLocRef.current?.lat;
        let searchLng = userLocRef.current?.lng;

        if (currentZip.trim().length >= 3) {
          const zipQuery = /^\d{5}$/.test(currentZip.trim())
            ? `${currentZip.trim()}, USA`
            : currentZip.trim();
          const geo = await geocodeLocation(zipQuery);
          if (geo) {
            searchLat = geo.lat;
            searchLng = geo.lng;
          }
        }

        // When we have coordinates use Text Search (distance-sorted) rather than
        // Autocomplete (relevance-sorted) so the closest store always wins.
        if (searchLat !== undefined && searchLng !== undefined) {
          const nearby = await searchNearbyStoresByName(searchLat, searchLng, currentName);
          nearbyStoreCache.current.clear();
          const asSuggestions: AutocompleteSuggestion[] = nearby.slice(0, 5).map((s) => {
            nearbyStoreCache.current.set(s.placeId, s);
            return {
              placeId: s.placeId,
              description: `${s.name} — ${s.address}`,
              mainText: s.name,
              secondaryText: s.address,
            };
          });
          setSuggestions(asSuggestions);
        } else {
          const res = await autocompleteGooglePlaces(currentName, searchLat, searchLng);
          setSuggestions(res);
        }
        setSearchError('');
      } catch (e) {
        console.error('[AddStoreSheet] autocomplete error:', e);
        setSearchError('Search unavailable. You can still type the store name manually.');
        setSuggestions([]);
      }
    }, 400);
  }, []);

  const reset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setName(''); setZip(''); setColor(LOGO_COLORS[1]); setEmoji(undefined);
    setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined);
    setSuggestions([]); setLoadingSuggestion(false); setSearchError('');
    nearbyStoreCache.current.clear();
  };

  const handleClose = () => { reset(); onClose(); };

  const handleNameChange = (v: string) => {
    setName(v);
    if (placeId) {
      setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined);
    }
    runAutocomplete(v, zip);
  };

  const handleZipChange = (v: string) => {
    setZip(v);
    if (placeId) {
      setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined);
    }
    runAutocomplete(name, v);
  };

  const selectSuggestion = async (s: AutocompleteSuggestion) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setName(s.mainText);
    setSuggestions([]);

    // If this came from a nearby search we already have full details — no extra call needed
    const cached = nearbyStoreCache.current.get(s.placeId);
    if (cached) {
      setPlaceId(cached.placeId);
      setAddress(cached.address || s.secondaryText);
      setLat(cached.lat);
      setLng(cached.lng);
      return;
    }

    setLoadingSuggestion(true);
    try {
      const details = await getPlaceDetailsGoogle(s.placeId);
      if (details) {
        setPlaceId(details.placeId);
        setAddress(details.address || s.secondaryText);
        setLat(details.lat);
        setLng(details.lng);
      } else {
        setPlaceId(s.placeId);
        setAddress(s.secondaryText);
      }
    } catch (e) {
      console.error('[AddStoreSheet] details error:', e);
      setPlaceId(s.placeId);
      setAddress(s.secondaryText);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const submit = () => {
    if (!name.trim()) return;
    
    const store = addStore({ 
      name: name.trim(), 
      logoColor: color, 
      logoEmoji: emoji, 
      placeId, 
      address, 
      lat, 
      lng, 
    });
    reset();
    onClose();
    if (onStoreAdded) {
      onStoreAdded(store.id);
    }
  };

  return (
    <>
      <TextField
        label="Store name"
        value={name}
        onChangeText={handleNameChange}
        placeholder="Type to search (e.g. Lidl, Target…)"
      />

      <View style={{ height: spacing.sm }} />

      <TextField
        label="City or Zip Code (optional)"
        value={zip}
        onChangeText={handleZipChange}
        placeholder="Search in a different area..."
      />

      <View style={{ height: spacing.sm }} />

      {/* Autocomplete suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.slice(0, 5).map((s, i) => (
            <Pressable
              key={s.placeId}
              style={({ pressed }) => [
                styles.suggestionRow,
                i > 0 && styles.suggestionBorder,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => { void selectSuggestion(s); }}
            >
              <Ionicons name="location-outline" size={18} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionMain} numberOfLines={1}>{s.mainText}</Text>
                {s.secondaryText ? (
                  <Text style={styles.suggestionSub} numberOfLines={1}>{s.secondaryText}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Loading details */}
      {loadingSuggestion && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Fetching store details…</Text>
        </View>
      )}

      {/* Selected location confirmation */}
      {address && !loadingSuggestion && (
        <View style={styles.selectedLocation}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.selectedText} numberOfLines={1}>{address}</Text>
        </View>
      )}

      {/* Search error */}
      {searchError ? (
        <Text style={styles.errorText}>{searchError}</Text>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <FieldLabel>Logo color</FieldLabel>
      <View style={styles.swatchRow}>
        {LOGO_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
        ))}
      </View>

      <View style={{ height: spacing.lg }} />
      <FieldLabel>Icon (optional)</FieldLabel>
      <View style={styles.swatchRow}>
        {EMOJIS.map((e) => (
          <Pressable key={e} onPress={() => setEmoji(emoji === e ? undefined : e)}
            style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}>
            <Text style={{ fontSize: 20 }}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>
        {address ? 'Location linked ✓' : 'Select a suggestion above to link a real-world location.'}
      </Text>

      <Button
        label={loadingSuggestion ? 'Loading…' : 'Add store'}
        onPress={submit}
        disabled={!name.trim() || loadingSuggestion}
        style={{ marginTop: spacing.lg }}
      />
    </>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    debugBanner: {
      backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 10, marginTop: 6,
    },
    debugText: { fontFamily: fonts.sans, fontSize: 12, color: colors.danger },
    dropdown: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.border,
      marginTop: 4,
      overflow: 'hidden',
    },
    suggestionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, paddingVertical: 12,
    },
    suggestionBorder: {
      borderTopWidth: 1, borderTopColor: colors.borderSoft,
    },
    suggestionMain: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    suggestionSub:  { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    loadingRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    },
    loadingText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
    selectedLocation: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    },
    selectedText: { fontFamily: fonts.sans, fontSize: 13, color: colors.success, flex: 1 },
    errorText: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 6 },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch:         { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
    swatchActive:   { borderColor: colors.ink },
    emojiBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emojiBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    hint: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.md },
  });
}
