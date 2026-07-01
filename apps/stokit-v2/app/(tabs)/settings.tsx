import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Platform, StyleSheet, Switch, Text, TextInput, View, useColorScheme } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Button, Card, PageTitle, SectionHeader } from '../../components/shared/ui';
import { ChipSelect } from '../../components/shared/Field';
import { fonts, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useAuthStore } from '../../store/auth-store';
import { useHouseholdStore } from '../../store/household-store';
import { useSessionStore } from '../../store/session-store';
import { CreateHouseholdSheet } from '../../components/household/CreateHouseholdSheet';
import { JoinHouseholdSheet } from '../../components/household/JoinHouseholdSheet';
import { InviteCodeCard } from '../../components/household/InviteCodeCard';
import { MemberList } from '../../components/household/MemberList';
import { useTheme } from '../../hooks/useTheme';
import { useThemeStore } from '../../store/theme';
import { clearLocalAppData } from '../../lib/local-data';
import { OTA_SEQ } from '../../constants/version';
import {
  startGeofencing,
  stopGeofencing,
  isExpoGo,
  isGeofencingRunning,
  getGeofenceDiagnostics,
  clearArrivalCooldown,
  type GeofenceDiagnostics,
} from '../../core/services/geofencing';
import { geofenceableStores } from '../../core/services/geofencingLogic';
import {
  notifyArrival,
  registerPushToken,
  getNotificationLog,
  clearNotificationLog,
  getNotificationDiagnostics,
  getMyPushDiagnostics,
  getHouseholdPushDiagnostics,
  type NotificationLogEntry,
  type NotificationDiagnostics,
  type MyPushDiagnostics,
  type HouseholdPushDiagnostics,
} from '../../core/services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Unit } from '../../types';

const IOS_GEOFENCE_LIMIT = 20;
const DEV_MODE_KEY = 'stokit:v2:developer_mode';
const DEV_MODE_TAP_TARGET = 7;

function formatDiagnosticTime(value: number | null): string {
  return value ? new Date(value).toLocaleString() : 'unavailable';
}

function formatRegistrationStatus(status: string): string {
  if (status === 'running_existing') return 'active';
  if (status === 'not_running') return 'not running';
  return status;
}

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'unit', label: 'unit' },
  { value: 'gal', label: 'gal' },
  { value: 'L', label: 'L' },
  { value: 'lb', label: 'lb' },
  { value: 'pack', label: 'pack' },
];

/** Map a notification log stage to a badge colour. */
function stageColor(stage: NotificationLogEntry['stage'], colors: AppColors): string {
  switch (stage) {
    case 'requested': return colors.muted;
    case 'scheduled': return colors.primary;
    case 'schedule_error': return colors.danger;
    case 'delivered': return colors.success;
    case 'tapped': return colors.warning;
    case 'shopping_opened': return colors.success;
    default: return colors.muted;
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const { isDark: storedTheme, setIsDark } = useThemeStore();
  const systemScheme = useColorScheme();
  const prefs = useDurableStore((s) => s.prefs);
  const updatePrefs = useDurableStore((s) => s.updatePrefs);
  const items = useDurableStore((s) => s.items);
  const stores = useDurableStore((s) => s.stores);
  const trips = useDurableStore((s) => s.trips);
  const session = useSessionStore((s) => s.session);
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const syncStatus = useHouseholdStore((s) => s.syncStatus);
  const refreshHousehold = useHouseholdStore((s) => s.refresh);
  const leaveHousehold = useHouseholdStore((s) => s.leaveHousehold);
  const removeMember = useHouseholdStore((s) => s.removeMember);
  const renameMe = useHouseholdStore((s) => s.renameMe);

  const myDisplayName = members.find((m) => m.isMe)?.displayName ?? 'Me';
  const isSharedOwnerWithMembers = Boolean(household && !household.isPersonal && household.role === 'owner' && members.length > 1);

  const [signingOut, setSigningOut] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);
  const devTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Geofence toggle state ──────────────────────────────────────────────────
  const [geofenceOn, setGeofenceOn] = useState(false);
  const [geofenceLoading, setGeofenceLoading] = useState(false);
  const [geofenceDiagnostics, setGeofenceDiagnostics] = useState<GeofenceDiagnostics | null>(null);
  const [geofencingRunningNow, setGeofencingRunningNow] = useState<boolean | null>(null);
  const gpsStores = stores.filter((s) => s.lat != null && s.lng != null);
  const monitorableStores = geofenceableStores(stores, IOS_GEOFENCE_LIMIT, items);
  const storesMissingLocation = stores.length - gpsStores.length;
  const inExpoGo = isExpoGo();
  const activeShoppingTrip = session.status !== 'idle' && session.status !== 'trip_summary';

  // ── Notification diagnostics state ────────────────────────────────────────
  const [notifDiagnostics, setNotifDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [notifLog, setNotifLog] = useState<NotificationLogEntry[]>([]);
  const [testNotifStatus, setTestNotifStatus] = useState<string | null>(null);
  const [testNotifLoading, setTestNotifLoading] = useState(false);

  // ── Push diagnostics state ────────────────────────────────────────────────
  const [myPushDiag, setMyPushDiag] = useState<MyPushDiagnostics | null>(null);
  const [householdPushDiag, setHouseholdPushDiag] = useState<HouseholdPushDiagnostics | null>(null);
  const [pushRegistering, setPushRegistering] = useState(false);
  const [pushRegisterStatus, setPushRegisterStatus] = useState<string | null>(null);

  const refreshPushDiagnostics = useCallback(async () => {
    const [mine, household] = await Promise.all([
      getMyPushDiagnostics(),
      getHouseholdPushDiagnostics(),
    ]);
    setMyPushDiag(mine);
    setHouseholdPushDiag(household);
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    const [diagnostics, running, nd, log] = await Promise.all([
      getGeofenceDiagnostics(stores, items, activeShoppingTrip),
      isGeofencingRunning(),
      getNotificationDiagnostics(),
      getNotificationLog(),
    ]);
    setGeofenceDiagnostics(diagnostics);
    setGeofenceOn(diagnostics.storeArrivalRemindersOn);
    setGeofencingRunningNow(running);
    setNotifDiagnostics(nd);
    setNotifLog(log);
  }, [stores, items, activeShoppingTrip]);

  const reRegisterPushToken = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
      setPushRegisterStatus('No signed-in user.');
      return;
    }
    setPushRegistering(true);
    setPushRegisterStatus(null);
    try {
      const result = await registerPushToken(currentUser.id);
      setPushRegisterStatus(result.ok ? '✓ Token registered' : `✗ ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
      await refreshPushDiagnostics();
    } finally {
      setPushRegistering(false);
    }
  }, [refreshPushDiagnostics]);

  useEffect(() => {
    void refreshDiagnostics();
    void AsyncStorage.getItem(DEV_MODE_KEY).then((v) => setDevMode(v === 'true'));
  }, [refreshDiagnostics]);

  // Fetch push diagnostics only when devMode is on — avoids an Edge Function
  // round-trip for every user on every Settings open.
  useEffect(() => {
    if (devMode) void refreshPushDiagnostics();
  }, [devMode, refreshPushDiagnostics]);

  const handleDevTap = useCallback(() => {
    setDevTapCount((prev) => {
      const next = prev + 1;
      if (devTapTimerRef.current) clearTimeout(devTapTimerRef.current);
      devTapTimerRef.current = setTimeout(() => setDevTapCount(0), 2000);
      if (next >= DEV_MODE_TAP_TARGET) {
        setDevMode((current) => {
          const toggled = !current;
          void AsyncStorage.setItem(DEV_MODE_KEY, String(toggled));
          return toggled;
        });
        return 0;
      }
      return next;
    });
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
        const result = await startGeofencing(stores, items);
        switch (result) {
          case 'ok': {
            setGeofenceOn(true);
            // Re-attempt push-token registration now that notification
            // permission is freshly granted — the login-time attempt in
            // _layout.tsx almost always runs before this permission exists.
            const currentUser = useAuthStore.getState().user;
            if (currentUser) void registerPushToken(currentUser.id);
            break;
          }
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
      void refreshDiagnostics();
    }
  }, [stores, items, gpsStores.length, refreshDiagnostics]);

  // ── Arrival notification handler ──────────────────────────────────────────
  const sendArrivalNotification = useCallback(async (source: 'test' | 'manual') => {
    setTestNotifLoading(true);
    setTestNotifStatus(null);
    try {
      const targetStore = monitorableStores[0];
      const storeName = targetStore?.name ?? 'Test Store';
      const itemNames = targetStore
        ? items
            .filter((i) => i.storeId === targetStore.id && i.status !== 'purchased')
            .map((i) => i.name)
        : ['Test item'];
      const itemCount = Math.max(1, itemNames.length);
      const result = await notifyArrival(storeName, itemCount, source, {
        storeId: targetStore?.id,
        itemNames,
      });
      if (result.ok) {
        setTestNotifStatus(`✓ Scheduled — ${result.result}`);
      } else {
        setTestNotifStatus(`✗ Failed — ${result.result}`);
      }
    } catch (err) {
      setTestNotifStatus(`✗ Error — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestNotifLoading(false);
      void refreshDiagnostics();
    }
  }, [monitorableStores, items, refreshDiagnostics]);

  const confirmReset = () => {
    if (isSharedOwnerWithMembers) {
      Alert.alert('Remove members first', 'Remove members before leaving or deleting this household.');
      return;
    }
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
            <MemberList
              members={members}
              canRemove={household.role === 'owner'}
              removingMemberId={removingMemberId}
              onRemove={(member) => confirmRemoveMember(member.id, member.displayName)}
            />
            {isSharedOwnerWithMembers ? (
              <Text style={styles.noHouseholdBody}>Remove members before leaving or deleting this household.</Text>
            ) : null}
            <Button
              label="Leave shared household"
              variant="danger"
              onPress={() => {
                if (isSharedOwnerWithMembers) {
                  Alert.alert('Remove members first', 'Remove members before leaving or deleting this household.');
                  return;
                }
                Alert.alert(
                  'Leave shared household?',
                  'You will keep a private copy of the current pantry. Owners must remove other members before leaving.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => void leaveHousehold().then((result) => {
                      if (!result.ok) Alert.alert('Could not leave', result.message);
                    }) },
                  ],
                );
              }}
              style={{ marginTop: spacing.lg }}
            />
          </>
        ) : null}
      </Card>

      {/* ── APPEARANCE ────────────────────────────────────────────────────── */}
      <SectionHeader title="Appearance" />
      <Card>
        <AppearancePicker stored={storedTheme} setIsDark={setIsDark} styles={styles} colors={colors} />
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
              : `Ready for ${monitorableStores.length} assigned store${monitorableStores.length === 1 ? '' : 's'}`
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

        {/* ── ARRIVAL ALERT MANUAL FALLBACK ─────────────────────────── */}
        <View style={styles.testNotifSection}>
          <Text style={styles.testNotifHeading}>Arrival alert</Text>
          <Text style={styles.testNotifNote}>
            Use this if geofencing didn{"'"}t fire when you arrived at a store.
          </Text>
          <Pressable
            style={[styles.testNotifButton, testNotifLoading && { opacity: 0.6 }]}
            onPress={() => void sendArrivalNotification('manual')}
            disabled={testNotifLoading}
            accessibilityRole="button"
            accessibilityLabel="Send arrival notification"
          >
            <Ionicons name="notifications-outline" size={16} color="#fff" />
            <Text style={styles.testNotifButtonText}>
              {testNotifLoading ? 'Sending…' : 'Send Alert'}
            </Text>
          </Pressable>
          {testNotifStatus ? (
            <Text
              style={[
                styles.testNotifResult,
                testNotifStatus.startsWith('✓') ? { color: colors.success } : { color: colors.danger },
              ]}
            >
              {testNotifStatus}
            </Text>
          ) : null}
        </View>

        {/* ── DIAGNOSTICS (Developer Mode only) ────────────────────────── */}
        {devMode && <View style={styles.geofenceDiagnostics}>
          <Text style={styles.geofenceDiagnosticsTitle}>Arrival alert diagnostics</Text>

          {/* System */}
          <Text style={styles.geofenceDiagnosticsHeading}>System</Text>
          <DiagRow label="iOS version" value={String(Platform.Version)} colors={colors} styles={styles} />
          <DiagRow label="Build type" value={inExpoGo ? 'Expo Go' : 'Standalone'} colors={colors} styles={styles} />
          <DiagRow label="OTA build" value={`OTA ${OTA_SEQ}`} colors={colors} styles={styles} />

          {/* Theme */}
          <Text style={styles.geofenceDiagnosticsHeading}>Theme</Text>
          <DiagRow label="Stored preference" value={storedTheme === null ? 'null (system)' : storedTheme ? 'true (dark)' : 'false (light)'} colors={colors} styles={styles} />
          <DiagRow label="useColorScheme()" value={systemScheme ?? 'null'} colors={colors} styles={styles} />
          <DiagRow label="Effective isDark" value={String(isDark)} highlight={!isDark} danger={isDark} colors={colors} styles={styles} />

          {/* Permissions */}
          <Text style={styles.geofenceDiagnosticsHeading}>Permissions</Text>
          <DiagRow
            label="Location (FG / BG)"
            value={`${geofenceDiagnostics?.foregroundPermission ?? '…'} / ${geofenceDiagnostics?.backgroundPermission ?? '…'}`}
            colors={colors}
            styles={styles}
          />
          <DiagRow label="Notifications" value={geofenceDiagnostics?.notificationPermission ?? '…'} colors={colors} styles={styles} />

          {/* Push notifications (household alert delivery) */}
          <Text style={styles.geofenceDiagnosticsHeading}>Push notifications</Text>
          <DiagRow label="My push permission" value={myPushDiag?.permission ?? '…'} danger={myPushDiag?.permission === 'denied'} colors={colors} styles={styles} />
          <DiagRow
            label="My push token"
            value={myPushDiag ? (myPushDiag.tokenPresent ? `present (…${myPushDiag.tokenTail})` : 'MISSING') : '…'}
            highlight={myPushDiag?.tokenPresent === true}
            danger={myPushDiag?.tokenPresent === false}
            colors={colors}
            styles={styles}
          />
          {myPushDiag?.error ? <DiagRow label="Token error" value={myPushDiag.error} danger colors={colors} styles={styles} /> : null}
          <DiagRow
            label="Partner push token"
            value={householdPushDiag ? (householdPushDiag.recipientsWithToken > 0 ? `present (${householdPushDiag.recipientsWithToken})` : 'MISSING') : '…'}
            highlight={(householdPushDiag?.recipientsWithToken ?? 0) > 0}
            danger={householdPushDiag?.recipientsWithToken === 0}
            colors={colors}
            styles={styles}
          />
          <DiagRow label="Household members" value={householdPushDiag ? String(householdPushDiag.memberCount) : '…'} colors={colors} styles={styles} />
          {householdPushDiag && !householdPushDiag.ok && householdPushDiag.error ? (
            <DiagRow label="Household check error" value={householdPushDiag.error} danger colors={colors} styles={styles} />
          ) : null}
          <Pressable
            style={[styles.testNotifButton, pushRegistering && { opacity: 0.6 }]}
            onPress={() => void reRegisterPushToken()}
            disabled={pushRegistering}
            accessibilityRole="button"
            accessibilityLabel="Re-register my push token"
          >
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.testNotifButtonText}>
              {pushRegistering ? 'Registering…' : 'Re-register my push token'}
            </Text>
          </Pressable>
          {pushRegisterStatus ? (
            <Text
              style={[
                styles.testNotifResult,
                pushRegisterStatus.startsWith('✓') ? { color: colors.success } : { color: colors.danger },
              ]}
            >
              {pushRegisterStatus}
            </Text>
          ) : null}

          {/* Geofencing */}
          <Text style={styles.geofenceDiagnosticsHeading}>Geofencing</Text>
          <DiagRow
            label="Running now (live)"
            value={geofencingRunningNow === null ? '…' : geofencingRunningNow ? 'YES' : 'NO'}
            highlight={geofencingRunningNow === true}
            colors={colors}
            styles={styles}
          />
          <DiagRow label="Store Arrival Reminders" value={geofenceDiagnostics?.storeArrivalRemindersOn ? 'On' : 'Off'} colors={colors} styles={styles} />
          <DiagRow label="Active shopping trip" value={geofenceDiagnostics?.activeShoppingTrip ? 'Yes' : 'No'} colors={colors} styles={styles} />
          {geofenceDiagnostics?.storeArrivalRemindersOn && !geofenceDiagnostics?.activeShoppingTrip && (
            <Text style={styles.geofenceDiagnosticsEmpty}>
              Shopping trip inactive — arrival reminders still active.
            </Text>
          )}
          <DiagRow label="Monitored stores" value={String(geofenceDiagnostics?.monitoredStoresCount ?? 0)} colors={colors} styles={styles} />
          <DiagRow label="Stores considered / eligible" value={`${geofenceDiagnostics?.storesConsideredCount ?? 0} / ${geofenceDiagnostics?.eligibleStoresCount ?? 0}`} colors={colors} styles={styles} />
          {geofenceDiagnostics?.registrationOutOfDate && (
            <Text style={styles.locationWarning}>Geofence registration may be out of date.</Text>
          )}

          {/* Registration — values written during last startGeofencing() call */}
          <Text style={styles.geofenceDiagnosticsHeading}>Registration (last attempt)</Text>
          <DiagRow
            label="startGeofencingAsync called"
            value={geofenceDiagnostics?.startGeofencingCalled ? 'yes' : 'no'}
            colors={colors}
            styles={styles}
          />
          <DiagRow label="Regions passed" value={String(geofenceDiagnostics?.regionsPassedCount ?? 0)} colors={colors} styles={styles} />
          <DiagRow label="Result" value={geofenceDiagnostics?.registrationResult ?? 'not_attempted'} colors={colors} styles={styles} />
          <DiagRow label="Last attempt at" value={formatDiagnosticTime(geofenceDiagnostics?.lastRegistrationAttemptAt ?? null)} colors={colors} styles={styles} />
          {geofenceDiagnostics?.registrationError ? (
            <DiagRow label="Error" value={geofenceDiagnostics.registrationError} danger colors={colors} styles={styles} />
          ) : null}

          {/* Arrival precision — populated after each geofence Enter event */}
          <Text style={styles.geofenceDiagnosticsHeading}>Last arrival event</Text>
          <DiagRow
            label="Entered region ID"
            value={geofenceDiagnostics?.lastEnteredRegionId ?? '—'}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Matched store"
            value={geofenceDiagnostics?.lastMatchedStoreName ?? '—'}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Distance to match"
            value={geofenceDiagnostics?.lastMatchedDistanceM != null
              ? `${geofenceDiagnostics.lastMatchedDistanceM.toFixed(0)} m`
              : '—'}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Ambiguity decision"
            value={geofenceDiagnostics?.lastAmbiguityDecision ?? '—'}
            highlight={geofenceDiagnostics?.lastAmbiguityDecision === 'clear'}
            danger={geofenceDiagnostics?.lastAmbiguityDecision === 'ambiguous'}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Notification store"
            value={geofenceDiagnostics?.lastNotificationStoreName ?? '—'}
            highlight={geofenceDiagnostics?.lastNotificationStoreName != null}
            colors={colors}
            styles={styles}
          />

          {/* Arrival confidence */}
          <Text style={styles.geofenceDiagnosticsHeading}>Arrival confidence</Text>
          <DiagRow
            label="GPS accuracy"
            value={geofenceDiagnostics?.lastDwellAccuracy != null
              ? `${geofenceDiagnostics.lastDwellAccuracy.toFixed(0)} m`
              : '—'}
            highlight={geofenceDiagnostics?.lastDwellAccuracy != null && geofenceDiagnostics.lastDwellAccuracy <= 60}
            danger={geofenceDiagnostics?.lastDwellAccuracy != null && geofenceDiagnostics.lastDwellAccuracy > 60}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Movement speed"
            value={geofenceDiagnostics?.lastDwellSpeed != null
              ? geofenceDiagnostics.lastDwellSpeed < 0
                ? 'unavailable'
                : `${geofenceDiagnostics.lastDwellSpeed.toFixed(1)} m/s (${(geofenceDiagnostics.lastDwellSpeed * 3.6).toFixed(0)} km/h)`
              : '—'}
            highlight={geofenceDiagnostics?.lastDwellSpeed != null && geofenceDiagnostics.lastDwellSpeed >= 0 && geofenceDiagnostics.lastDwellSpeed <= 5}
            danger={geofenceDiagnostics?.lastDwellSpeed != null && geofenceDiagnostics.lastDwellSpeed > 5}
            colors={colors}
            styles={styles}
          />
          <DiagRow
            label="Confidence result"
            value={geofenceDiagnostics?.lastConfidenceResult ?? '—'}
            highlight={geofenceDiagnostics?.lastConfidenceResult === 'passed'}
            danger={geofenceDiagnostics?.lastConfidenceResult?.startsWith('rejected') ?? false}
            colors={colors}
            styles={styles}
          />

          {(geofenceDiagnostics?.lastNearbyCandidates?.length ?? 0) > 0 ? (
            <Text style={styles.geofenceDiagnosticsStore}>
              Nearby candidates:{'\n'}
              {geofenceDiagnostics!.lastNearbyCandidates.map(
                (c) => `  ${c.storeName}: ${c.distanceMetres.toFixed(0)} m`,
              ).join('\n')}
            </Text>
          ) : (
            <Text style={styles.geofenceDiagnosticsEmpty}>No arrival events recorded yet.</Text>
          )}

          {/* Notification handler */}
          <Text style={styles.geofenceDiagnosticsHeading}>Notification handler</Text>
          <DiagRow label="shouldShowBanner" value={notifDiagnostics?.handlerShouldShowBanner ? 'true' : 'false'} highlight={notifDiagnostics?.handlerShouldShowBanner} colors={colors} styles={styles} />
          <DiagRow label="shouldPlaySound" value={notifDiagnostics?.handlerShouldPlaySound ? 'true' : 'false'} highlight={notifDiagnostics?.handlerShouldPlaySound} colors={colors} styles={styles} />
          <DiagRow label="shouldShowList" value={notifDiagnostics?.handlerShouldShowList ? 'true' : 'false'} colors={colors} styles={styles} />
          <DiagRow label="interruptionLevel" value="active" highlight colors={colors} styles={styles} />

          {/* Notification counts */}
          <Text style={styles.geofenceDiagnosticsHeading}>Notification counts</Text>
          <DiagRow label="Pending" value={notifDiagnostics !== null ? String(notifDiagnostics.pendingCount) : '…'} colors={colors} styles={styles} />
          <DiagRow label="Delivered (iOS)" value={notifDiagnostics !== null ? String(notifDiagnostics.deliveredCount) : '…'} colors={colors} styles={styles} />

          {/* Last notification response */}
          {notifDiagnostics?.lastResponseTitle ? (
            <>
              <Text style={styles.geofenceDiagnosticsHeading}>Last tapped notification</Text>
              <DiagRow label="Title" value={notifDiagnostics.lastResponseTitle} colors={colors} styles={styles} />
              <DiagRow label="Body" value={notifDiagnostics.lastResponseBody ?? '—'} colors={colors} styles={styles} />
              <DiagRow label="At" value={formatDiagnosticTime(notifDiagnostics.lastResponseTs)} colors={colors} styles={styles} />
            </>
          ) : null}

          <Text style={styles.geofenceDiagnosticsNote}>
            iOS can monitor up to {IOS_GEOFENCE_LIMIT} regions. Stores need coordinates and at least one assigned active item (not yet purchased).
          </Text>

          {/* Monitored stores detail */}
          <Text style={styles.geofenceDiagnosticsHeading}>Monitored stores</Text>
          {(geofenceDiagnostics?.stores.length ?? 0) === 0 ? (
            <Text style={styles.geofenceDiagnosticsEmpty}>No assigned GPS-ready stores.</Text>
          ) : geofenceDiagnostics?.stores.map((store) => {
            const now = Date.now();
            const inCooldown = store.cooldownEndsAt != null && store.cooldownEndsAt > now;
            return (
              <Text key={store.id} style={styles.geofenceDiagnosticsStore}>
                {store.name} · eligible {store.eligible ? 'yes' : 'no'}{inCooldown ? ' ⏱ COOLDOWN' : ''}{`\n`}
                {store.itemCount} item{store.itemCount === 1 ? '' : 's'} · {store.latitude?.toFixed(5) ?? 'invalid'}, {store.longitude?.toFixed(5) ?? 'invalid'} · {store.radius}m{`\n`}
                {formatRegistrationStatus(store.registrationStatus)} · registered {formatDiagnosticTime(store.lastRegisteredAt)}{`\n`}
                enter {store.lastEnterAt ? new Date(store.lastEnterAt).toLocaleString() : 'never'} · exit {store.lastExitAt ? new Date(store.lastExitAt).toLocaleString() : 'never'}{`\n`}
                notification {store.lastNotificationResult ?? 'none'}{store.lastNotificationAt ? ` @ ${new Date(store.lastNotificationAt).toLocaleString()}` : ''}{store.lastNotificationAppState ? ` [${store.lastNotificationAppState}]` : ''}{`\n`}
                {inCooldown ? `cooldown ends ${new Date(store.cooldownEndsAt!).toLocaleTimeString()}` : 'no cooldown'}
              </Text>
            );
          })}

          {(geofenceDiagnostics?.skippedStores.length ?? 0) > 0 && (
            <>
              <Text style={[styles.geofenceDiagnosticsHeading, { color: colors.danger }]}>Not monitored</Text>
              {geofenceDiagnostics?.skippedStores.map((store) => (
                <Text key={`diagnostic-${store.id}`} style={styles.geofenceDiagnosticsStore}>
                  {store.name} — {store.skippedReason}
                </Text>
              ))}
            </>
          )}
          {geofenceDiagnostics?.lastError ? (
            <Text style={[styles.geofenceDiagnosticsStore, { color: colors.danger }]}>
              Last error: {geofenceDiagnostics.lastError}
            </Text>
          ) : null}

          {/* ── TEST NOTIFICATION ───────────────────────────────────── */}
          <Text style={styles.geofenceDiagnosticsHeading}>Notification test</Text>
          <Pressable
            style={[styles.testNotifButton, testNotifLoading && { opacity: 0.6 }]}
            onPress={() => void sendArrivalNotification('test')}
            disabled={testNotifLoading}
            accessibilityRole="button"
            accessibilityLabel="Send test arrival notification"
          >
            <Ionicons name="notifications-outline" size={16} color="#fff" />
            <Text style={styles.testNotifButtonText}>
              {testNotifLoading ? 'Sending…' : 'Send Test Arrival Notification'}
            </Text>
          </Pressable>
          {testNotifStatus ? (
            <Text
              style={[
                styles.testNotifResult,
                testNotifStatus.startsWith('✓') ? { color: colors.success } : { color: colors.danger },
              ]}
            >
              {testNotifStatus}
            </Text>
          ) : null}

          {/* ── RESET COOLDOWN ──────────────────────────────────────── */}
          <Pressable
            style={styles.cooldownResetButton}
            onPress={() => void clearArrivalCooldown().then(() => void refreshDiagnostics())}
            accessibilityRole="button"
            accessibilityLabel="Reset arrival cooldown"
          >
            <Ionicons name="refresh-outline" size={13} color={colors.primary} />
            <Text style={styles.cooldownResetText}>Reset arrival cooldown (3 min)</Text>
          </Pressable>
        </View>}

        {/* ── NOTIFICATION PIPELINE LOG (Developer Mode only) ───────────── */}
        {devMode && <View style={styles.notifLogSection}>
          <View style={styles.notifLogHeader}>
            <Text style={styles.geofenceDiagnosticsTitle}>Notification pipeline log</Text>
            <Pressable
              onPress={() => void clearNotificationLog().then(() => setNotifLog([]))}
              accessibilityRole="button"
              accessibilityLabel="Clear notification log"
            >
              <Text style={styles.notifLogClear}>Clear</Text>
            </Pressable>
          </View>
          {notifLog.length === 0 ? (
            <Text style={styles.geofenceDiagnosticsEmpty}>
              No log entries yet. Send a test notification or trigger a geofence arrival.
            </Text>
          ) : (
            [...notifLog].reverse().map((entry, i) => (
              <View key={i} style={styles.notifLogEntry}>
                <View style={[styles.notifLogBadge, { backgroundColor: stageColor(entry.stage, colors) }]}>
                  <Text style={styles.notifLogBadgeText}>{entry.stage}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLogTs}>{new Date(entry.ts).toLocaleTimeString()}</Text>
                  <Text style={styles.notifLogDetail} numberOfLines={3}>{entry.detail}</Text>
                </View>
              </View>
            ))
          )}
        </View>}

        <Text style={styles.privacyNote}>
          Your location is compared only against your saved stores' coordinates —
          Stokit doesn't track or save a history of where you've been. When you
          arrive somewhere on your list, you'll get a reminder on this device.
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
        <Pressable style={styles.statRow} onPress={handleDevTap} accessibilityRole="button" accessibilityLabel="Version info">
          <Text style={styles.statLabel}>Version</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.statValue}>{Constants.expoConfig?.version ?? '0.1.0'} (OTA {OTA_SEQ})</Text>
            {devMode && (
              <View style={styles.devModeBadge}>
                <Text style={styles.devModeBadgeText}>DEV</Text>
              </View>
            )}
          </View>
        </Pressable>
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

type AppearanceOption = 'system' | 'light' | 'dark';

function AppearancePicker({
  stored,
  setIsDark,
  styles,
  colors,
}: {
  stored: boolean | null;
  setIsDark: (v: boolean | null) => void;
  styles: any;
  colors: AppColors;
}) {
  const current: AppearanceOption = stored === null ? 'system' : stored ? 'dark' : 'light';
  const options: { value: AppearanceOption; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const descriptions: Record<AppearanceOption, string> = {
    system: 'Follows iOS system appearance',
    light: 'Always use light mode',
    dark: 'Always use dark mode',
  };
  const handle = (v: AppearanceOption) => {
    if (v === 'system') setIsDark(null);
    else if (v === 'light') setIsDark(false);
    else setIsDark(true);
  };
  return (
    <View style={styles.appearanceRow}>
      <Ionicons name="contrast-outline" size={20} color={colors.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.appearanceLabel}>Appearance</Text>
        <View style={styles.appearanceChips}>
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.appearanceChip, current === opt.value && styles.appearanceChipActive]}
              onPress={() => handle(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: current === opt.value }}
              accessibilityLabel={opt.label + (opt.value === 'system' ? ' (Recommended)' : '')}
            >
              <Text style={[styles.appearanceChipText, current === opt.value && styles.appearanceChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.appearanceDesc}>{descriptions[current]}</Text>
      </View>
    </View>
  );
}

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

/** A single label/value diagnostic row with optional highlight and danger states. */
function DiagRow({
  label,
  value,
  highlight,
  danger,
  colors,
  styles,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
  colors: AppColors;
  styles: any;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          highlight && { color: colors.success },
          danger && { color: colors.danger },
        ]}
      >
        {value}
      </Text>
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
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    statLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.inkSoft, flex: 1, flexShrink: 1 },
    statValue: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    devModeBadge: {
      backgroundColor: colors.primary,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    devModeBadgeText: { fontFamily: fonts.sansSemibold, fontSize: 10, color: '#fff', letterSpacing: 0.5 },
    appearanceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    appearanceLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink, marginBottom: spacing.sm },
    appearanceChips: { flexDirection: 'row', gap: spacing.sm },
    appearanceChip: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: spacing.sm,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    appearanceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    appearanceChipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },
    appearanceChipTextActive: { color: '#fff' },
    appearanceDesc: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.xs },
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
    // ── Test notification section ──────────────────────────────────────────
    testNotifSection: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    testNotifHeading: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    testNotifNote: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    testNotifButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
    },
    testNotifButtonText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: '#fff',
    },
    testNotifResult: {
      fontFamily: fonts.monoMedium,
      fontSize: 12,
      marginTop: spacing.sm,
      lineHeight: 18,
    },
    // ── Diagnostics ───────────────────────────────────────────────────────
    geofenceDiagnostics: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    geofenceDiagnosticsTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      color: colors.ink,
      marginBottom: spacing.xs,
    },
    geofenceDiagnosticsHeading: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.ink,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    geofenceDiagnosticsNote: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    geofenceDiagnosticsStore: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.inkSoft,
      lineHeight: 18,
    },
    geofenceDiagnosticsEmpty: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
    },
    // ── Notification pipeline log ─────────────────────────────────────────
    notifLogSection: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    notifLogHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    notifLogClear: {
      fontFamily: fonts.sansSemibold,
      fontSize: 13,
      color: colors.primary,
    },
    notifLogEntry: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    notifLogBadge: {
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    notifLogBadgeText: {
      fontFamily: fonts.monoMedium,
      fontSize: 10,
      color: '#fff',
    },
    notifLogTs: {
      fontFamily: fonts.mono,
      fontSize: 11,
      color: colors.muted,
      marginBottom: 1,
    },
    notifLogDetail: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.inkSoft,
      lineHeight: 17,
    },
    // ── Cooldown reset ────────────────────────────────────────────────────
    cooldownResetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: spacing.sm,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    cooldownResetText: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.primary,
    },
    // ── Privacy footer ─────────────────────────────────────────────────────
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
