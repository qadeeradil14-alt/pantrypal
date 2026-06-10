import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { addItemWithQueue } from '../lib/items';
import { setItemStoreWithQueue } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import { makeSheetStyles } from '../constants/sheetStyles';
import ScalePressable from './ScalePressable';
import ThemedPopup from './ThemedPopup';
import AddStoreModal from './AddStoreModal';
import type { Item } from '../lib/items';
import { inferCategory } from '../lib/barcodes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extract a short city/town hint from a saved store's address string.
 * Returns the first non-street, non-zip, non-country segment so chips can
 * show "Walmart · Alexandria" instead of just "Walmart".
 * Returns null when no useful hint is extractable.
 */
function storeLocationHint(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null; // single segment — can't extract city
  // Walk from the end, skipping country, state+zip, and bare zip codes.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (/^(united states|US)$/i.test(p)) continue;
    if (/^[A-Z]{2}\s+\d{5}(-\d{4})?$/.test(p)) continue; // "VA 22193"
    if (/^\d{5}(-\d{4})?$/.test(p)) continue;            // bare zip
    if (/^\d/.test(p)) continue;                          // street number
    if (p.length > 2) {
      // Keep at most 2 words (e.g. "Tysons Corner" → "Tysons Corner", "Woodbridge" → "Woodbridge")
      return p.split(/\s+/).slice(0, 2).join(' ');
    }
  }
  return null;
}

interface Props {
  householdId: string;
  userId: string;
  initialStoreId?: string | null;
  addToShopping?: boolean;
  onAdded?: (item: Item) => void;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, initialStoreId, addToShopping = false, onAdded, onClose }: Props) {
  const { colors } = useTheme();
  const { items, upsertItem } = useItemsStore();
  const stores = useStoresStore((state) => state.stores);
  const addStoreToList = useStoresStore((s) => s.addStore);
  const [name, setName] = useState('');
  // Default to null — never auto-select the first store alphabetically, which could be a
  // wrong-state or irrelevant store. User must explicitly pick a store.
  const [storeId, setStoreId] = useState<string | null>(initialStoreId ?? null);
  const [storeTouched, setStoreTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddStore, setShowAddStore] = useState(false);
  const [duplicateStoreItem, setDuplicateStoreItem] = useState<Item | null>(null);
  const ready = UUID_RE.test(householdId);
  const nameInputRef = useRef<TextInput>(null);

  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors, sheetStyles), [colors, sheetStyles]);
  const uniqueStores = useMemo(() => {
    const seen = new Set<string>();
    return stores.filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
  }, [stores]);
  const duplicateItem = useMemo(() => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    return items.find((i) => i.name.trim().toLowerCase() === normalized) ?? null;
  }, [items, name]);

  useEffect(() => {
    if (initialStoreId !== undefined) {
      setStoreId(initialStoreId);
    }
    // Do NOT auto-select stores[0] — the first store alphabetically may be wrong-state.
    // Users should explicitly choose their store.
  }, [initialStoreId]);

  useEffect(() => {
    const focusTimer = setTimeout(() => nameInputRef.current?.focus(), 260);
    return () => clearTimeout(focusTimer);
  }, []);

  async function handleAdd() {
    if (!ready) {
      setError('Still loading your household. Please close and reopen.');
      void hapticWarning();
      return;
    }
    const normalized = name.trim();
    if (!normalized) { setError('Enter an item name.'); void hapticWarning(); return; }
    const existing = items.find((i) => i.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) {
      // Always route through the popup — it lets the user update the store assignment
      // or dismiss cleanly, instead of hitting a dead-end error with no recovery path.
      setDuplicateStoreItem(existing);
      void hapticWarning();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const category = inferCategory(normalized);
      const { item, queued } = await addItemWithQueue(householdId, normalized, category, userId, storeId);
      upsertItem(item);
      onAdded?.(item);
      void hapticSuccess();
      Keyboard.dismiss();
      if (queued) {
        setError("Saved offline — will sync when you’re back online.");
        setTimeout(onClose, 900);
        return;
      }
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not add item.');
      void hapticError();
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateDuplicateStore() {
    const existing = duplicateStoreItem;
    if (!existing || !storeId) return;
    const updated = { ...existing, preferred_store_id: storeId };
    setDuplicateStoreItem(null);
    upsertItem(updated);
    setLoading(true);
    try {
      await setItemStoreWithQueue(existing.id, storeId);
      onAdded?.(updated);
      void hapticSuccess();
      onClose();
    } catch (e: any) {
      upsertItem(existing);
      setError(e.message ?? 'Could not update item.');
      void hapticError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={sheetStyles.formOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={sheetStyles.formSheet}>
          <View style={sheetStyles.handle} />

          <View style={styles.sheetHeader}>
            <View style={sheetStyles.headerEmoji}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
            <View style={sheetStyles.headerText}>
              <Text style={sheetStyles.headerTitle}>New item</Text>
              <Text style={sheetStyles.headerSubtitle}>Add it to your inventory.</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            ref={nameInputRef}
            style={styles.input}
            placeholder="Milk, eggs, rice..."
            value={name}
            onChangeText={(t) => { setName(t); if (error) setError(''); }}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            placeholderTextColor={colors.placeholder}
          />

          {duplicateItem ? (
            <View style={styles.duplicateBox}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
              <Text style={styles.duplicateText}>
                {duplicateItem.name} is already saved.{' '}
                {addToShopping
                  ? 'Tap Add to include it in this shopping trip.'
                  : storeId && storeId !== duplicateItem.preferred_store_id
                  ? 'Tap Add to move it to this store.'
                  : 'Select a different store to move it, or mark it low from the Pantry tab.'}
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>Store</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {uniqueStores.map((store) => {
              const active = storeId === store.id;
              const hint = storeLocationHint(store.address);
              return (
                <Pressable
                  key={store.id}
                  style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.75 }]}
                  onPress={() => {
                    void hapticSelection();
                    setStoreTouched(true);
                    setStoreId(active ? null : store.id);
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {hint ? `${store.name} · ${hint}` : store.name}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              key="__add_store__"
              style={({ pressed }) => [styles.chip, styles.chipAdd, pressed && { opacity: 0.75 }]}
              onPress={() => { void hapticSelection(); setShowAddStore(true); }}
            >
              <Ionicons name="add" size={14} color={colors.muted} />
              <Text style={styles.chipAddText}>New</Text>
            </Pressable>
          </ScrollView>

          <ScalePressable
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
          >
            {loading
              ? <ActivityIndicator color={colors.onPrimary} />
              : <Text style={styles.addBtnText}>{addToShopping ? 'Add to trip' : storeId ? 'Add to store' : 'Add unassigned'}</Text>}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={() => { void hapticSelection(); onClose(); }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
      <ThemedPopup
        visible={!!duplicateStoreItem}
        emoji="🛒"
        title="Already in your inventory"
        message={
          duplicateStoreItem && addToShopping
            ? `"${duplicateStoreItem.name}" is already saved. Add it to this shopping trip?`
            : duplicateStoreItem && storeId && storeId !== duplicateStoreItem.preferred_store_id
            ? `"${duplicateStoreItem.name}" is already saved. Move it to the selected store?`
            : duplicateStoreItem
              ? `"${duplicateStoreItem.name}" is already in your pantry. Mark it as low from the Pantry tab to add it to your shopping list.`
              : ''
        }
        primaryLabel={
          addToShopping
            ? 'Add to trip'
            : duplicateStoreItem && storeId && storeId !== duplicateStoreItem.preferred_store_id
            ? 'Move to store'
            : 'Got it'
        }
        onPrimary={() => {
          if (duplicateStoreItem && storeId && storeId !== duplicateStoreItem.preferred_store_id) {
            void handleUpdateDuplicateStore();
          } else if (duplicateStoreItem && addToShopping) {
            onAdded?.(duplicateStoreItem);
            setDuplicateStoreItem(null);
            onClose();
          } else {
            setDuplicateStoreItem(null);
          }
        }}
        secondaryLabel="Cancel"
        onSecondary={() => setDuplicateStoreItem(null)}
      />
      {showAddStore && (
        <AddStoreModal
          householdId={householdId}
          existingStores={stores}
          onAdd={(store) => {
            addStoreToList(store);
            setStoreId(store.id);
            setStoreTouched(true);
            setShowAddStore(false);
          }}
          onClose={() => setShowAddStore(false)}
        />
      )}
    </Modal>
  );
}

function makeStyles(colors: AppColors, sheetStyles: ReturnType<typeof makeSheetStyles>) {
  return StyleSheet.create({
    sheetHeader: {
      ...sheetStyles.header,
      marginBottom: 18,
    },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      marginBottom: 10,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.body,
    },
    duplicateBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
      backgroundColor: colors.warningSoft,
    },
    duplicateText: { flex: 1, fontSize: 13, color: colors.warning, fontFamily: fonts.bodySemiBold },
    label: {
      ...sheetStyles.sectionLabel,
      marginBottom: 10,
    },
    chipScroll: { flexGrow: 0, marginBottom: 16 },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.faint,
    },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    chipTextActive: { color: colors.onPrimary },
    chipAdd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    chipAddText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    addBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 14, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },
  });
}
