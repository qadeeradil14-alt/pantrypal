import { useCallback, useState, useMemo } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet,
  Alert, Share, ActivityIndicator, ScrollView, Switch, Modal, Pressable,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useItemsStore } from '../../store/items';
import { useSettingsStore } from '../../store/settings';
import { useStoresStore } from '../../store/stores';
import { useShoppingStore } from '../../store/shopping';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { updateHouseholdName, leaveHousehold, fetchHouseholdById, getHouseholdMemberCount } from '../../lib/households';
import { TESTFLIGHT_URL, buildInviteDeepLink, buildInviteMessage, normalizeInviteCode } from '../../lib/invites';
import { GEOFENCE_TASK, stopGeofencing } from '../../lib/geofencing';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/haptics';
import { useTheme } from '../../hooks/useTheme';
import { useThemeStore } from '../../store/theme';
import { fonts } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';
import AppIcon from '../../components/AppIcon';

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
  const { colors, isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const { household, update: updateHousehold, clear: clearHousehold } = useHouseholdStore();
  const { setItems } = useItemsStore();
  const setShoppingEntries = useShoppingStore((s) => s.setEntries);
  const {
    setStores,
    setActiveStore,
    setPendingReceiptStoreId,
    clearReceiptTrip,
    setArrivalStore,
  } = useStoresStore();
  const stores = useStoresStore((s) => s.stores);
  const {
    weeklyBudget, setWeeklyBudget,
    notifArrivalSelf, setNotifArrivalSelf,
    notifArrivalPartner, setNotifArrivalPartner,
    notifExpiry, setNotifExpiry,
    notifLowStock, setNotifLowStock,
  } = useSettingsStore();
  const [signingOut, setSigningOut] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingHouseholdName, setSavingHouseholdName] = useState(false);
  const [leavingHousehold, setLeavingHousehold] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [health, setHealth] = useState({
    location: 'Checking',
    notifications: 'Checking',
    geofence: 'Checking',
    geofenceActive: false,
  });

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
            await stopGeofencing().catch(() => {});
            clearHousehold();
            setItems([]);
            setStores([]);
            setShoppingEntries([]);
            setActiveStore(null);
            setPendingReceiptStoreId(null);
            clearReceiptTrip();
            setArrivalStore(null);
            router.replace('/(auth)/welcome');
            setSession(null);
            await signOut();
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

  const inviteCode = normalizeInviteCode(household?.inviteCode) || null;
  const inviteDeepLink = inviteCode ? buildInviteDeepLink(inviteCode) : null;

  async function refreshInviteCode() {
    if (!household?.id) return null;
    setLoadingInvite(true);
    try {
      const fresh = await fetchHouseholdById(household.id);
      const freshCode = normalizeInviteCode(fresh?.invite_code);
      if (fresh && freshCode) {
        updateHousehold({ name: fresh.name, inviteCode: freshCode });
        return freshCode;
      }
      Alert.alert('Invite unavailable', 'No invite code was found for this household.');
      return null;
    } catch (e: any) {
      Alert.alert('Invite unavailable', e?.message ?? 'Please try again.');
      void hapticError();
      return null;
    } finally {
      setLoadingInvite(false);
    }
  }

  async function handleCopyCode() {
    const code = inviteCode ?? await refreshInviteCode();
    const message = code ? buildInviteMessage(code) : null;
    if (!message) return;
    void hapticSuccess();
    try {
      await Clipboard.setStringAsync(message);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      Alert.alert('Invite link', message);
    }
  }

  async function handleShare() {
    const code = inviteCode ?? await refreshInviteCode();
    const message = code ? buildInviteMessage(code) : null;
    if (!message) return;
    try {
      void hapticSelection();
      // Do NOT pass url: separately — iOS fetches OG metadata for the URL and shows
      // TestFlight's logo as the share preview instead of Stokit's icon.
      // The TestFlight link is already inside the message text.
      await Share.share({ message });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Please try again.');
      void hapticError();
    }
  }

  async function handleTestInvite() {
    const code = inviteCode ?? await refreshInviteCode();
    if (!code) return;
    void hapticSuccess();
    Alert.alert(
      'Invite ready',
      `Code ${code} is active.\n\nShare link includes TestFlight, deep link, and raw code fallback.`,
    );
  }

  const refreshHealth = useCallback(async () => {
    const [fg, bg, notif, geo] = await Promise.all([
      Location.getForegroundPermissionsAsync().catch(() => null),
      Location.getBackgroundPermissionsAsync().catch(() => null),
      Notifications.getPermissionsAsync().catch(() => null),
      Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false),
    ]);
    setHealth({
      location: bg?.status === 'granted' ? 'Always allowed' : fg?.status === 'granted' ? 'While using' : 'Needs permission',
      notifications: notif?.status === 'granted' ? 'Allowed' : 'Needs permission',
      geofence: geo ? 'Active' : 'Not active',
      geofenceActive: geo,
    });
  }, []);

  useFocusEffect(useCallback(() => { void refreshHealth(); }, [refreshHealth]));

  function handleGeofenceDebug() {
    const monitored = stores.filter((s) => s.latitude != null && s.longitude != null);
    Alert.alert(
      'Geofence status',
      `${health.geofence}\n\n${monitored.length} of ${stores.length} saved stores have GPS coordinates.\n\nLocation: ${health.location}\nNotifications: ${health.notifications}`,
    );
  }

  function handleEditBudget() {
    Alert.prompt(
      'Weekly budget',
      'Set your weekly shopping budget (e.g. 200).',
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
          updateHousehold({ name: name.trim() });
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

  function handleJoinAnotherHousehold() {
    if (household) {
      Alert.alert(
        'Switch household?',
        `You're currently in "${household.name}". Entering a new invite code will switch your shared pantry, shopping list, stores, receipts, and activity to the new household.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => router.push('/(setup)/join-household'),
          },
        ],
      );
    } else {
      router.push('/(setup)/join-household');
    }
  }

  function handleLeaveHousehold() {
    if (!household || !session?.user?.id) return;

    const isOwner = household.role === 'owner';

    // Sole-owner safety check — must run async before showing the confirm dialog
    if (isOwner) {
      setLeavingHousehold(true);
      getHouseholdMemberCount(household.id)
        .then((count) => {
          setLeavingHousehold(false);
          if (count <= 1) {
            // Only this owner — leaving would orphan the household entirely.
            // Block and explain clearly so the user is never stranded.
            void hapticError();
            Alert.alert(
              'Cannot leave household',
              "You're the only person in this household. Leaving would remove access to this pantry entirely.\n\nShare your invite code to add a partner first, or create a new household instead.",
              [
                { text: 'OK' },
                {
                  text: 'Create new household',
                  onPress: () => router.push('/(setup)/create-household'),
                },
              ],
            );
            return;
          }
          // Other members exist — safe to leave, show standard confirm
          showLeaveConfirm(isOwner);
        })
        .catch(() => {
          setLeavingHousehold(false);
          // If we can't check, fall back to the standard confirm (safer than hard blocking)
          showLeaveConfirm(isOwner);
        });
    } else {
      showLeaveConfirm(isOwner);
    }
  }

  function showLeaveConfirm(isOwner: boolean) {
    if (!household || !session?.user?.id) return;
    const message = isOwner
      ? "You're the household owner. Other members will still have access but there will be no owner. You'll lose access to this pantry."
      : "You'll no longer see this household's pantry, shopping lists, stores, or receipts. You can create a new household or join one with an invite code.";

    Alert.alert('Leave household?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave household', style: 'destructive',
        onPress: async () => {
          if (!household || !session?.user?.id) return;
          void hapticWarning();
          setLeavingHousehold(true);
          try {
            await leaveHousehold(household.id, session.user.id);
            // Clear all household-scoped state before navigating
            clearHousehold();
            setItems([]);
            setStores([]);
            setShoppingEntries([]);
            setActiveStore(null);
            setPendingReceiptStoreId(null);
            clearReceiptTrip();
            setArrivalStore(null);
            await stopGeofencing().catch(() => {});
            void hapticSuccess();
            router.replace('/(setup)/create-or-join');
          } catch (e: any) {
            Alert.alert('Could not leave', e?.message ?? 'Try again.');
            void hapticError();
          } finally {
            setLeavingHousehold(false);
          }
        },
      },
    ]);
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
            <ScalePressable
              style={[styles.row, styles.rowBorderTop]}
              onPress={() => { void hapticSelection(); handleJoinAnotherHousehold(); }}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="key-outline" size={17} color={colors.primary} />
                <Text style={[styles.rowLabel, { color: colors.primary }]}>
                  {household ? 'Join another household' : 'Join a household'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </ScalePressable>
            {household ? (
              <ScalePressable
                style={[styles.row, styles.rowBorderTop]}
                onPress={loadingInvite ? undefined : handleCopyCode}
                disabled={loadingInvite}
              >
                <View style={styles.rowLabelWrap}>
                  <Ionicons name="key-outline" size={17} color={colors.muted} />
                  <Text style={styles.rowLabel}>Invite code</Text>
                </View>
                <View style={styles.rowEditWrap}>
                  {loadingInvite ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Text style={styles.rowCode}>{inviteCode ?? 'Refresh'}</Text>
                      <Ionicons
                        name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                        size={15}
                        color={codeCopied ? colors.success : colors.muted}
                      />
                    </>
                  )}
                </View>
              </ScalePressable>
            ) : null}
          </View>
          {household ? (
            <View style={styles.inviteActionRow}>
              <ScalePressable
                style={[styles.shareBtn, loadingInvite && styles.shareBtnDisabled]}
                onPress={() => { void hapticSelection(); void handleShare(); }}
                disabled={loadingInvite}
              >
                {loadingInvite
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="share-outline" size={17} color={colors.primary} />
                }
                <Text style={styles.shareBtnText}>Share invite link</Text>
              </ScalePressable>
              {inviteDeepLink && (
                <ScalePressable
                  profile="chip"
                  style={styles.qrBtn}
                  onPress={() => { void hapticSelection(); setShowQR(true); }}
                >
                  <Ionicons name="qr-code-outline" size={17} color={colors.primary} />
                </ScalePressable>
              )}
              <ScalePressable
                style={[styles.testInviteBtn, loadingInvite && styles.shareBtnDisabled]}
                onPress={() => { void hapticSelection(); void handleTestInvite(); }}
                disabled={loadingInvite}
              >
                <Ionicons name="checkmark-circle-outline" size={17} color={colors.primary} />
                <Text style={styles.shareBtnText}>Test invite</Text>
              </ScalePressable>
            </View>
          ) : null}

          {/* QR Code Modal */}
          {inviteDeepLink && (
            <Modal
              visible={showQR}
              animationType="slide"
              transparent
              onRequestClose={() => setShowQR(false)}
            >
              <Pressable style={styles.qrOverlay} onPress={() => setShowQR(false)}>
                <Pressable style={styles.qrSheet} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.qrHandle} />
                  <View style={styles.qrBrand}>
                    <AppIcon size={48} />
                    <Text style={styles.qrBrandName}>Stokit</Text>
                  </View>
                  <Text style={styles.qrTitle}>Scan to join</Text>
                  <Text style={styles.qrSub}>Open camera and point at this code to join {household?.name ?? 'the household'}.</Text>
                  <View style={styles.qrBox}>
                    <QRCode
                      value={inviteDeepLink}
                      size={200}
                      color={colors.ink}
                      backgroundColor={colors.surface}
                    />
                  </View>
                  <View style={styles.qrCodePill}>
                    <Text style={styles.qrCodeText}>{inviteCode}</Text>
                  </View>
                  <ScalePressable profile="chip" style={styles.qrClose} onPress={() => setShowQR(false)}>
                    <Text style={styles.qrCloseText}>Done</Text>
                  </ScalePressable>
                </Pressable>
              </Pressable>
            </Modal>
          )}
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
                  <Text style={styles.rowSubLabel}>Tap to adjust your weekly shopping budget</Text>
                </View>
              </View>
              <View style={[styles.rowEditWrap, { flexShrink: 0 }]}>
                <Text style={[styles.rowValue, { color: colors.primary, fontFamily: fonts.bodySemiBold }]} numberOfLines={1}>${weeklyBudget}</Text>
                <Ionicons name="pencil-outline" size={15} color={colors.primary} />
              </View>
            </ScalePressable>
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.notificationRow]}>
              <View style={[styles.rowLabelWrap, styles.notificationLabelWrap]}>
                <Ionicons name="moon-outline" size={17} color={colors.muted} />
                <View style={styles.notificationTextWrap}>
                  <Text style={styles.rowLabel}>Dark mode</Text>
                  <Text style={styles.rowSubLabel}>Switch between light and dark theme</Text>
                </View>
              </View>
              <View style={styles.switchSlot}>
                <Switch
                  value={isDark}
                  onValueChange={() => { void hapticSelection(); toggleTheme(); }}
                  trackColor={{ false: colors.faint, true: colors.primarySoft }}
                  thumbColor={isDark ? colors.primary : colors.surface}
                  ios_backgroundColor={colors.faint}
                  style={styles.notificationSwitch}
                />
              </View>
            </View>
          </View>
        </View>

        {/* System status */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>System status</Text>
          <View style={styles.card}>
            {([
              { label: 'Location', value: health.location, good: health.location !== 'Needs permission', icon: 'location-outline' },
              { label: 'Notifications', value: health.notifications, good: health.notifications === 'Allowed', icon: 'notifications-outline' },
              { label: 'Geofence', value: health.geofence, good: health.geofenceActive, icon: 'navigate-outline' },
            ] as const).map((row, i) => (
              <View key={row.label} style={[styles.row, i > 0 && styles.rowBorderTop]}>
                <View style={styles.rowLabelWrap}>
                  <Ionicons name={row.icon as any} size={17} color={colors.muted} />
                  <Text style={styles.rowLabel}>{row.label}</Text>
                </View>
                <View style={[styles.healthPill, row.good ? styles.healthPillGood : styles.healthPillWarn]}>
                  <Text style={[styles.healthText, row.good ? styles.healthTextGood : styles.healthTextWarn]}>
                    {row.value}
                  </Text>
                </View>
              </View>
            ))}
            <ScalePressable
              style={[styles.row, styles.rowBorderTop]}
              onPress={() => { void hapticSelection(); handleGeofenceDebug(); }}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons name="bug-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Geofence info</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </ScalePressable>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          <View style={styles.card}>
            {([
              { key: 'arrivalSelf', label: 'My store arrivals', sub: 'Notify me when I arrive at a saved store', icon: 'location-outline', value: notifArrivalSelf, set: setNotifArrivalSelf },
              { key: 'arrivalPartner', label: 'Partner arrivals', sub: "Alert me when my partner arrives at a store", icon: 'people-outline', value: notifArrivalPartner, set: setNotifArrivalPartner },
              { key: 'expiry', label: 'Expiry reminders', sub: 'Remind me 3 days before items expire', icon: 'time-outline', value: notifExpiry, set: setNotifExpiry },
              { key: 'lowStock', label: 'Low stock alerts', sub: 'Alert when pantry items run low', icon: 'alert-circle-outline', value: notifLowStock, set: setNotifLowStock },
            ] as const).map((row, i) => (
              <View key={row.key} style={[styles.row, styles.notificationRow, i > 0 && styles.rowBorderTop]}>
                <View style={[styles.rowLabelWrap, styles.notificationLabelWrap]}>
                  <Ionicons name={row.icon as any} size={17} color={colors.muted} />
                  <View style={styles.notificationTextWrap}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowSubLabel}>{row.sub}</Text>
                  </View>
                </View>
                <View style={styles.switchSlot}>
                  <Switch
                    value={row.value}
                    onValueChange={(v) => { void hapticSelection(); row.set(v); }}
                    trackColor={{ false: colors.faint, true: colors.primarySoft }}
                    thumbColor={row.value ? colors.primary : colors.surface}
                    ios_backgroundColor={colors.faint}
                    style={styles.notificationSwitch}
                  />
                </View>
              </View>
            ))}
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

        <Text style={styles.versionText}>Stokit v{appVersion}</Text>
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
    },
    heroAvatar: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primarySoft,
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
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 15, gap: 12,
    },
    rowBorderTop: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    rowLabel: { fontSize: 15, color: colors.ink, fontFamily: fonts.bodyMedium },
    rowSubLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 1 },
    notificationRow: { minHeight: 72, alignItems: 'center' },
    notificationLabelWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
    notificationTextWrap: { flex: 1, minWidth: 0 },
    switchSlot: { width: 52, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    notificationSwitch: { transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] },
    rowEditWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    rowValue: { fontSize: 16, color: colors.ink, fontFamily: fonts.bodyMedium, flexShrink: 1, textAlign: 'right' },
    rowCode: { fontSize: 16, color: colors.ink, fontFamily: fonts.mono, flexShrink: 1, textAlign: 'right', letterSpacing: 0.5 },
    inviteActionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    shareBtn: {
      flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, borderRadius: 16,
      backgroundColor: colors.primarySoft,
    },
    testInviteBtn: {
      flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, borderRadius: 16,
      backgroundColor: colors.primarySoft,
    },
    shareBtnDisabled: { opacity: 0.65 },
    shareBtnText: { color: colors.primary, fontSize: 15, fontFamily: fonts.bodySemiBold },
    qrBtn: {
      width: 50, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
      borderRadius: 16, backgroundColor: colors.primarySoft,
    },
    qrOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
    },
    qrSheet: {
      backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, alignItems: 'center',
    },
    qrHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: colors.border, marginBottom: 16,
    },
    qrBrand: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 16,
    },
    qrBrandName: {
      fontSize: 22, fontFamily: fonts.displayExtraBoldItalic,
      color: colors.primary, letterSpacing: 0,
    },
    qrTitle: {
      fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.ink,
      marginBottom: 6,
    },
    qrSub: {
      fontSize: 14, fontFamily: fonts.body, color: colors.muted,
      textAlign: 'center', lineHeight: 20, marginBottom: 28,
    },
    qrBox: {
      padding: 20, borderRadius: 20, backgroundColor: colors.surface,
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 4, marginBottom: 20,
    },
    qrCodePill: {
      backgroundColor: colors.faint, borderRadius: 999,
      paddingHorizontal: 20, paddingVertical: 10, marginBottom: 24,
    },
    qrCodeText: {
      fontSize: 20, fontFamily: fonts.mono, color: colors.ink,
      letterSpacing: 4, fontVariant: ['tabular-nums'],
    },
    qrClose: {
      paddingVertical: 14, paddingHorizontal: 40,
      borderRadius: 14, backgroundColor: colors.primarySoft,
    },
    qrCloseText: { fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.primary },
    healthPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      maxWidth: 160,
    },
    healthPillGood: { backgroundColor: colors.successSoft },
    healthPillWarn: { backgroundColor: colors.warningSoft },
    healthText: { fontSize: 12, fontFamily: fonts.bodySemiBold, textAlign: 'right' },
    healthTextGood: { color: colors.success },
    healthTextWarn: { color: colors.warning },
    signOutBtn: {
      marginHorizontal: 20, marginTop: 20,
      flexDirection: 'row', gap: 8, justifyContent: 'center',
      backgroundColor: colors.dangerSoft, borderRadius: 16,
      paddingVertical: 16, alignItems: 'center',
    },
    signOutText: { color: colors.danger, fontSize: 17, fontFamily: fonts.bodySemiBold },
    versionText: {
      textAlign: 'center', marginTop: 20,
      fontSize: 12, color: colors.faint, fontFamily: fonts.mono,
    },
  });
}
