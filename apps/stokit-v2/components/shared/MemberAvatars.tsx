/**
 * Stacked circular member avatar chips — shown in the Pantry header.
 * Mirrors the couple-photo style from the V1 reference image.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { HouseholdMember } from '../../types';
import { Avatar } from './Avatar';

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
        <Avatar color={colors.muted} size={36} borderColor={colors.border} />
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
                left: i * (SIZE - OVERLAP),
                zIndex: visible.length - i,
              },
            ]}
          >
            <Avatar
              photoUrl={m.avatarUrl}
              displayName={m.displayName}
              color={m.avatarColor}
              size={SIZE}
              borderWidth={2}
            />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    stack: { height: SIZE, position: 'relative' },
    avatar: {
      position: 'absolute',
      width: SIZE,
      height: SIZE,
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
