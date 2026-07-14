import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import type { HouseholdMember } from '../../types';
import { Avatar } from '../shared/Avatar';

type MemberListProps = {
  members: HouseholdMember[];
  canRemove?: boolean;
  canTransfer?: boolean;
  removingMemberId?: string | null;
  transferringMemberId?: string | null;
  onRemove?: (member: HouseholdMember) => void;
  onTransfer?: (member: HouseholdMember) => void;
};

export function MemberList({
  members,
  canRemove = false,
  canTransfer = false,
  removingMemberId = null,
  transferringMemberId = null,
  onRemove,
  onTransfer,
}: MemberListProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      {members.map((m) => (
        <MemberRow
          key={m.id}
          member={m}
          canRemove={canRemove && !m.isMe && m.role !== 'owner'}
          canTransfer={canTransfer && !m.isMe && m.role === 'member'}
          removing={removingMemberId === m.id}
          transferring={transferringMemberId === m.id}
          onRemove={onRemove}
          onTransfer={onTransfer}
        />
      ))}
    </View>
  );
}

function MemberRow({
  member,
  canRemove,
  canTransfer,
  removing,
  transferring,
  onRemove,
  onTransfer,
}: {
  member: HouseholdMember;
  canRemove: boolean;
  canTransfer: boolean;
  removing: boolean;
  transferring: boolean;
  onRemove?: (member: HouseholdMember) => void;
  onTransfer?: (member: HouseholdMember) => void;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Avatar
        photoUrl={member.avatarUrl}
        displayName={member.displayName}
        color={member.avatarColor}
        size={44}
        borderColor={`${member.avatarColor}55`}
      />

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

      {canRemove || canTransfer ? (
        <View style={styles.actions}>
          {canTransfer ? (
            <Pressable
              disabled={transferring || removing}
              onPress={() => onTransfer?.(member)}
              style={({ pressed }) => [styles.transferButton, pressed && { opacity: 0.7 }, transferring && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`Transfer ownership to ${member.displayName}`}
            >
              {transferring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
                  <Text style={styles.transferText}>Transfer</Text>
                </>
              )}
            </Pressable>
          ) : null}
          {canRemove ? (
            <Pressable
              disabled={removing || transferring}
              onPress={() => onRemove?.(member)}
              style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.7 }, removing && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${member.displayName}`}
            >
              {removing ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <>
                  <Ionicons name="person-remove-outline" size={15} color={colors.danger} />
                  <Text style={styles.removeText}>Remove</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      )}
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
    actions: { gap: spacing.xs, alignItems: 'stretch' },
    transferButton: {
      minHeight: 32,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.primarySoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    transferText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary },
    removeButton: {
      minHeight: 34,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.danger + '55',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    removeText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.danger },
  });
}
