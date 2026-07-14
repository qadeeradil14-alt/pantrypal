import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { useThemeStore } from '../../store/theme';

type AppearanceOption = 'system' | 'light' | 'dark';

export default function AppearanceScreen() {
  const { colors } = useTheme();
  const { isDark: stored, setIsDark } = useThemeStore();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const current: AppearanceOption = stored === null ? 'system' : stored ? 'dark' : 'light';
  const options: { value: AppearanceOption; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const descriptions: Record<AppearanceOption, string> = {
    system: 'Follows iOS system appearance',
    light: 'Always use light mode',
    dark: 'Always use dark mode',
  };
  const handle = (v: AppearanceOption) => {
    if (v === 'system') setIsDark(null);
    else if (v === 'light') setIsDark(false);
    else setIsDark(true);
  };

  return (
    <Screen>
      <SubScreenHeader eyebrow="App" title="Appearance" />
      <Card style={styles.sectionCard}>
        <View style={styles.appearanceRow}>
          <View style={styles.rowIcon}>
            <Ionicons name="contrast-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appearanceLabel}>Appearance</Text>
            <View style={styles.appearanceChips}>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.appearanceChip, current === opt.value && styles.appearanceChipActive]}
                  onPress={() => handle(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: current === opt.value }}
                  accessibilityLabel={opt.label + (opt.value === 'system' ? ' (Recommended)' : '')}
                >
                  <Text style={[styles.appearanceChipText, current === opt.value && styles.appearanceChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.appearanceDesc}>{descriptions[current]}</Text>
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
    appearanceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    appearanceLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, marginBottom: spacing.sm },
    appearanceChips: { flexDirection: 'row', gap: spacing.sm },
    appearanceChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 8,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    appearanceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    appearanceChipText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.inkSoft },
    appearanceChipTextActive: { color: colors.onPrimary },
    appearanceDesc: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  });
}
