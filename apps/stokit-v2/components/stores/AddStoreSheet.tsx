/**
 * Two-page bottom sheet:
 *   'form'   — store name, color, icon, + "Find nearby" button
 *   'nearby' — inline NearbyStoreList (no nested Modal)
 *
 * Switching pages happens inside the same Sheet/Modal so iOS never
 * sees two stacked Modals at once.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../shared/Sheet';
import { TextField, FieldLabel } from '../shared/Field';
import { Button } from '../shared/ui';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { NearbyStoreList } from './NearbyStoreList';
import type { NearbyStore } from '../../core/services/places';
import { useTheme } from '../../hooks/useTheme';

const LOGO_COLORS = ['#C0392B','#E8913E','#D8A24A','#3D7A53','#2E6DA4','#6C5CE7','#444'];
const EMOJIS      = ['🛒','🏬','🥕','🧀','🍞','🐟','🍎','🛍️'];

type Page = 'form' | 'nearby';

export function AddStoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const addStore = useDurableStore((s) => s.addStore);

  const [page, setPage]   = useState<Page>('form');
  const [name, setName]   = useState('');
  const [color, setColor] = useState(LOGO_COLORS[1]);
  const [emoji, setEmoji] = useState<string | undefined>(undefined);
  const [nearbySearch, setNearbySearch] = useState<string | undefined>(undefined);

  // GPS metadata
  const [placeId, setPlaceId]  = useState<string | undefined>(undefined);
  const [address, setAddress]  = useState<string | undefined>(undefined);
  const [lat, setLat]          = useState<number | undefined>(undefined);
  const [lng, setLng]          = useState<number | undefined>(undefined);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const reset = () => {
    setPage('form'); setName(''); setColor(LOGO_COLORS[1]); setEmoji(undefined);
    setPlaceId(undefined); setAddress(undefined); setLat(undefined); setLng(undefined);
    setNearbySearch(undefined);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleNearbySelect = (store: NearbyStore) => {
    setName(store.name);
    setAddress(store.address);
    setPlaceId(store.placeId);
    setLat(store.lat);
    setLng(store.lng);
    setPage('form');
  };

  const openNearby = (searchTerm?: string) => {
    setNearbySearch(searchTerm);
    setPage('nearby');
  };

  const submit = () => {
    if (!name.trim()) return;
    addStore({ name, logoColor: color, logoEmoji: emoji, placeId, address, lat, lng });
    reset();
    onClose();
  };

  const title = page === 'nearby' ? 'Nearby stores' : 'Add a store';

  return (
    <Sheet visible={visible} title={title} onClose={handleClose}>

      {/* ── PAGE: NEARBY (inline, no nested Modal) ──────────────── */}
      {page === 'nearby' ? (
        <NearbyStoreList
          initialSearch={nearbySearch}
          onSelect={handleNearbySelect}
          onBack={() => setPage('form')}
        />
      ) : (

      /* ── PAGE: FORM ─────────────────────────────────────────── */
      <>
        {/* Find nearby CTA */}
        <Pressable
          onPress={() => openNearby()}
          style={({ pressed }) => [styles.nearbyBtn, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="location" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nearbyLabel}>Find stores near me</Text>
            {address
              ? <Text style={styles.nearbyAddr} numberOfLines={1}>📍 {address}</Text>
              : <Text style={styles.nearbyHint}>Uses GPS · no API key needed</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>

        <View style={styles.divider} />

        {/* Store name */}
        <TextField
          label="Store name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (placeId) { setPlaceId(undefined); setAddress(undefined); }
          }}
          placeholder="e.g. Target, Aldi, Whole Foods"
        />

        {/* Live "Search [name] nearby" chip */}
        {name.trim().length >= 2 && !placeId && (
          <Pressable
            onPress={() => openNearby(name.trim())}
            style={({ pressed }) => [styles.searchChip, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="search" size={14} color={colors.primary} />
            <Text style={styles.searchChipText}>Search "{name.trim()}" nearby</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.primary} />
          </Pressable>
        )}

        {/* Logo color */}
        <View style={{ height: spacing.sm }} />
        <FieldLabel>Logo color</FieldLabel>
        <View style={styles.swatchRow}>
          {LOGO_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
          ))}
        </View>

        {/* Icon */}
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
      </>
      )}
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    nearbyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: colors.primarySoft, borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.primary,
      padding: spacing.lg, marginBottom: spacing.md,
    },
    nearbyLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.primary },
    nearbyHint:  { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    nearbyAddr:  { fontFamily: fonts.mono, fontSize: 12, color: colors.primary, marginTop: 2 },
    divider:     { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
    searchChip: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start',
      backgroundColor: colors.primarySoft, borderRadius: radii.pill,
      borderWidth: 1, borderColor: colors.primary,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      marginTop: spacing.sm, marginBottom: spacing.sm,
    },
    searchChipText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.primary },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch:       { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: colors.ink },
    emojiBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emojiBtnActive:{ borderColor: colors.primary, backgroundColor: colors.primarySoft },
    hint: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.md },
  });
}
