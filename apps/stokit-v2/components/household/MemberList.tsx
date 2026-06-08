import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { HouseholdMember } from '../../types';

export function MemberList({ members }: { members: HouseholdMember[] }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {members.map((m) => (
        <MemberRow key={m.id} member={m} />
      ))}
    </View>
  );
}

function MemberRow({ member }: { member: HouseholdMember }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: member.avatarColor + '33', borderColor: member.avatarColor + '55' }]}>
        <Text style={[styles.initials, { color: member.avatarColor }]}>{member.initials}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{member.displayName}</Text>
          {member.isMe && (
            <View style={styles.mePill}>
              <Text style={styles.meText}>You</Text>
            </View>
          )}
        </View>
        <Text style={styles.role}>
          {member.role === 'owner' ? '👑 Owner' : '👤 Member'}
        </Text>
      </View>

      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
    </View>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: { fontFamily: fonts.sansSemibold, fontSize: 16 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    name: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
    mePill: {
      backgroundColor: colors.primarySoft,
      borderRadius: radii.sm,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    meText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: colors.primary },
    role: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 2 },
  });
}
