/**
 * Home dashboard hero card — Pantry/Shopping summary tiles.
 * Deliberately not the generic `Card` primitive: it needs a "primary" tone
 * (solid brand background) as well as the default surface tone, plus a
 * value/label/sublabel/badge layout that's reused by both summary cards.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, shadow, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

export function SummaryCard({
  icon,
  label,
  value,
  sublabel,
  tone = 'surface',
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: 'primary' | 'surface';
  badge?: { label: string; tone: 'warning' | 'danger' | 'success' };
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors, tone), [colors, tone]);
  const badgeColors = badge ? badgeToneColors(colors, badge.tone) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, shadow.card, pressed && onPress ? { opacity: 0.9 } : null]}
    >
      <View style={s.iconChip}>
        <Ionicons name={icon} size={18} color={s.iconColor.color} />
      </View>
      <Text style={s.value}>{value}</Text>
      <Text style={s.label}>{label}</Text>
      {sublabel ? <Text style={s.sublabel}>{sublabel}</Text> : null}
      {badge && badgeColors ? (
        <View style={[s.badge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[s.badgeText, { color: badgeColors.fg }]}>{badge.label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function badgeToneColors(colors: AppColors, tone: 'warning' | 'danger' | 'success') {
  if (tone === 'danger') return { bg: colors.dangerSoft, fg: colors.danger };
  if (tone === 'success') return { bg: colors.successSoft, fg: colors.success };
  return { bg: colors.warningSoft, fg: colors.warning };
}

function makeStyles(c: AppColors, tone: 'primary' | 'surface') {
  const isPrimary = tone === 'primary';
  const fg = isPrimary ? c.onPrimary : c.ink;
  const muted = isPrimary ? c.onPrimary : c.muted;
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: isPrimary ? c.primary : c.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: isPrimary ? c.primary : c.border,
      padding: spacing.lg,
      minHeight: 128,
    },
    iconChip: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isPrimary ? c.onPrimary + '26' : c.primarySoft,
      marginBottom: spacing.md,
    },
    iconColor: { color: isPrimary ? c.onPrimary : c.primary },
    value: { fontFamily: fonts.mono, fontSize: 30, color: fg, marginBottom: 2 },
    label: { fontFamily: fonts.sansSemibold, fontSize: 13, color: fg },
    sublabel: { fontFamily: fonts.sans, fontSize: 12, color: muted, marginTop: 2, opacity: isPrimary ? 0.85 : 1 },
    badge: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: { fontFamily: fonts.sansSemibold, fontSize: 11 },
  });
}
