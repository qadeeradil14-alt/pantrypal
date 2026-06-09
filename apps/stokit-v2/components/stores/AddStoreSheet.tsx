import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Sheet } from '../shared/Sheet';
import { TextField, FieldLabel } from '../shared/Field';
import { Button } from '../shared/ui';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { autocompleteGooglePlaces, getPlaceDetailsGoogle, type AutocompleteSuggestion } from '../../core/services/places';
import { useTheme } from '../../hooks/useTheme';

const LOGO_COLORS = ['#C0392B','#E8913E','#D8A24A','#3D7A53','#2E6DA4','#6C5CE7','#444'];
const EMOJIS      = ['🛒','🏬','🥕','🧀','🍞','🐟','🍎','🛍️'];

export function AddStoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const addStore = useDurableStore((s) => s.addStore);

  const [name, setName]   = useState('');
  const [color, setColor] = useState(LOGO_COLORS[1]);
  const [emoji, setEmoji] = useState<string | undefined>(undefined);
  
  const [placeId, setPlaceId]  = useState<string | undefined>(undefined);
  const [address, setAddress]  = useState<string | undefined>(undefined);
  const [lat, setLat]          = useState<number | undefined>(undefined);
  const [lng, setLng]          = useState<number | undefined>(undefined);

  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  
  // Optionally grab location to bias the autocomplete results near the user
  const [userLoc, setUserLoc] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (visible) {
      Location.getForegroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
           Location.getLastKnownPositionAsync().then(loc => {
             if (loc) setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
           });
        }
      });
    }
  }, [visible]);

  // Live autocomplete search
  useEffect(() => {
    if (name.trim().length < 2 || placeId) {
      setSuggestions([]);
      return;
    }
    let active = true;
    autocompleteGooglePlaces(name, userLoc?.lat, userLoc?.lng).then(res => {
      if (active) setSuggestions(res);
    });
    return () => { active = false; };
  }, [name, placeId, userLoc]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const reset = () => {
    setName(''); setColor(LOGO_COLORS[1]); setEmoji(undefined);
    setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined);
    setSuggestions([]);
  };

  const handleClose = () => { reset(); onClose(); };

  const selectSuggestion = async (s: AutocompleteSuggestion) => {
    setName(s.mainText);
    setSuggestions([]);
    setLoadingSuggestion(true);
    
    // Fetch exact coordinates and address
    const details = await getPlaceDetailsGoogle(s.placeId);
    setLoadingSuggestion(false);
    
    if (details) {
      setPlaceId(details.placeId);
      setAddress(details.address);
      setLat(details.lat);
      setLng(details.lng);
    } else {
      // Fallback if details fetch fails for some reason
      setPlaceId(s.placeId);
      setAddress(s.secondaryText);
    }
  };

  const submit = () => {
    if (!name.trim()) return;
    addStore({ name, logoColor: color, logoEmoji: emoji, placeId, address, lat, lng });
    reset();
    onClose();
  };

  return (
    <Sheet visible={visible} title="Add a store" onClose={handleClose}>
      <TextField
        label="Store name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (placeId) { 
            // If they modify the name after picking a location, unlink it
            setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined); 
          }
        }}
        placeholder="e.g. Target, Aldi, Whole Foods"
      />

      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.slice(0, 5).map((s, i) => (
            <Pressable 
              key={s.placeId} 
              style={({ pressed }) => [styles.suggestionRow, i > 0 && styles.suggestionBorder, pressed && { backgroundColor: colors.surface }]} 
              onPress={() => selectSuggestion(s)}
            >
              <Ionicons name="location-outline" size={18} color={colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionMain} numberOfLines={1}>{s.mainText}</Text>
                {s.secondaryText ? <Text style={styles.suggestionSub} numberOfLines={1}>{s.secondaryText}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Loading state after tapping suggestion */}
      {loadingSuggestion && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>Loading store details...</Text>
        </View>
      )}

      {/* Successfully linked location */}
      {address && !loadingSuggestion && (
        <View style={styles.selectedLocation}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.selectedText} numberOfLines={1}>{address}</Text>
        </View>
      )}

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

      <Text style={styles.hint}>Logos are visual only — they never change how shopping works.</Text>

      <Button label="Add store" onPress={submit} disabled={!name.trim()} style={{ marginTop: spacing.lg }} />
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    dropdown: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.border,
      marginTop: 4,
      overflow: 'hidden',
    },
    suggestionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 12,
    },
    suggestionBorder: {
      borderTopWidth: 1, borderTopColor: colors.borderSoft,
    },
    suggestionMain: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    suggestionSub:  { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 2 },
    selectedLocation: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 8, paddingHorizontal: 4,
    },
    selectedText: { fontFamily: fonts.sans, fontSize: 13, color: colors.success, flex: 1 },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch:       { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: colors.ink },
    emojiBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emojiBtnActive:{ borderColor: colors.primary, backgroundColor: colors.primarySoft },
    hint: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.md },
  });
}
