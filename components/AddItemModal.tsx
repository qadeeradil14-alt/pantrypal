import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useItemsStore } from '../store/items';
import { addItem } from '../lib/items';
import { CATEGORY_LABELS, type ItemCategory } from '../constants/defaultItems';
import { colors, radii, shadow } from '../constants/theme';

const CATEGORIES: ItemCategory[] = ['fridge', 'freezer', 'pantry'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_ICON: Record<ItemCategory, React.ComponentProps<typeof Ionicons>['name']> = {
  fridge: 'leaf-outline',
  freezer: 'snow-outline',
  pantry: 'basket-outline',
};

interface Props {
  householdId: string;
  userId: string;
  onClose: () => void;
}

export default function AddItemModal({ householdId, userId, onClose }: Props) {
  const { items, upsertItem } = useItemsStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('fridge');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ready = UUID_RE.test(householdId);

  async function handleAdd() {
    if (!ready) {
      setError('Still loading your household. Please close and reopen Add item.');
      return;
    }

    const normalized = name.trim();
    if (!normalized) { setError('Enter an item name.'); return; }

    const existing = items.find((i) => i.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) {
      setError(`"${existing.name}" is already in your pantry list.`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const item = await addItem(householdId, normalized, category, userId);
      upsertItem(item);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not add item.');
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

          <Text style={styles.title}>New item</Text>
          <Text style={styles.subtitle}>Add something your household checks often.</Text>

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
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catBtn, category === cat && styles.catBtnActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={CATEGORY_ICON[cat]}
                  size={22}
                  color={category === cat ? colors.surface : colors.primaryDeep}
                />
                <Text style={[styles.catLabel, category === cat && styles.catLabelActive]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.addBtn, (!ready || loading) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!ready || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addBtnText}>Add to pantry</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.6}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(43,33,24,0.42)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 24,
    paddingBottom: 40,
    ...shadow,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.faint,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 18,
  },
  errorBox: {
    backgroundColor: colors.lowSoft,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#8F321C',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  catBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    gap: 6,
  },
  catBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  catLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  catLabelActive: { color: colors.surface },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  addBtnDisabled: { backgroundColor: '#B7C9B8' },
  addBtnText: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
});
