import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useDurableStore } from '../../store/durable-store';
import { useAuthStore } from '../../store/auth-store';
import { useSessionStore } from '../../store/session-store';
import { useTheme } from '../../hooks/useTheme';
import { useThemeStore } from '../../store/theme';
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
import { isActivePantryItem } from '../../core/services/geofencingLogic';
import { hasValidStoreCoordinates } from '../../core/services/storeCoordinates';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IOS_GEOFENCE_LIMIT = 20;
const DEV_MODE_KEY = 'stokit:v2:developer_mode';

function formatDiagnosticTime(value: number | null): string {
  return value ? new Date(value).toLocaleString() : 'unavailable';
}

function formatRegistrationStatus(status: string): string {
  if (status === 'running_existing') return 'active';
  if (status === 'not_running') return 'not running';
  return status;
}

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

export default function StoreArrivalAlertsScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const { isDark: storedTheme } = useThemeStore();
  const systemScheme = useColorScheme();
  const items = useDurableStore((s) => s.items);
  const stores = useDurableStore((s) => s.stores);
  const session = useSessionStore((s) => s.session);

  const [devMode, setDevMode] = useState(false);

  const [geofenceOn, setGeofenceOn] = useState(false);
  const [geofenceLoading, setGeofenceLoading] = useState(false);
  const [geofenceDiagnostics, setGeofenceDiagnostics] = useState<GeofenceDiagnostics | null>(null);
  const [geofencingRunningNow, setGeofencingRunningNow] = useState<boolean | null>(null);
  const gpsStores = stores.filter((s) => hasValidStoreCoordinates(s.lat, s.lng));
  const storesMissingCoordinates = stores.filter((s) => !hasValidStoreCoordinates(s.lat, s.lng));
  const monitorableStores = geofenceableStores(stores, IOS_GEOFENCE_LIMIT, items);
  const storesMissingLocation = stores.length - gpsStores.length;
  const inExpoGo = isExpoGo();
  const activeShoppingTrip = session.status !== 'idle' && session.status !== 'trip_summary';

  const [notifDiagnostics, setNotifDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [notifLog, setNotifLog] = useState<NotificationLogEntry[]>([]);
  const [testNotifStatus, setTestNotifStatus] = useState<string | null>(null);
  const [testNotifLoading, setTestNotifLoading] = useState(false);

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
  // round-trip for every user on every open.
  useEffect(() => {
    if (devMode) void refreshPushDiagnostics();
  }, [devMode, refreshPushDiagnostics]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const openStoresScreen = useCallback((storeId?: string) => {
    if (storeId) {
      router.push({ pathname: '/(tabs)/stores', params: { fixLocationStoreId: storeId } } as never);
    } else {
      router.push('/(tabs)/stores' as never);
    }
  }, [router]);

  const openFirstMissingStoreLocation = useCallback(() => {
    const store = stores.find((candidate) => !hasValidStoreCoordinates(candidate.lat, candidate.lng));
    if (store) {
      openStoresScreen(store.id);
    } else {
      openStoresScreen();
    }
  }, [openStoresScreen, stores]);

  const toggleGeofence = useCallback(async (value: boolean) => {
    if (value && gpsStores.length === 0) {
      Alert.alert(
        'No store coordinates',
        'Use the Fix store locations section below to update at least one saved store with GPS coordinates.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Fix location', onPress: openFirstMissingStoreLocation },
        ],
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
              'Use the Fix store locations section below to update at least one saved store with GPS coordinates.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Fix location', onPress: openFirstMissingStoreLocation },
              ],
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
  }, [stores, items, gpsStores.length, refreshDiagnostics, openFirstMissingStoreLocation]);

  const sendArrivalNotification = useCallback(async (source: 'test' | 'manual') => {
    setTestNotifLoading(true);
    setTestNotifStatus(null);
    try {
      const targetStore = monitorableStores[0];
      if (!targetStore) {
        setTestNotifStatus('✗ No shopping-list store alerts to test.');
        return;
      }
      const storeName = targetStore?.name ?? 'Test Store';
      const itemNames = items
        .filter((i) => i.storeId === targetStore.id && isActivePantryItem(i))
        .map((i) => i.name);
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

  return (
    <Screen>
      <SubScreenHeader eyebrow="Notifications" title="Store Arrival Alerts" />

      <Card style={styles.sectionCard}>
        <ToggleRow
          icon="location-outline"
          label="Store arrival reminders"
          description={
            inExpoGo
              ? 'Coming soon'
              : gpsStores.length === 0
              ? 'Fix a store location to enable'
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

        {storesMissingCoordinates.length > 0 && (
          <View style={styles.locationFixSection}>
            <View style={styles.locationFixHeader}>
              <Ionicons name="map-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationFixTitle}>Fix store locations</Text>
                <Text style={styles.locationFixNote}>
                  {gpsStores.length} of {stores.length} saved store{stores.length === 1 ? '' : 's'} are GPS-ready.
                </Text>
              </View>
            </View>
            {storesMissingCoordinates.slice(0, 3).map((store) => (
              <Pressable
                key={store.id}
                style={({ pressed }) => [styles.locationFixRow, pressed && { opacity: 0.7 }]}
                onPress={() => openStoresScreen(store.id)}
                accessibilityRole="button"
                accessibilityLabel={`Fix location for ${store.name}`}
              >
                <View style={styles.locationFixRowText}>
                  <Text style={styles.locationFixStoreName}>{store.name}</Text>
                  <Text style={styles.locationFixStoreMeta}>Missing GPS location</Text>
                </View>
                <Text style={styles.locationFixAction}>Fix</Text>
              </Pressable>
            ))}
            {storesMissingCoordinates.length > 3 ? (
              <Pressable
                style={({ pressed }) => [styles.locationFixAllButton, pressed && { opacity: 0.7 }]}
                onPress={() => openStoresScreen()}
                accessibilityRole="button"
                accessibilityLabel="Open Stores to fix more locations"
              >
                <Text style={styles.locationFixAllText}>
                  View {storesMissingCoordinates.length - 3} more in Stores
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={styles.testNotifSection}>
          <View style={styles.testNotifHeader}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.testNotifHeading}>Arrival alert</Text>
              <Text style={styles.testNotifNote}>Send a manual alert if an arrival reminder did not appear.</Text>
            </View>
          </View>
          <Pressable
            style={[styles.testNotifButton, testNotifLoading && { opacity: 0.6 }]}
            onPress={() => void sendArrivalNotification('manual')}
            disabled={testNotifLoading}
            accessibilityRole="button"
            accessibilityLabel="Send arrival notification"
          >
            <Ionicons name="notifications-outline" size={16} color={colors.primary} />
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
            <Ionicons name="refresh-outline" size={16} color={colors.primary} />
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
            iOS can monitor up to {IOS_GEOFENCE_LIMIT} regions. Stores need coordinates and at least one assigned low or expiring shopping-list item.
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
            <Ionicons name="notifications-outline" size={16} color={colors.primary} />
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
      <View style={[styles.rowIcon, dimmed && { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name={icon} size={19} color={dimmed ? colors.muted : colors.primary} />
      </View>
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
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    toggleLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    toggleDesc: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    locationWarning: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.warning,
      lineHeight: 18,
      marginTop: spacing.xs,
    },
    locationFixSection: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      gap: spacing.sm,
    },
    locationFixHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    locationFixTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
    locationFixNote: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
    locationFixRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: 48,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    locationFixRowText: { flex: 1 },
    locationFixStoreName: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
    locationFixStoreMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
    locationFixAction: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.primary },
    locationFixAllButton: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.primarySoft,
    },
    locationFixAllText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.primary },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    statLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.inkSoft, flex: 1, flexShrink: 1 },
    statValue: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    // ── Test notification section ──────────────────────────────────────────
    testNotifSection: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    testNotifHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    testNotifHeading: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.ink,
      marginBottom: 2,
    },
    testNotifNote: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
      marginBottom: 0,
    },
    testNotifButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
      marginTop: spacing.md,
    },
    testNotifButtonText: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      color: colors.primary,
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
