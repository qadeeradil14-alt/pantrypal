import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/shared/Screen';
import { SubScreenHeader } from '../components/shared/SubScreenHeader';
import { Button, Card } from '../components/shared/ui';
import { fonts, spacing, type AppColors } from '../theme';
import { useHouseholdStore } from '../store/household-store';
import { CreateHouseholdSheet } from '../components/household/CreateHouseholdSheet';
import { JoinHouseholdSheet } from '../components/household/JoinHouseholdSheet';
import { InviteCodeCard } from '../components/household/InviteCodeCard';
import { MemberList } from '../components/household/MemberList';
import { householdCapabilities } from '../core/services/householdPermissions';
import { useTheme } from '../hooks/useTheme';

export default function HouseholdScreen() {
  const { colors } = useTheme();
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const syncStatus = useHouseholdStore((s) => s.syncStatus);
  const refreshHousehold = useHouseholdStore((s) => s.refresh);
  const leaveHousehold = useHouseholdStore((s) => s.leaveHousehold);
  const removeMember = useHouseholdStore((s) => s.removeMember);
  const transferOwnership = useHouseholdStore((s) => s.transferOwnership);
  const deleteHousehold = useHouseholdStore((s) => s.deleteHousehold);

  const isSharedOwnerWithMembers = Boolean(household && !household.isPersonal && household.role === 'owner' && members.length > 1);
  const capabilities = householdCapabilities(household?.role ?? 'member', members.length);

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [transferringMemberId, setTransferringMemberId] = useState<string | null>(null);
  const [deletingHousehold, setDeletingHousehold] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const confirmRemoveMember = (memberId: string, displayName: string) => {
    Alert.alert(
      'Remove household member?',
      `${displayName} will lose access to this shared pantry and shopping list. They will move back to their own private household.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingMemberId(memberId);
              const result = await removeMember(memberId);
              setRemovingMemberId(null);
              if (result.ok) {
                await refreshHousehold();
                Alert.alert('Member removed', `${displayName} no longer has access to this household.`);
              } else {
                Alert.alert('Could not remove member', result.message);
              }
            })();
          },
        },
      ],
    );
  };

  const confirmTransferOwnership = (memberId: string, displayName: string) => {
    Alert.alert(
      'Transfer household ownership?',
      `${displayName} will become the owner. You will become a regular member and lose owner-only controls.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer ownership',
          onPress: () => {
            void (async () => {
              setTransferringMemberId(memberId);
              const result = await transferOwnership(memberId);
              setTransferringMemberId(null);
              if (result.ok) {
                Alert.alert('Ownership transferred', `${displayName} is now the household owner.`);
              } else {
                Alert.alert('Could not transfer ownership', result.message);
              }
            })();
          },
        },
      ],
    );
  };

  const confirmDeleteHousehold = () => {
    Alert.alert(
      'Delete shared household?',
      'This permanently deletes the shared pantry, stores, receipts, shopping history, and activity. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete household',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingHousehold(true);
              const result = await deleteHousehold();
              setDeletingHousehold(false);
              if (result.ok) {
                Alert.alert('Household deleted', 'You now have a new private pantry.');
              } else {
                Alert.alert('Could not delete household', result.message);
              }
            })();
          },
        },
      ],
    );
  };

  const confirmLeaveHousehold = () => {
    Alert.alert(
      'Leave shared household?',
      'Your membership will be removed. Shared household data stays with the household and will be cleared from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void leaveHousehold().then((result) => {
          if (!result.ok) Alert.alert('Could not leave', result.message);
        }) },
      ],
    );
  };

  return (
    <Screen>
      <SubScreenHeader eyebrow="Shared pantry" title="Household" />

      <Card style={styles.sectionCard}>
        <View style={styles.householdHeader}>
          <View style={styles.householdIcon}>
            <Ionicons name={household?.isPersonal ? 'lock-closed-outline' : 'people-outline'} size={21} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.householdTitle}>
              {household?.isPersonal ? 'Private pantry' : household?.name ?? 'Account sync'}
            </Text>
            <Text style={styles.householdBody}>
              {household?.isPersonal
                ? 'Securely backed up and private to you.'
                : household
                ? `${members.length} member${members.length === 1 ? '' : 's'} share updates in real time.`
                : 'Sign in to securely back up your pantry.'}
            </Text>
          </View>
        </View>
        <View style={styles.syncRow}>
          <View style={[styles.syncDot, syncStatus === 'synced' && { backgroundColor: colors.success }]} />
          <Text style={styles.syncText}>{syncStatus === 'synced' ? 'Live sync connected' : 'Connecting to live sync'}</Text>
        </View>
        {household?.isPersonal ? (
          <>
            <Button label="Join with invite code" onPress={() => setJoinVisible(true)} style={{ marginTop: spacing.lg }} />
            <Button label="Create shared household" variant="ghost" onPress={() => setCreateVisible(true)} style={{ marginTop: spacing.sm }} />
          </>
        ) : household ? (
          <>
            {capabilities.canInvite && household?.inviteCode ? <InviteCodeCard householdName={household.name} inviteCode={household.inviteCode} /> : null}
            <MemberList
              members={members}
              canRemove={capabilities.canRemoveMembers}
              canTransfer={capabilities.canTransferOwnership}
              removingMemberId={removingMemberId}
              transferringMemberId={transferringMemberId}
              onRemove={(member) => confirmRemoveMember(member.id, member.displayName)}
              onTransfer={(member) => confirmTransferOwnership(member.id, member.displayName)}
            />
            {isSharedOwnerWithMembers ? (
              <Text style={styles.householdBody}>Transfer ownership before leaving, or remove members to become the sole owner.</Text>
            ) : null}
            {capabilities.canLeave ? (
              <Button
                label="Leave shared household"
                variant="danger"
                onPress={confirmLeaveHousehold}
                style={{ marginTop: spacing.lg }}
              />
            ) : null}
            {capabilities.canDeleteHousehold ? (
              <Button
                label={deletingHousehold ? 'Deleting household…' : 'Delete shared household'}
                variant="danger"
                disabled={deletingHousehold}
                onPress={confirmDeleteHousehold}
                style={{ marginTop: spacing.lg }}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      <CreateHouseholdSheet visible={createVisible} onClose={() => setCreateVisible(false)} />
      <JoinHouseholdSheet visible={joinVisible} onClose={() => setJoinVisible(false)} />
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    householdHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    householdIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    householdTitle: { fontFamily: fonts.serifItalic, fontSize: 20, color: colors.ink, marginBottom: 2 },
    householdBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, lineHeight: 19 },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
    syncText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.muted },
  });
}
