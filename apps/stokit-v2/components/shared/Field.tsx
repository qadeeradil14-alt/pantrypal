import React, { useMemo, useEffect, useRef, forwardRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { chipScrollOffset } from '../../core/services/chipScroll';

export function FieldLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.label}>{children}</Text>;
}

export const TextField = forwardRef<TextInput, {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void;
  blurOnSubmit?: boolean;
}>(({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  autoCapitalize,
  autoCorrect,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}, ref) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faintText}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        style={styles.input}
      />
    </View>
  );
});

export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);
  const scrollX = useRef(0);

  useEffect(() => {
    if (value == null) return;
    const chip = chipLayouts.current[value];
    if (!chip) return;
    const offset = chipScrollOffset(chip, viewportWidth.current, scrollX.current);
    if (offset == null) return;
    scrollRef.current?.scrollTo({ x: offset, animated: true });
  }, [value]);

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => { viewportWidth.current = e.nativeEvent.layout.width; }}
        onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
      >
        <View style={styles.chipRow}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange(opt.value)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  chipLayouts.current[opt.value] = { x, width };
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.stepper}>
        <Pressable
          style={styles.stepBtn}
          onPress={() => onChange(Math.max(min, value - 1))}
        >
          <Ionicons name="remove" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable style={styles.stepBtn} onPress={() => onChange(value + 1)}>
          <Ionicons name="add" size={20} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    field: { marginBottom: spacing.lg },
    label: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.muted,
      marginBottom: spacing.sm,
      letterSpacing: 0.3,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      height: 50,
      fontFamily: fonts.sans,
      fontSize: 16,
      letterSpacing: 0,
      color: colors.ink,
    },
    chipRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
    chip: {
      paddingHorizontal: spacing.lg,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.inkSoft },
    chipTextActive: { color: colors.onPrimary },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepBtn: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
    stepValue: {
      fontFamily: fonts.monoMedium,
      fontSize: 18,
      color: colors.ink,
      minWidth: 40,
      textAlign: 'center',
    },
  });
}
