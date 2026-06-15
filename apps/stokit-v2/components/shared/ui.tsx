/** Small shared primitives: PageTitle, Card, Button, Pill, StatTile, etc. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { fonts, radii, shadow, spacing, type } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { getStoreBrand } from '../../core/services/storeBrands';

export function PageTitle({
  title,
  eyebrow,
  right,
}: {
  title: string;
  eyebrow?: string;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[type.pageTitle, { color: colors.ink }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={[type.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          shadow.card,
          pressed && { opacity: 0.85 },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  small,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const press = () => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  const palette: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.ink, border: colors.border },
    subtle: { bg: colors.surfaceRaised, fg: colors.ink, border: colors.border },
  };
  const p = palette[variant];
  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          small && { fontSize: 13 },
          { color: p.fg },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'muted',
  style,
  textStyle,
}: {
  label: string;
  tone?: 'low' | 'expiring' | 'stocked' | 'muted';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tones = {
    low: { bg: colors.warningSoft, fg: colors.warning },
    expiring: { bg: colors.dangerSoft, fg: colors.danger },
    stocked: { bg: colors.successSoft, fg: colors.success },
    muted: { bg: colors.surfaceRaised, fg: colors.muted },
  } as const;
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.pillText, { color: t.fg }, textStyle]}>{label}</Text>
    </View>
  );
}

export function StatTile({
  value,
  label,
  tone = 'ink',
}: {
  value: number | string;
  label: string;
  tone?: 'ink' | 'primary' | 'danger';
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color =
    tone === 'primary'
      ? colors.primary
      : tone === 'danger'
      ? colors.danger
      : colors.ink;
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Round logo chip for a store. Visual only — never gates business logic.
 *
 * Priority order:
 *  1. Saved or verified brand logo image.
 *  2. Custom emoji (user-defined on the store record).
 *  3. Brand abbreviation on brand-color background (known chains, image failed).
 *  4. First-letter chip on a neutral background (unknown/local stores).
 *
 * Image errors fall back silently to the letter chip — no broken image icons.
 * Unknown/local stores never guess a domain or make a logo network request.
 */
export function StoreChip({
  store,
  name: propName,
  emoji: propEmoji,
  color: propColor,
  logoUrl: propLogoUrl,
  size = 44,
}: {
  store?: any; // To avoid circular imports, just use any or a loose type, or we can just expect the properties
  name?: string;
  emoji?: string;
  color?: string;
  logoUrl?: string;
  size?: number;
}) {
  const { colors: themeColors } = useTheme();
  
  const name = store?.name ?? propName ?? '?';
  const color = store?.logoColor ?? propColor;
  const emoji = store?.logoEmoji ?? propEmoji;
  const logoUrlParam = store?.logoUrl ?? propLogoUrl;

  const brand = getStoreBrand(name, color);
  const [imgError, setImgError] = useState(false);
  useEffect(() => setImgError(false), [logoUrlParam, name]);

  // Brand logo always wins for known chains (brand.logoUrl defined), OR if logoUrlParam is provided
  // User-set emoji is only shown for local/custom stores with no brand logo.
  const logoUrl = logoUrlParam || brand.logoUrl;
  const showImage = !!logoUrl && !imgError;

  const bg = color ?? brand.color;
  // Emoji used only when brand has no verified logo
  const glyph = (!logoUrl && emoji) || brand.abbr || (name.trim().charAt(0).toUpperCase() || '?');
  const isEmoji = !logoUrl && !!emoji;

  const chipStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (showImage) {
    return (
      <View style={{ ...chipStyle, backgroundColor: themeColors.surfaceRaised, borderWidth: 1, borderColor: themeColors.borderSoft }}>
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  if (isEmoji) {
    return (
      <View style={{ ...chipStyle, backgroundColor: bg }}>
        <Text
          style={{
            fontSize: size * 0.46,
            fontFamily: fonts.serif,
            color: themeColors.ink,
            letterSpacing: 0.3,
          }}
        >
          {glyph}
        </Text>
      </View>
    );
  }

  // Letter/abbr chip — always shown when no image or emoji is available.
  // Never show the app icon inside a store chip.
  return (
    <View style={{ ...chipStyle, backgroundColor: bg }}>
      <Text
        style={{
          fontSize: size * 0.38,
          fontFamily: fonts.sansSemibold,
          color: '#fff',
          letterSpacing: 0.5,
        }}
      >
        {glyph}
      </Text>
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.divider} />;
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: spacing.xl,
    },
    eyebrow: {
      fontFamily: fonts.monoMedium,
      fontSize: 11,
      letterSpacing: 1.5,
      color: colors.muted,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xxl,
      marginBottom: spacing.md,
    },
    sectionAction: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: colors.primary,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.lg,
    },
    button: {
      height: 50,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    buttonSmall: {
      height: 38,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.lg,
    },
    buttonLabel: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
    },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radii.sm,
      alignSelf: 'flex-start',
    },
    pillText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    statTile: {
      flex: 1,
      alignItems: 'flex-start',
    },
    statValue: {
      fontFamily: fonts.mono,
      fontSize: 30,
    },
    statLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      letterSpacing: 0.3,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.lg,
    },
  });
}
