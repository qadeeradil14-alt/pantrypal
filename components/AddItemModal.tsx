import { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { addItemWithQueue } from '../lib/items';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics';
import { CATEGORY_LABELS, type ItemCategory } from '../constants/defaultItems';
import { useTheme } from '../hooks/useTheme';
import type { AppColors } from '../constants/theme';
import ScalePressable from './ScalePressable';

const CATEGORIES: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  fridge: '🥛',
  freezer: '🧊',
  pantry: '🧺',
};

interface Props {
  householdId: string;
  userId: string;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, onClose }: Props) {
  const { colors } = useTheme();
  const { items, upsertItem } = useItemsStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('fridge');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ready = UUID_RE.test(householdId);

  const styles = useMemo(() => makeStyles(colors), [colors]);

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
      setError(`"${existing.name}" is already in your pantry.`);
      void hapticWarning();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { item, queued } = await addItemWithQueue(householdId, normalized, category, userId);
      upsertItem(item);
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
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>New item</Text>
              <Text style={styles.subtitle}>Track what your household uses.</Text>
            </View>
            <View style={styles.sheetIcon}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Milk, eggs, rice..."
            autoFocus
            value={name}
            onChangeText={(t) => { setName(t); if (error) setError(''); }}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            placeholderTextColor={colors.placeholder}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <ScalePressable
                  key={cat}
                  profile="chip"
                  style={[styles.catBtn, active && styles.catBtnActive]}
                  onPress={() => { void hapticSelection(); setCategory(cat); }}
                >
                  <Text style={styles.catEmoji}>{CATEGORY_EMOJI[cat]}</Text>
                  <Text style={[styles.catLabel, active && styles.catLabelActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </ScalePressable>
              );
            })}
          </View>

          <ScalePressable
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addBtnText}>Add to pantry</Text>}
          </ScalePressable>

          <ScalePressable style={styles.cancelBtn} profile="chip" onPress={() => { void hapticSelection(); onClose(); }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(15, 10, 8, 0.5)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      paddingBottom: 40,
    },
    handle: {
      width: 36, height: 4,
      backgroundColor: colors.faint,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 18,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    sheetIcon: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 4, letterSpacing: -0.2 },
    subtitle: { fontSize: 14, color: colors.muted },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      marginBottom: 20,
      color: colors.ink,
      backgroundColor: colors.background,
    },
    label: {
      fontSize: 12, fontWeight: '800',
      color: colors.muted,
      textTransform: 'uppercase',
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    catBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 6,
    },
    catBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    catEmoji: { fontSize: 22 },
    catLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
    catLabelActive: { color: colors.primary },
    addBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 10,
    },
    addBtnDisabled: { backgroundColor: colors.disabled },
    addBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    cancelBtn: { paddingVertical: 14, alignItems: 'center' },
    cancelText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  });
}
