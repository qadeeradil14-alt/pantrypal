import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Button, Card } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useAuthStore } from '../../store/auth-store';
import { useHouseholdStore } from '../../store/household-store';
import { useTheme } from '../../hooks/useTheme';
import { stopGeofencing } from '../../core/services/geofencing';

const OWNER_BLOCKED_MESSAGE =
  'You can’t delete your account because you own a shared household.\n\nTransfer ownership or remove all household members before deleting your account.';

export default function AccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const syncStatus = useHouseholdStore((s) => s.syncStatus);
  const renameMe = useHouseholdStore((s) => s.renameMe);
  const authUser = useAuthStore((s) => s.user);

  const myDisplayName = members.find((m) => m.isMe)?.displayName ?? 'Me';
  const isSharedOwnerWithMembers = Boolean(household && !household.isPersonal && household.role === 'owner' && members.length > 1);

  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [draftName, setDraftName] = useState('');

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const confirmLogout = () => {
    Alert.alert('Log out?', 'Your local pantry, stores, shopping session, and history will be removed from this device. Synced cloud data stays in your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            await stopGeofencing().catch(() => {});
            const result = await useAuthStore.getState().signOut();
            router.replace('/(auth)/welcome');
            setSigningOut(false);
            if (!result.ok) Alert.alert('Logged out on this device', result.message);
          })();
        },
      },
    ]);
  };

  const showOwnerBlockedAlert = () => {
    Alert.alert('Can’t delete account', OWNER_BLOCKED_MESSAGE, [
      { text: 'Go to Household', onPress: () => router.push('/household') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const performDeleteAccount = async () => {
    setDeletingAccount(true);
    await stopGeofencing().catch(() => {});
    const result = await useAuthStore.getState().deleteAccount();
    setDeletingAccount(false);
    if (result.ok) {
      router.replace('/(auth)/welcome');
      Alert.alert('Account deleted', 'Your account and all synced data have been permanently removed.');
      return;
    }
    if (result.code === 'OWNER_HAS_MEMBERS') {
      showOwnerBlockedAlert();
      return;
    }
    Alert.alert('Couldn’t delete account', result.message);
  };

  const confirmDeleteAccount = () => {
    // Local pre-check for instant feedback; the Edge Function re-checks
    // server-side, so a stale member list can't slip a deletion through.
    if (isSharedOwnerWithMembers) {
      showOwnerBlockedAlert();
      return;
    }
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all synced data — pantry items, stores, shopping history, receipts, and household info. Receipt images stored on this device are removed too.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Permanently delete account?',
              'This can’t be undone. Your account will be deleted and you’ll be signed out.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: () => { void performDeleteAccount(); },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const startRename = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Your name',
        'This is how others in your household see you.',
        (value) => {
          const trimmed = (value ?? '').trim();
          if (trimmed) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void renameMe(trimmed);
          }
        },
        'plain-text',
        myDisplayName,
      );
    } else {
      setDraftName(myDisplayName === 'Me' ? '' : myDisplayName);
      setRenameVisible(true);
    }
  };

  const saveRename = () => {
    const t = draftName.trim();
    if (t) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void renameMe(t);
    }
    setRenameVisible(false);
  };

  return (
    <Screen>
      <SubScreenHeader eyebrow="You" title="Account" />

      <Card style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileInitial}>{myDisplayName.trim().charAt(0).toUpperCase() || 'M'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileEyebrow}>SIGNED IN</Text>
          <Text style={styles.profileName}>{myDisplayName}</Text>
          <Text style={styles.profileEmail} numberOfLines={1}>{authUser?.email ?? 'Your Stokit account'}</Text>
        </View>
        <View style={[styles.statusPill, syncStatus === 'synced' && styles.statusPillSynced]}>
          <View style={[styles.statusPillDot, syncStatus === 'synced' && { backgroundColor: colors.success }]} />
          <Text style={[styles.statusPillText, syncStatus === 'synced' && { color: colors.success }]}>
            {syncStatus === 'synced' ? 'Synced' : 'Syncing'}
          </Text>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        {renameVisible && (
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Your name</Text>
            <Text style={styles.renameSub}>Shown to household members</Text>
            <TextInput
              style={styles.renameInput}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRename}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenameVisible(false)} style={styles.renameCancelBtn}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveRename} style={styles.renameSaveBtn}>
                <Text style={styles.renameSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
          onPress={startRename}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <Ionicons name="id-card-outline" size={19} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.rowLabel}>Your name</Text>
              <Text style={styles.rowSub}>Shown to household members</Text>
            </View>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{myDisplayName}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.muted} />
          </View>
        </Pressable>
      </Card>

      <Card style={[styles.sectionCard, styles.accountCard, { marginTop: spacing.lg }]}>
        <View style={styles.accountIntro}>
          <View style={styles.accountIntroIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountIntroTitle}>Account controls</Text>
            <Text style={styles.accountIntroText}>Manage this device and your Stokit account.</Text>
          </View>
        </View>
        <Button
          label={signingOut ? 'Logging out…' : 'Log out'}
          variant="ghost"
          disabled={signingOut}
          onPress={confirmLogout}
        />
        {authUser && (
          <Button
            label={deletingAccount ? 'Deleting account…' : 'Delete account'}
            variant="danger"
            disabled={deletingAccount}
            onPress={confirmDeleteAccount}
            style={{ marginTop: spacing.md }}
          />
        )}
      </Card>
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    profileHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      borderColor: colors.primary + '24',
      backgroundColor: colors.backgroundElevated,
      marginBottom: spacing.lg,
    },
    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileInitial: { fontFamily: fonts.serifItalic, fontSize: 25, color: colors.primary },
    profileEyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, color: colors.primary },
    profileName: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.ink, marginTop: 1 },
    profileEmail: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 1 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised },
    statusPillSynced: { backgroundColor: colors.successSoft },
    statusPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
    statusPillText: { fontFamily: fonts.sansSemibold, fontSize: 10, color: colors.muted },
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    settingsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radii.md,
    },
    settingsRowPressed: { opacity: 0.68, backgroundColor: colors.surface },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    rowSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    rowValue: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    renameModal: { backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.md },
    renameTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink, marginBottom: 4 },
    renameSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.md },
    renameInput: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md },
    renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
    renameCancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 8 },
    renameCancelText: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted },
    renameSaveBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 8 },
    renameSaveText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: '#fff' },
    accountCard: { borderColor: colors.danger + '24' },
    accountIntro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    accountIntroIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    accountIntroTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    accountIntroText: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
  });
}
