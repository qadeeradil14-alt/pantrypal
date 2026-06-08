/**
 * Stacked circular member avatar chips — shown in the Pantry header.
 * Mirrors the couple-photo style from the V1 reference image.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { HouseholdMember } from '../../types';

const SIZE = 40;
const OVERLAP = 14;

export function MemberAvatars({
  members,
  onPress,
}: {
  members: HouseholdMember[];
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const visible = members.slice(0, 3);

  if (visible.length === 0) {
    return (
      <Pressable onPress={onPress} style={styles.emptyBtn} hitSlop={8}>
        <Ionicons name="people-outline" size={22} color={colors.muted} />
      </Pressable>
    );
  }

  const totalWidth = SIZE + (visible.length - 1) * (SIZE - OVERLAP);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.stack, { width: totalWidth }]}>
        {visible.map((m, i) => (
          <View
            key={m.id}
            style={[
              styles.avatar,
              {
                backgroundColor: m.avatarColor + '33',
                borderColor: m.avatarColor,
                left: i * (SIZE - OVERLAP),
                zIndex: visible.length - i,
              },
            ]}
          >
            <Text style={[styles.initials, { color: m.avatarColor }]}>
              {m.initials}
            </Text>
          </View>
        ))}
      </View>
      {/* Household icon badge */}
      <View style={styles.badge}>
        <Ionicons name="people" size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stack: { height: SIZE, position: 'relative' },
    avatar: {
      position: 'absolute',
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
