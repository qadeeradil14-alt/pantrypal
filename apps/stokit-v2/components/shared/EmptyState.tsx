import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { Button } from './ui';
import { useTheme } from '../../hooks/useTheme';

/** Premium guided empty state used across screens. */
export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  steps,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  steps?: string[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {steps?.length ? (
        <View style={styles.steps}>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={{ marginTop: spacing.xl, alignSelf: 'stretch' }} />
      ) : null}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.sm,
    },
    iconRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontFamily: fonts.sansSemibold,
      fontSize: 21,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      textAlign: 'center',
      maxWidth: 300,
    },
    steps: {
      alignSelf: 'stretch',
      marginTop: spacing.xl,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.lg,
      gap: spacing.md,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepNum: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.primary },
    stepText: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkSoft, flex: 1 },
  });
}
