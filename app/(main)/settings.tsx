import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  Alert, Share, ActivityIndicator, ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useItemsStore } from '../../store/items';
import { useSettingsStore } from '../../store/settings';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { updateHouseholdName, leaveHousehold } from '../../lib/households';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/haptics';
import { useTheme } from '../../hooks/useTheme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

const appVersion = Constants.expoConfig?.version ?? '—';

function userInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { session, setSession } = useAuthStore();
  const { household, setHousehold, clearHousehold } = useHouseholdStore();
  const { setItems } = useItemsStore();
  const { weeklyBudget, setWeeklyBudget } = useSettingsStore();
  const [signingOut, setSigningOut] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingHouseholdName, setSavingHouseholdName] = useState(false);
  const [leavingHousehold, setLeavingHousehold] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const displayName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || null;
  const initials = userInitials(displayName, session?.user?.email);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          void hapticWarning();
          setSigningOut(true);
          try {
            await signOut();
            clearHousehold();
            setItems([]);
            void hapticSuccess();
          } catch (e: any) {
            Alert.alert('Sign out failed', e?.message ?? 'Please try again.');
            void hapticError();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  const inviteDeepLink = household?.inviteCode
    ? `pantrypal://join?code=${household.inviteCode}`
    : null;

  async function handleCopyCode() {
    if (!household?.inviteCode || !inviteDeepLink) return;
    void hapticSuccess();
    try {
      await Clipboard.setStringAsync(inviteDeepLink);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      Alert.alert('Invite link', inviteDeepLink);
    }
  }

  async function handleShare() {
    if (!household?.inviteCode || !inviteDeepLink) return;
    try {
      void hapticSelection();
      await Share.share({
        message: `Join my household on Stokit! 🏠\n\nWe use it to manage our pantry, grocery list, and spending together.\n\n📲 Download Stokit on TestFlight, then tap this link to join:\n${inviteDeepLink}\n\nOr open the app and enter code: ${household.inviteCode}`,
        url: inviteDeepLink,
      });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Please try again.');
      void hapticError();
    }
  }

  function handleEditBudget() {
    Alert.prompt(
      'Weekly budget',
      'Set your weekly grocery spend target (e.g. 200).',
      (value) => {
        const parsed = parseFloat(value ?? '');
        if (isNaN(parsed) || parsed <= 0) {
          Alert.alert('Invalid amount', 'Please enter a number greater than 0.');
          return;
        }
        setWeeklyBudget(Math.round(parsed));
        void hapticSuccess();
      },
      'plain-text',
      String(weeklyBudget),
      'numeric',
    );
  }

  function handleEditDisplayName() {
    const current = displayName ?? '';
    Alert.prompt(
      'Display name',
      'Shown in your pantry greeting.',
      async (name) => {
        if (!name?.trim()) return;
        setSavingName(true);
        try {
          const { data, error } = await supabase.auth.updateUser({
            data: { full_name: name.trim() },
          });
          if (error) throw error;
          if (data.user && session) setSession({ ...session, user: data.user });
          void hapticSuccess();
        } catch (e: any) {
          Alert.alert('Could not save', e?.message ?? 'Try again.');
          void hapticError();
        } finally {
          setSavingName(false);
        }
      },
      'plain-text',
      current,
    );
  }

  function handleEditHouseholdName() {
    if (!household) return;
    Alert.prompt(
      'Household name',
      'Rename your household.',
      async (name) => {
        if (!name?.trim()) return;
        setSavingHouseholdName(true);
        try {
          await updateHouseholdName(household.id, name.trim());
          setHousehold({ ...household, name: name.trim() });
          void hapticSuccess();
        } catch (e: any) {
          Alert.alert('Could not rename', e?.message ?? 'Try again.');
          void hapticError();
        } finally {
          setSavingHouseholdName(false);
        }
      },
      'plain-text',
      household.name,
    );
  }

  function handleLeaveHousehold() {
    Alert.alert(
      'Leave household?',
      "You'll lose access to this pantry. You can join a new one with an invite code.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            if (!household || !session?.user?.id) return;
            void hapticWarning();
            setLeavingHousehold(true);
            try {
              await leaveHousehold(household.id, session.user.id);
              clearHousehold();
              setItems([]);
              void hapticSuccess();
            } catch (e: any) {
              Alert.alert('Could not leave', e?.message ?? 'Try again.');
              void hapticError();
            } finally {
              setLeavingHousehold(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.headerTitle} testID="settings-header">Settings</Text>
        </View>

        {/* Hero — user identity card */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroInitials}>{initials}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName || session?.user?.email?.split('@')[0] || 'Your account'}
            </Text>
            <Text style={styles.heroEmail} numberOfLines={1}>{session?.user.email ?? ''}</Text>
          </View>
        </View>

        {/* Household */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Household</Text>
          <View style={styles.card}>
            <ScalePressable
              style={styles.row}
              onPress={() => { void hapticSelection(); handleEditHouseholdName(); }}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="home-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Name</Text>
              </View>
              <View style={styles.rowEditWrap}>
                {savingHouseholdName
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={styles.rowValue} numberOfLines={1}>{household?.name ?? '—'}</Text>
                }
                <Ionicons name="pencil-outline" size={14} color={colors.muted} />
              </View>
            </ScalePressable>
            {household?.inviteCode ? (
              <ScalePressable
                style={[styles.row, styles.rowBorderTop]}
                onPress={handleCopyCode}
              >
                <View style={styles.rowLabelWrap}>
                  <Ionicons name="key-outline" size={17} color={colors.muted} />
                  <Text style={styles.rowLabel}>Invite code</Text>
                </View>
                <View style={styles.rowEditWrap}>
                  <Text style={styles.rowCode}>{household.inviteCode}</Text>
                  <Ionicons
                    name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                    size={15}
                    color={codeCopied ? colors.success : colors.muted}
                  />
                </View>
              </ScalePressable>
            ) : null}
          </View>
          {household?.inviteCode ? (
            <ScalePressable
              style={styles.shareBtn}
              onPress={() => { void hapticSelection(); void handleShare(); }}
            >
              <Ionicons name="share-outline" size={17} color={colors.primary} />
              <Text style={styles.shareBtnText}>Share invite link</Text>
            </ScalePressable>
          ) : null}
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <ScalePressable
              style={styles.row}
              onPress={() => { void hapticSelection(); handleEditDisplayName(); }}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="person-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Display name</Text>
              </View>
              <View style={styles.rowEditWrap}>
                {savingName
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={styles.rowValue} numberOfLines={1}>{displayName || '—'}</Text>
                }
                <Ionicons name="pencil-outline" size={14} color={colors.muted} />
              </View>
            </ScalePressable>
            <View style={[styles.row, styles.rowBorderTop]}>
              <View style={styles.rowLabelWrap}>
                <Ionicons name="mail-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Email</Text>
              </View>
              <Text style={styles.rowValue} numberOfLines={1}>{session?.user.email ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* Shopping */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Shopping</Text>
          <View style={styles.card}>
            <ScalePressable
              style={styles.row}
              onPress={() => { void hapticSelection(); handleEditBudget(); }}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="wallet-outline" size={17} color={colors.muted} />
                <View>
                  <Text style={styles.rowLabel}>Weekly budget</Text>
                  <Text style={styles.rowSubLabel}>Tap to adjust your grocery target</Text>
                </View>
              </View>
              <View style={styles.rowEditWrap}>
                <Text style={[styles.rowValue, { color: colors.primary, fontFamily: fonts.bodySemiBold }]}>${weeklyBudget}</Text>
                <Ionicons name="pencil-outline" size={15} color={colors.primary} />
              </View>
            </ScalePressable>
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Danger zone</Text>
          <View style={styles.card}>
            <ScalePressable
              style={styles.row}
              onPress={() => { void hapticSelection(); handleLeaveHousehold(); }}
              disabled={leavingHousehold}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="exit-outline" size={17} color={colors.danger} />
                <Text style={[styles.rowLabel, { color: colors.danger }]}>Leave household</Text>
              </View>
              {leavingHousehold
                ? <ActivityIndicator size="small" color={colors.danger} />
                : <Ionicons name="chevron-forward" size={16} color={colors.danger} />
              }
            </ScalePressable>
          </View>
        </View>

        <ScalePressable
          profile="danger"
          style={styles.signOutBtn}
          onPress={() => { void hapticSelection(); void handleSignOut(); }}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator color={colors.danger} />
            : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.signOutText}>Sign out</Text>
              </>
            )}
        </ScalePressable>

        <Text style={styles.versionText}>PantryPal v{appVersion}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 48 },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
    eyebrow: { fontSize: 12, color: colors.primary, fontFamily: fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
    headerTitle: { fontSize: 28, fontFamily: fonts.displayExtraBoldItalic, color: colors.ink, letterSpacing: 0 },

    // Hero
    heroCard: {
      marginHorizontal: 16, marginBottom: 16, borderRadius: 20,
      backgroundColor: colors.surface, padding: 16,
      flexDirection: 'row', alignItems: 'center', gap: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    heroAvatar: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary + '30',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    heroInitials: { fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.primary },
    heroInfo: { flex: 1, gap: 3 },
    heroName: { fontSize: 18, fontFamily: fonts.bodySemiBold, color: colors.ink },
    heroEmail: { fontSize: 13, color: colors.muted, fontFamily: fonts.body },

    section: { marginTop: 14, paddingHorizontal: 20 },
    sectionLabel: {
      fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.muted,
      textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.surface, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 15, gap: 12,
    },
    rowBorderTop: { borderTopWidth: 1, borderTopColor: colors.border },
    rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { fontSize: 15, color: colors.ink, fontFamily: fonts.bodyMedium },
    rowSubLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    rowEditWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    rowValue: { fontSize: 16, color: colors.ink, fontFamily: fonts.bodyMedium, flexShrink: 1, textAlign: 'right' },
    rowCode: { fontSize: 16, color: colors.ink, fontFamily: fonts.mono, flexShrink: 1, textAlign: 'right', letterSpacing: 0.5 },
    shareBtn: {
      marginTop: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    shareBtnText: { color: colors.primary, fontSize: 15, fontFamily: fonts.bodySemiBold },
    signOutBtn: {
      marginHorizontal: 20, marginTop: 20,
      flexDirection: 'row', gap: 8, justifyContent: 'center',
      backgroundColor: colors.dangerSoft, borderRadius: 16,
      paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '33',
    },
    signOutText: { color: colors.danger, fontSize: 17, fontFamily: fonts.bodySemiBold },
    versionText: {
      textAlign: 'center', marginTop: 20,
      fontSize: 12, color: colors.faint, fontFamily: fonts.mono,
    },
  });
}
