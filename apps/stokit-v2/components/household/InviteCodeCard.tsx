/**
 * Shows the household invite code prominently with a Share button.
 * Sits inside SettingsScreen's Household section.
 */
import React from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { formatInviteCode, buildInviteMessage } from '../../core/services/household';

export function InviteCodeCard({
  householdName,
  inviteCode,
}: {
  householdName: string;
  inviteCode: string;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const formatted = formatInviteCode(inviteCode);

  const share = async () => {
    try {
      await Share.share({
        message: buildInviteMessage(householdName, inviteCode),
        title: `Join ${householdName} on Stokit`,
      });
    } catch {
      Alert.alert('Could not share', 'Try copying the code manually.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Ionicons name="people" size={16} color={colors.primary} />
        <Text style={styles.label}>Invite code</Text>
      </View>

      <Text style={styles.code}>{formatted}</Text>
      <Text style={styles.hint}>
        Share this code with family members so they can join your household.
      </Text>

      <Pressable
        onPress={share}
        style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.75 }]}
      >
        <Ionicons name="share-outline" size={16} color={colors.primary} />
        <Text style={styles.shareBtnText}>Invite a member</Text>
      </Pressable>
    </View>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.primarySoft,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.primary + '44',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
    code: {
      fontFamily: fonts.monoMedium,
      fontSize: 32,
      color: colors.ink,
      letterSpacing: 6,
      textAlign: 'center',
      paddingVertical: spacing.sm,
    },
    hint: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.primary,
      marginTop: spacing.sm,
    },
    shareBtnText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.background },
  });
}
