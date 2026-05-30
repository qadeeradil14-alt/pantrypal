import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import { addItemWithQueue } from '../lib/items';
import { addStoreWithQueue, setItemStoreWithQueue, PRESET_STORES } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import { makeSheetStyles } from '../constants/sheetStyles';
import ScalePressable from './ScalePressable';
import StoreLogo from './StoreLogo';
import type { Item } from '../lib/items';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Props {
  householdId: string;
  userId: string;
  initialStoreId?: string | null;
  onAdded?: (item: Item) => void;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, initialStoreId, onAdded, onClose }: Props) {
  const { colors } = useTheme();
  const { items, upsertItem } = useItemsStore();
  const stores = useStoresStore((state) => state.stores);
  const addStoreToList = useStoresStore((s) => s.addStore);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState<string | null>(initialStoreId ?? stores[0]?.id ?? null);
  const [storeTouched, setStoreTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [storeAdding, setStoreAdding] = useState(false);
  const ready = UUID_RE.test(householdId);
  const nameInputRef = useRef<TextInput>(null);

  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors, sheetStyles), [colors, sheetStyles]);
  const existingNames = useMemo(() => new Set(stores.map((s) => s.name.toLowerCase())), [stores]);
  const presetSuggestions = useMemo(
    () => PRESET_STORES.filter((p) => !existingNames.has(p.toLowerCase())).slice(0, 8),
    [existingNames],
  );

  useEffect(() => {
    if (initialStoreId !== undefined) {
      setStoreId(initialStoreId);
      return;
    }
    if (!storeTouched && !storeId && stores.length > 0) setStoreId(stores[0].id);
  }, [initialStoreId, storeId, storeTouched, stores]);

  useEffect(() => {
    const focusTimer = setTimeout(() => nameInputRef.current?.focus(), 260);
    return () => clearTimeout(focusTimer);
  }, []);

  async function handleAddStore() {
    const trimmed = newStoreName.trim();
    if (!trimmed) return;
    setStoreAdding(true);
    try {
      const { store } = await addStoreWithQueue(householdId, trimmed);
      addStoreToList(store);
      setStoreId(store.id);
      setStoreTouched(true);
      setAddingStore(false);
      setNewStoreName('');
      void hapticSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Could not add store.');
      void hapticError();
    } finally {
      setStoreAdding(false);
    }
  }

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
      if (storeId && existing.preferred_store_id !== storeId) {
        const updated = { ...existing, preferred_store_id: storeId };
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
        return;
      }
      setError(`"${existing.name}" is already in My Groceries.`);
      void hapticWarning();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { item, queued } = await addItemWithQueue(householdId, normalized, 'pantry', userId, storeId);
      upsertItem(item);
      onAdded?.(item);
      void hapticSuccess();
      if (queued) {
        setError('Saved offline — will sync when you’re back online.');
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
              <Text style={sheetStyles.headerTitle}>New grocery</Text>
              <Text style={sheetStyles.headerSubtitle}>Add it to My Groceries.</Text>
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

          <Text style={styles.label}>Store</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {stores.map((store) => {
              const active = storeId === store.id;
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
                    {store.name}
                  </Text>
                </Pressable>
              );
            })}
            {!addingStore && (
              <Pressable
                style={({ pressed }) => [styles.chip, styles.chipAdd, pressed && { opacity: 0.75 }]}
                onPress={() => { void hapticSelection(); setAddingStore(true); }}
              >
                <Ionicons name="add" size={14} color={colors.muted} />
                <Text style={styles.chipAddText}>New</Text>
              </Pressable>
            )}
          </ScrollView>

          {addingStore && (
            <View style={styles.newStoreRow}>
              <TextInput
                style={styles.newStoreInput}
                placeholder="Store name…"
                placeholderTextColor={colors.placeholder}
                value={newStoreName}
                onChangeText={setNewStoreName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => { void handleAddStore(); }}
              />
              <Pressable
                style={({ pressed }) => [styles.newStoreAdd, (!newStoreName.trim() || storeAdding) && styles.newStoreAddDisabled, pressed && { opacity: 0.8 }]}
                onPress={() => { void handleAddStore(); }}
                disabled={!newStoreName.trim() || storeAdding}
              >
                {storeAdding
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.newStoreAddText}>Add</Text>}
              </Pressable>
              <Pressable onPress={() => { setAddingStore(false); setNewStoreName(''); }} hitSlop={8}>
                <Text style={styles.newStoreCancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {addingStore && presetSuggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetRow}
            >
              {presetSuggestions.map((preset) => (
                <Pressable
                  key={preset}
                  style={({ pressed }) => [styles.presetChip, pressed && { opacity: 0.7 }]}
                  onPress={() => { void hapticSelection(); setNewStoreName(preset); }}
                >
                  <Text style={styles.presetChipText}>{preset}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <ScalePressable
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
          >
            {loading
              ? <ActivityIndicator color={colors.onPrimary} />
              : <Text style={styles.addBtnText}>{storeId ? 'Add to store' : 'Add unassigned'}</Text>}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={() => { void hapticSelection(); onClose(); }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
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
      marginBottom: 20,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.body,
    },
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
    newStoreRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
    },
    newStoreInput: {
      flex: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: colors.ink,
      backgroundColor: colors.primarySoft,
      fontFamily: fonts.body,
    },
    newStoreAdd: {
      backgroundColor: colors.primary, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 9,
      alignItems: 'center', justifyContent: 'center', minWidth: 48,
    },
    newStoreAddDisabled: { backgroundColor: colors.disabled },
    newStoreAddText: { color: colors.onPrimary, fontSize: 13, fontFamily: fonts.bodySemiBold },
    newStoreCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.muted },
    presetScroll: { flexGrow: 0, marginBottom: 16 },
    presetRow: { gap: 8, flexDirection: 'row' },
    presetChip: {
      borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
      backgroundColor: colors.faint,
    },
    presetChipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.ink },
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
