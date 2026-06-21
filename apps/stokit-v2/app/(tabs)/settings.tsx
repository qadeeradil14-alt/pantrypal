import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Button, Card, PageTitle, SectionHeader } from '../../components/shared/ui';
import { TextField, ChipSelect } from '../../components/shared/Field';
import { fonts, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useAuthStore } from '../../store/auth-store';
import { useHouseholdStore } from '../../store/household-store';
import { CreateHouseholdSheet } from '../../components/household/CreateHouseholdSheet';
import { JoinHouseholdSheet } from '../../components/household/JoinHouseholdSheet';
import { InviteCodeCard } from '../../components/household/InviteCodeCard';
import { MemberList } from '../../components/household/MemberList';
import { useTheme } from '../../hooks/useTheme';
import { clearLocalAppData } from '../../lib/local-data';
import {
  startGeofencing,
  stopGeofencing,
  isGeofencingRunning,
  isExpoGo,
} from '../../core/services/geofencing';
import type { Unit } from '../../types';

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'unit', label: 'unit' },
  { value: 'gal', label: 'gal' },
  { value: 'L', label: 'L' },
  { value: 'lb', label: 'lb' },
  { value: 'pack', label: 'pack' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, toggle: toggleDark, colors } = useTheme();
  const prefs = useDurableStore((s) => s.prefs);
  const updatePrefs = useDurableStore((s) => s.updatePrefs);
  const items = useDurableStore((s) => s.items);
  const stores = useDurableStore((s) => s.stores);
  const trips = useDurableStore((s) => s.trips);
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const syncStatus = useHouseholdStore((s) => s.syncStatus);
  const leaveHousehold = useHouseholdStore((s) => s.leaveHousehold);
  const renameMe = useHouseholdStore((s) => s.renameMe);

  const myDisplayName = members.find((m) => m.isMe)?.displayName ?? 'Me';

  const [name, setName] = useState(prefs.householdName);
  const [signingOut, setSigningOut] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [draftName, setDraftName] = useState('');

  // ── Geofence toggle state ──────────────────────────────────────────────────
  const [geofenceOn, setGeofenceOn] = useState(false);
  const [geofenceLoading, setGeofenceLoading] = useState(false);
  const gpsStores = stores.filter((s) => s.lat != null && s.lng != null);
  const storesMissingLocation = stores.length - gpsStores.length;
  const inExpoGo = isExpoGo();

  useEffect(() => {
    isGeofencingRunning().then(setGeofenceOn).catch(() => {});
  }, []);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const toggleGeofence = useCallback(async (value: boolean) => {
    if (value && gpsStores.length === 0) {
      Alert.alert(
        'No store coordinates',
        'Add stores using "Find stores near me" first — that gives each store GPS coordinates needed for arrival detection.',
      );
      return;
    }
    setGeofenceLoading(true);
    try {
      if (value) {
        const result = await startGeofencing(stores);
        switch (result) {
          case 'ok':
            setGeofenceOn(true);
            break;
          case 'no_permission':
            Alert.alert(
              'Location permission needed',
              'Allow "Always" location access in Settings to enable store arrival reminders.',
            );
            setGeofenceOn(false);
            break;
          case 'no_notification_permission':
            Alert.alert(
              'Notification permission needed',
              'Allow notifications in Settings so Stokit can remind you when you arrive at a store.',
            );
            setGeofenceOn(false);
            break;
          case 'no_stores':
            Alert.alert(
              'No store coordinates',
              'At least one saved store needs GPS coordinates before arrival reminders can be enabled. Use "Find stores near me" to add them.',
            );
            setGeofenceOn(false);
            break;
          case 'expo_go':
            Alert.alert(
              'Not available in Expo Go',
              'Store arrival reminders need a native build — TestFlight or a device build — and can\'t run inside Expo Go.',
            );
            setGeofenceOn(false);
            break;
          default:
            Alert.alert(
              'Could not enable arrival reminders',
              'Something unexpected happened while turning this on. Please try again.',
            );
            setGeofenceOn(false);
        }
      } else {
        await stopGeofencing();
        setGeofenceOn(false);
      }
    } finally {
      setGeofenceLoading(false);
    }
  }, [stores, gpsStores.length, inExpoGo]);

  const confirmReset = () => {
    if (household && !household.isPersonal && household.role !== 'owner') {
      Alert.alert('Owner permission needed', 'Only the household owner can wipe a shared pantry.');
      return;
    }
    Alert.alert(
      household && !household.isPersonal ? 'Wipe the shared pantry?' : 'Wipe all local data?',
      household && !household.isPersonal
        ? 'This permanently deletes the pantry, stores, receipts, and shopping history for every household member.\n\nThis cannot be undone.'
        : 'This permanently deletes your pantry items, stores, receipts, and shopping history from this device and your synced account. Your account stays active but you will start completely fresh.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, wipe everything',
          style: 'destructive',
          onPress: () => {
            void stopGeofencing().catch(() => {});
            void clearLocalAppData();
          },
        },
      ],
    );
  };

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

  return (
    <Screen>
      <PageTitle eyebrow="Your account" title="Settings" />

      {/* ── PROFILE ───────────────────────────────────────────────────────── */}
      <SectionHeader title="Profile" />
      <Card>
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
              onSubmitEditing={() => {
                const t = draftName.trim();
                if (t) void renameMe(t);
                setRenameVisible(false);
              }}
            />
            <View style={styles.renameActions}>
              <Pressable onPress={() => setRenameVisible(false)} style={styles.renameCancelBtn}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const t = draftName.trim();
                  if (t) void renameMe(t);
                  setRenameVisible(false);
                }}
                style={styles.renameSaveBtn}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Pressable
          style={styles.budgetRow}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Alert.prompt(
                'Your name',
                'This is how others in your household see you.',
                (value) => {
                  const trimmed = (value ?? '').trim();
                  if (trimmed) void renameMe(trimmed);
                },
                'plain-text',
                myDisplayName,
              );
            } else {
              setDraftName(myDisplayName === 'Me' ? '' : myDisplayName);
              setRenameVisible(true);
            }
          }}
        >
          <View style={styles.budgetLeft}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
            <View>
              <Text style={styles.budgetLabel}>Your name</Text>
              <Text style={styles.budgetSub}>Shown to household members</Text>
            </View>
          </View>
          <View style={styles.budgetRight}>
            <Text style={styles.budgetAmount}>{myDisplayName}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.muted} />
          </View>
        </Pressable>
      </Card>

      <SectionHeader title="Account sync" />
      <Card>
        <Text style={styles.noHouseholdTitle}>
          {household?.isPersonal ? 'Private pantry' : household?.name ?? 'Account sync'}
        </Text>
        <Text style={styles.noHouseholdBody}>
          {household?.isPersonal
            ? 'Your pantry is securely backed up. Create or join a household to share updates live with family.'
            : household
            ? `${members.length} member${members.length === 1 ? '' : 's'} share this pantry in real time.`
            : 'Sign in to securely back up your pantry and share it with family.'}
        </Text>
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
            {household?.inviteCode ? <InviteCodeCard householdName={household.name} inviteCode={household.inviteCode} /> : null}
            <MemberList members={members} />
            <Button
              label="Leave shared household"
              variant="danger"
              onPress={() => Alert.alert(
                'Leave shared household?',
                'You will keep a private copy of the current pantry. Owners must remove other members before leaving.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Leave', style: 'destructive', onPress: () => void leaveHousehold().then((result) => {
                    if (!result.ok) Alert.alert('Could not leave', result.message);
                  }) },
                ],
              )}
              style={{ marginTop: spacing.lg }}
            />
          </>
        ) : null}
      </Card>

      {/* ── APPEARANCE ────────────────────────────────────────────────────── */}
      <SectionHeader title="Appearance" />
      <Card>
        <ToggleRow
          icon="moon-outline"
          label="Dark mode"
          description="Switch to a dark background"
          value={isDark}
          onValueChange={toggleDark}
          styles={styles}
          colors={colors}
        />
      </Card>

      {/* ── PREFERENCES ───────────────────────────────────────────────────── */}
      <SectionHeader title="Preferences" />
      <Card>
        <ChipSelect
          label="Default unit for new items"
          options={UNIT_OPTIONS}
          value={prefs.defaultUnit}
          onChange={(v) => updatePrefs({ defaultUnit: v })}
        />
        <Pressable
          style={styles.budgetRow}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Alert.prompt(
                'Weekly budget',
                'Set your weekly grocery budget (e.g. 200).',
                (value) => {
                  const parsed = parseFloat(value ?? '');
                  if (!isNaN(parsed) && parsed > 0) updatePrefs({ weeklyBudget: Math.round(parsed) });
                },
                'plain-text',
                String(prefs.weeklyBudget ?? 200),
                'numeric',
              );
            } else {
              Alert.alert(
                'Weekly budget',
                `Current budget: $${prefs.weeklyBudget ?? 200}\n\nTo change, update in your preferences.`,
              );
            }
          }}
        >
          <View style={styles.budgetLeft}>
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            <View>
              <Text style={styles.budgetLabel}>Weekly budget</Text>
              <Text style={styles.budgetSub}>Tap to adjust</Text>
            </View>
          </View>
          <View style={styles.budgetRight}>
            <Text style={styles.budgetAmount}>${prefs.weeklyBudget ?? 200}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.muted} />
          </View>
        </Pressable>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Items tracked</Text>
          <Text style={styles.statValue}>{items.length}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Stores</Text>
          <Text style={styles.statValue}>{stores.length}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Trips completed</Text>
          <Text style={styles.statValue}>{trips.length}</Text>
        </View>
      </Card>

      {/* ── PRIVACY (geofence lives here — subtle, not prominent) ─────────── */}
      <SectionHeader title="Privacy & notifications" />
      <Card>
        <ToggleRow
          icon="location-outline"
          label="Store arrival reminders"
          description={
            inExpoGo
              ? 'Coming soon'
              : gpsStores.length === 0
              ? `Add stores via "Find nearby" to enable`
              : `Active for ${gpsStores.length} store${gpsStores.length === 1 ? '' : 's'}`
          }
          value={geofenceOn}
          onValueChange={toggleGeofence}
          disabled={geofenceLoading || inExpoGo}
          dimmed={inExpoGo || gpsStores.length === 0}
          styles={styles}
          colors={colors}
        />
        {storesMissingLocation > 0 && (
          <Text style={styles.locationWarning}>
            {storesMissingLocation} store{storesMissingLocation === 1 ? '' : 's'} need
            {storesMissingLocation === 1 ? 's' : ''} a location before arrival alerts can work.
          </Text>
        )}
        <Text style={styles.privacyNote}>
          Your location is compared only against your saved stores' coordinates —
          Stokit doesn't track or save a history of where you've been. When you
          arrive somewhere on your list, you'll get a reminder, and if you share a
          household, other members may also be notified that you've arrived.
        </Text>
      </Card>

      {/* ── ACCOUNT ───────────────────────────────────────────────────────── */}
      <SectionHeader title="Account" />
      <Card>
        <Button
          label={signingOut ? 'Logging out…' : 'Log out'}
          variant="ghost"
          disabled={signingOut}
          onPress={confirmLogout}
        />
        <Button
          label="Reset all local data"
          variant="danger"
          onPress={confirmReset}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      {/* ── ABOUT ─────────────────────────────────────────────────────────── */}
      <SectionHeader title="About" />
      <Card>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>App</Text>
          <Text style={styles.statValue}>Stokit V2</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Version</Text>
          <Text style={styles.statValue}>{Constants.expoConfig?.version ?? '0.1.0'}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Build</Text>
          <Text style={styles.statValue}>
            {inExpoGo ? 'Expo Go' : 'Standalone'}
          </Text>
        </View>
      </Card>

      {/* Sheets */}
      <CreateHouseholdSheet visible={createVisible} onClose={() => setCreateVisible(false)} />
      <JoinHouseholdSheet visible={joinVisible} onClose={() => setJoinVisible(false)} />
    </Screen>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  disabled,
  dimmed,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  dimmed?: boolean;
  styles: any;
  colors: AppColors;
}) {
  return (
    <View style={styles.toggleRow}>
      <Ionicons name={icon} size={20} color={dimmed ? colors.muted : colors.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, dimmed && { color: colors.muted }]}>{label}</Text>
        {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.ink}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionLabel: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.md,
    },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    syncDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.muted,
    },
    syncText: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      fontStyle: 'italic',
    },
    noHouseholdTitle: {
      fontFamily: fonts.serifItalic,
      fontSize: 18,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    noHouseholdBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.muted,
      lineHeight: 21,
    },
    budgetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: spacing.sm,
    },
    budgetLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    budgetRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    budgetLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    budgetSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    budgetAmount: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.primary },
    renameModal: { backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.md },
    renameTitle: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink, marginBottom: 4 },
    renameSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginBottom: spacing.md },
    renameInput: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md },
    renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
    renameCancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 8 },
    renameCancelText: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted },
    renameSaveBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 8 },
    renameSaveText: { fontFamily: fonts.sansSemibold, fontSize: 15, color: '#fff' },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    statLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.inkSoft },
    statValue: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    toggleLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    toggleDesc: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    locationWarning: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.warning,
      lineHeight: 18,
      marginTop: spacing.xs,
    },
    privacyNote: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.faintText,
      lineHeight: 18,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
  });
}
