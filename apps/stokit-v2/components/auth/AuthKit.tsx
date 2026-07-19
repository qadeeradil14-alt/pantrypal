/**
 * AuthKit — the shared design system for every onboarding/auth screen.
 *
 * One source of truth for spacing, typography, corner radius, shadows, inputs,
 * buttons and the brand header so Welcome, Sign In, Create Account, Verify
 * Email, Forgot Password and Join all share a single cohesive look. Everything
 * is theme-aware (light/dark) via useTheme() — no hardcoded palettes.
 */
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../shared/Logo';
import { authBackgroundLight, fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

// Shared tokens — the single place these values live.
export const AUTH_FIELD_HEIGHT = 54;
export const AUTH_BUTTON_HEIGHT = 56;
export const AUTH_RADIUS = radii.auth;
export function authBackground(colors: AppColors, isDark: boolean) {
  return isDark ? '#0F1117' : authBackgroundLight;
}

/** Full-screen scaffold: safe areas, themed background, keyboard avoidance,
 *  and a vertically-centred scroll area so short and tall screens both work. */
export function AuthScreen({ children, backgroundColor }: { children: React.ReactNode; backgroundColor?: string }) {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  return (
    <SafeAreaView style={[styles.screen, backgroundColor ? { backgroundColor } : undefined]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Brand lockup: the "S" mark, the Stokit wordmark, and the tagline. Left
 *  aligned to match the reference. */
export function BrandHeader({ align = 'left' }: { align?: 'left' | 'center' }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  return (
    <View style={[styles.brandRow, align === 'center' && styles.brandCenter]}>
      <View style={styles.brandMark}>
        <Logo size={30} color={colors.ink} accent={colors.primary} />
      </View>
      <Text style={styles.brandWordmark}>Stokit</Text>
      <Text style={styles.brandTagline}>
        Your kitchen, <Text style={{ color: colors.primary, fontFamily: fonts.sansSemibold }}>always</Text> in order.
      </Text>
    </View>
  );
}

/** Screen title + optional subtitle, consistent scale everywhere. */
export function AuthHeading({ title, subtitle, align = 'left' }: { title: string; subtitle?: string; align?: 'left' | 'center' }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  return (
    <View style={[styles.headingBlock, align === 'center' && { alignItems: 'center' }]}>
      <Text style={[styles.title, align === 'center' && { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, align === 'center' && { textAlign: 'center' }]}>{subtitle}</Text> : null}
    </View>
  );
}

type AuthFieldProps = TextInputProps & {
  icon: keyof typeof Ionicons.glyphMap;
  /** Renders a show/hide eye toggle and manages secure entry internally. */
  secure?: boolean;
};

/** Rounded input with a leading icon, and an optional password eye toggle. */
export function AuthField({ icon, secure, style, ...props }: AuthFieldProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  const [hidden, setHidden] = React.useState(true);
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={19} color={colors.muted} style={styles.fieldIcon} />
      <TextInput
        placeholderTextColor={colors.faintText}
        style={[styles.fieldInput, style]}
        secureTextEntry={secure ? hidden : false}
        {...props}
      />
      {secure ? (
        <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

type AuthButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

/** The one button used across all auth screens. Identical height/radius/
 *  typography/orange/shadow for every primary CTA. */
export function AuthButton({ label, onPress, variant = 'primary', loading, disabled, icon }: AuthButtonProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const textColor = isPrimary ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        isPrimary && styles.btnPrimary,
        isOutline && styles.btnOutline,
        variant === 'ghost' && styles.btnGhost,
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Ionicons name={icon} size={19} color={textColor} /> : null}
          <Text style={[styles.btnText, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** "or" divider between primary and alternate actions. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/** Inline centred text link ("Already have an account? Sign in"). */
export function AuthLink({ prefix, action, onPress, compact = false }: { prefix?: string; action: string; onPress: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  return (
    <Text style={[styles.linkRow, compact && styles.linkRowCompact]}>
      {prefix ? <Text style={styles.linkPrefix}>{prefix} </Text> : null}
      <Text style={styles.linkAction} onPress={onPress} accessibilityRole="link">{action}</Text>
    </Text>
  );
}

/** Inline error / success banners with consistent styling. */
export function AuthMessage({ text, tone = 'error' }: { text: string; tone?: 'error' | 'success' }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, false), [colors]);
  if (!text) return null;
  return <Text style={[styles.message, tone === 'success' && { color: colors.success }]}>{text}</Text>;
}

function makeStyles(colors: AppColors, isDark: boolean) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: authBackground(colors, isDark) },
    scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },

    brandRow: { alignItems: 'flex-start', marginBottom: spacing.xxl },
    brandCenter: { alignItems: 'center' },
    brandMark: {
      width: 46,
      height: 46,
      borderRadius: 13,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    brandWordmark: { fontFamily: fonts.serifItalic, fontSize: 30, lineHeight: 34, color: colors.ink },
    brandTagline: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginTop: 2 },

    headingBlock: { marginBottom: spacing.xl },
    title: { fontFamily: fonts.serifItalic, fontSize: 32, lineHeight: 39, color: colors.ink },
    subtitle: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: spacing.sm },

    field: {
      minHeight: AUTH_FIELD_HEIGHT,
      borderRadius: AUTH_RADIUS,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    },
    fieldIcon: { width: 22, textAlign: 'center' },
    fieldInput: { flex: 1, height: AUTH_FIELD_HEIGHT, color: colors.ink, fontFamily: fonts.sans, fontSize: 16 },

    btn: {
      minHeight: AUTH_BUTTON_HEIGHT,
      borderRadius: AUTH_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    btnPrimary: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    btnOutline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
    btnGhost: { backgroundColor: 'transparent', minHeight: 44 },
    btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    btnText: { fontFamily: fonts.sansSemibold, fontSize: 17 },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },

    linkRow: { textAlign: 'center', marginTop: spacing.xl },
    linkRowCompact: { marginTop: 0 },
    linkPrefix: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted },
    linkAction: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.primary },

    message: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: colors.danger, marginBottom: spacing.sm },
  });
}
