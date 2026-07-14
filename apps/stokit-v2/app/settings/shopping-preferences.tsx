import React, { useMemo } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { ChipSelect } from '../../components/shared/Field';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useTheme } from '../../hooks/useTheme';
import type { Unit } from '../../types';

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'unit', label: 'unit' },
  { value: 'gal', label: 'gal' },
  { value: 'L', label: 'L' },
  { value: 'lb', label: 'lb' },
  { value: 'pack', label: 'pack' },
];

export default function ShoppingPreferencesScreen() {
  const { colors } = useTheme();
  const prefs = useDurableStore((s) => s.prefs);
  const updatePrefs = useDurableStore((s) => s.updatePrefs);
  const items = useDurableStore((s) => s.items);
  const stores = useDurableStore((s) => s.stores);
  const trips = useDurableStore((s) => s.trips);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const editBudget = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Weekly budget',
        'Set your weekly grocery budget (e.g. 200).',
        (value) => {
          const parsed = parseFloat(value ?? '');
          if (!isNaN(parsed) && parsed > 0) updatePrefs({ weeklyBudget: Math.round(parsed) });
        },
        'plain-text',
        String(prefs.weeklyBudget ?? 200),
        'numeric',
      );
    } else {
      Alert.alert(
        'Weekly budget',
        `Current budget: $${prefs.weeklyBudget ?? 200}\n\nTo change, update in your preferences.`,
      );
    }
  };

  return (
    <Screen>
      <SubScreenHeader eyebrow="App" title="Shopping Preferences" />
      <Card style={styles.sectionCard}>
        <ChipSelect
          label="Default unit for new items"
          options={UNIT_OPTIONS}
          value={prefs.defaultUnit}
          onChange={(v) => updatePrefs({ defaultUnit: v })}
        />
        <Pressable
          style={({ pressed }) => [styles.settingsRow, styles.settingsRowBordered, pressed && styles.settingsRowPressed]}
          onPress={editBudget}
        >
          <View style={styles.budgetLeft}>
            <View style={styles.rowIcon}>
              <Ionicons name="wallet-outline" size={19} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.budgetLabel}>Weekly budget</Text>
              <Text style={styles.budgetSub}>Tap to adjust</Text>
            </View>
          </View>
          <View style={styles.budgetRight}>
            <Text style={styles.budgetAmount}>${prefs.weeklyBudget ?? 200}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.muted} />
          </View>
        </Pressable>
        <View style={styles.preferenceStats}>
          <View style={styles.preferenceStat}>
            <Text style={styles.preferenceStatValue}>{items.length}</Text>
            <Text style={styles.preferenceStatLabel}>Items</Text>
          </View>
          <View style={styles.preferenceStatDivider} />
          <View style={styles.preferenceStat}>
            <Text style={styles.preferenceStatValue}>{stores.length}</Text>
            <Text style={styles.preferenceStatLabel}>Stores</Text>
          </View>
          <View style={styles.preferenceStatDivider} />
          <View style={styles.preferenceStat}>
            <Text style={styles.preferenceStatValue}>{trips.length}</Text>
            <Text style={styles.preferenceStatLabel}>Trips</Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    settingsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radii.md,
    },
    settingsRowBordered: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
    },
    settingsRowPressed: { opacity: 0.68, backgroundColor: colors.surface },
    budgetLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    budgetRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    budgetLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    budgetSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    budgetAmount: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
    preferenceStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    preferenceStat: { flex: 1, alignItems: 'center' },
    preferenceStatValue: { fontFamily: fonts.mono, fontSize: 22, color: colors.ink, fontVariant: ['tabular-nums'] },
    preferenceStatLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.muted, marginTop: 2, letterSpacing: 0.3 },
    preferenceStatDivider: { width: 1, height: 32, backgroundColor: colors.borderSoft },
  });
}
