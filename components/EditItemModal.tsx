import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { useStoresStore } from '../store/stores';
import {
  ItemConflictError,
  isOfflineItemId,
  updateItemDetailsWithQueue,
  deleteItemWithQueue,
} from '../lib/items';
import { setItemStoreWithQueue } from '../lib/stores';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import type { Item } from '../lib/items';
import type { BarcodeProduct } from '../lib/barcodes';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';
import { makeSheetStyles } from '../constants/sheetStyles';
import ScalePressable from './ScalePressable';
import StoreLogo from './StoreLogo';
import BarcodeScannerModal from './BarcodeScannerModal';
import ThemedPopup from './ThemedPopup';

interface Props {
  item: Item;
  onClose: () => void;
}

function formatDateForInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseDateInput(s: string): string | null | undefined {
  const trimmed = s.trim();
  if (!trimmed) return null; // clear it
  const mdy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    const d = new Date(Date.UTC(year, month - 1, day, 12));
    if (
      month >= 1 && month <= 12
      && day >= 1 && day <= 31
      && d.getUTCFullYear() === year
      && d.getUTCMonth() === month - 1
      && d.getUTCDate() === day
    ) return d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T12:00:00Z');
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined; // invalid — keep as-is
}

export default function EditItemModal({ item, onClose }: Props) {
  const { colors } = useTheme();
  const { updateItem, removeItem, restoreItem } = useItemsStore();
  const stores = useStoresStore((state) => state.stores);
  const [name, setName] = useState(item.name);
  const [storeId, setStoreId] = useState<string | null>(item.preferred_store_id);
  const [expiresAt, setExpiresAt] = useState(formatDateForInput(item.expires_at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const sheetStyles = useMemo(() => makeSheetStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors, sheetStyles), [colors, sheetStyles]);

  const isDirty = name.trim() !== item.name || storeId !== item.preferred_store_id || expiresAt !== formatDateForInput(item.expires_at);
  const visibleStores = useMemo(() => {
    if (showAllStores || stores.length <= 8) return stores;
    const shown = stores.slice(0, 8);
    const selected = stores.find((store) => store.id === storeId);
    if (selected && !shown.some((store) => store.id === selected.id)) {
      return [...shown.slice(0, 7), selected];
    }
    return shown;
  }, [showAllStores, storeId, stores]);
  const hiddenStoreCount = Math.max(0, stores.length - visibleStores.length);

  async function handleScannedProduct(product: BarcodeProduct, expiry: string | null): Promise<'added' | 'updated'> {
    setName(product.name);
    if (expiry) setExpiresAt(formatDateForInput(expiry));
    setShowScanner(false);
    void hapticSuccess();
    return 'updated';
  }

  useEffect(() => {
    const focusTimer = setTimeout(() => nameInputRef.current?.focus(), 260);
    return () => clearTimeout(focusTimer);
  }, []);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name cannot be empty.'); return; }
    const parsedExpiry = parseDateInput(expiresAt);
    if (parsedExpiry === undefined && expiresAt.trim() !== '') {
      setError('Use MM/DD/YYYY format for the expiry date (e.g. 04/16/1993).');
      return;
    }
    setError('');
    setSaving(true);
    const prev = { name: item.name, expires_at: item.expires_at, preferred_store_id: item.preferred_store_id };
    updateItem(item.id, { name: trimmed, expires_at: parsedExpiry ?? null, preferred_store_id: storeId });
    try {
      if (isOfflineItemId(item.id)) {
        setError("This item will sync when you're back online.");
        void hapticWarning();
        return;
      }
      const detailsDirty = trimmed !== item.name || expiresAt !== formatDateForInput(item.expires_at);
      const storeDirty = storeId !== item.preferred_store_id;
      const detailsResult = detailsDirty
        ? await updateItemDetailsWithQueue(
          item.id,
          { name: trimmed, expires_at: parsedExpiry ?? null },
          item.updated_at,
        )
        : { queued: false, item: undefined };
      if (storeDirty) {
        await setItemStoreWithQueue(item.id, storeId);
      }
      if (detailsResult.item) {
        const saved = detailsResult.item;
        updateItem(item.id, {
          name: saved.name,
          expires_at: saved.expires_at,
          preferred_store_id: storeId,
          updated_at: saved.updated_at,
        });
      }
      void hapticSuccess();
      if (detailsResult.queued) {
        setError("Saved offline — will sync when you're back online.");
        setTimeout(onClose, 900);
        return;
      }
      onClose();
    } catch (e: unknown) {
      updateItem(item.id, prev as any);
      if (e instanceof ItemConflictError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      }
      void hapticError();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    setShowDeleteConfirm(false);
    void hapticWarning();
    setDeleting(true);
    removeItem(item.id);
    try {
      await deleteItemWithQueue(item.id);
      void hapticSuccess();
      onClose();
    } catch (e: any) {
      restoreItem(item);
      setError(e?.message ?? 'Could not delete. Try again.');
      void hapticError();
    } finally {
      setDeleting(false);
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
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </View>
            <View style={sheetStyles.headerText}>
              <Text style={sheetStyles.headerTitle}>Edit item</Text>
              <Text style={sheetStyles.headerSubtitle}>Rename or assign a store.</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.nameRow}>
            <TextInput
              ref={nameInputRef}
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={(t) => { setName(t); if (error) setError(''); }}
              onSubmitEditing={handleSave}
              returnKeyType="done"
              placeholderTextColor={colors.placeholder}
            />
            <ScalePressable
              profile="chip"
              style={styles.scanBtn}
              onPress={() => { void hapticSelection(); setShowScanner(true); }}
            >
              <Ionicons name="barcode-outline" size={20} color={colors.primary} />
            </ScalePressable>
          </View>

          <Text style={styles.label}>Store</Text>
          {stores.length === 0 ? (
            <View style={styles.noStoresBox}>
              <Text style={styles.noStoresText}>No stores saved yet.</Text>
            </View>
          ) : (
            <View style={styles.storeGrid}>
              {visibleStores.map((store) => {
              const active = storeId === store.id;
              return (
                <ScalePressable
                  key={store.id}
                  profile="chip"
                  style={[styles.storeBtn, active && styles.storeBtnActive]}
                  onPress={() => { void hapticSelection(); setStoreId(active ? null : store.id); }}
                >
                  <StoreLogo name={store.name} size={32} domain={store.brand_domain} logoUrl={store.logo_url} />
                  <Text style={[styles.storeLabel, active && styles.storeLabelActive]} numberOfLines={1}>
                    {store.name}
                  </Text>
                </ScalePressable>
              );
            })}
              {!showAllStores && hiddenStoreCount > 0 && (
                <ScalePressable
                  profile="chip"
                  style={[styles.storeBtn, styles.moreStoresBtn]}
                  onPress={() => { void hapticSelection(); setShowAllStores(true); }}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
                  <Text style={[styles.storeLabel, styles.moreStoresLabel]} numberOfLines={1}>
                    More stores
                  </Text>
                </ScalePressable>
              )}
            </View>
          )}

          <Text style={styles.label}>Best before</Text>
          <TextInput
            style={[styles.input, styles.expiryInput]}
            value={expiresAt}
            onChangeText={(t) => { setExpiresAt(t); if (error) setError(''); }}
            placeholder="MM/DD/YYYY  (optional)"
            placeholderTextColor={colors.placeholder}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            maxLength={10}
          />

          <ScalePressable
            style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isDirty || saving}
          >
            {saving
              ? <ActivityIndicator color={colors.onPrimary} />
              : <Text style={styles.saveBtnText}>Save changes</Text>}
          </ScalePressable>

          <ScalePressable
            profile="danger"
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator color={colors.danger} />
              : (
                <>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={styles.deleteBtnText}>Delete item</Text>
                </>
              )}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onAddProduct={handleScannedProduct}
        onManualAdd={() => setShowScanner(false)}
      />
      <ThemedPopup
        visible={showDeleteConfirm}
        emoji="🗑️"
        title="Delete item?"
        message={`Remove "${item.name}" from your pantry?`}
        primaryLabel="Delete"
        onPrimary={() => { void confirmDelete(); }}
        secondaryLabel="Cancel"
        onSecondary={() => setShowDeleteConfirm(false)}
        destructive
      />
    </Modal>
  );
}

function makeStyles(colors: AppColors, sheetStyles: ReturnType<typeof makeSheetStyles>) {
  return StyleSheet.create({
    sheetHeader: {
      ...sheetStyles.header,
      marginBottom: 18,
    },
    errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
    },
    nameInput: {
      flex: 1,
      marginBottom: 0,
    },
    scanBtn: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      backgroundColor: colors.primarySoft,
    },
    input: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      marginBottom: 20,
      color: colors.ink,
      backgroundColor: colors.faint,
      fontFamily: fonts.bodySemiBold,
    },
    label: {
      ...sheetStyles.sectionLabel,
      marginBottom: 10,
    },
    expiryInput: { marginBottom: 20, fontFamily: fonts.mono, fontSize: 15 },
    storeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    storeBtn: {
      width: '31%',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 12,
      backgroundColor: colors.faint,
      gap: 5,
    },
    storeBtnActive: { backgroundColor: colors.primarySoft },
    moreStoresBtn: { borderWidth: 1, borderColor: colors.border },
    storeLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.bodySemiBold, textAlign: 'center' },
    moreStoresLabel: { color: colors.primary },
    storeLabelActive: { color: colors.primary },
    noStoresBox: {
      borderRadius: 14,
      backgroundColor: colors.faint,
      padding: 14,
      marginBottom: 24,
    },
    noStoresText: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.bodyMedium },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', marginBottom: 10,
    },
    saveBtnDisabled: { backgroundColor: colors.disabled },
    saveBtnText: { color: colors.onPrimary, fontSize: 17, fontFamily: fonts.bodySemiBold },
    deleteBtn: {
      flexDirection: 'row', gap: 8,
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderRadius: 14,
      backgroundColor: colors.dangerSoft,
      marginBottom: 8,
    },
    deleteBtnText: { color: colors.danger, fontSize: 15, fontFamily: fonts.bodySemiBold },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontFamily: fonts.bodySemiBold },
  });
}
