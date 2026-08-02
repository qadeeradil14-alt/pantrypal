import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useAuthStore } from '../../store/auth-store';
import { useTheme } from '../../hooks/useTheme';
import {
  registerPushToken,
  unregisterPushToken,
  getPushStatus,
  readPushPreference,
  writePushPreference,
} from '../../core/services/notifications';
import { pushStatusLabel, type PushStatusResult } from '../../core/services/pushStatus';

export default function PushNotificationsScreen() {
  const { colors } = useTheme();
  const authUser = useAuthStore((s) => s.user);

  // Truthful state: local permission and token, checked against the row
  // actually stored in Supabase for this user. The previous version of this
  // screen printed "Registered" from getMyPushDiagnostics(), which only proves
  // this device can MINT a token — it never asked the server, so a device whose
  // row was cleared on sign-out still showed as registered while receiving
  // nothing.
  const [status, setStatus] = useState<PushStatusResult | null>(null);
  const [preference, setPreference] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [next, pref] = await Promise.all([
      getPushStatus(authUser?.id ?? null),
      readPushPreference(),
    ]);
    setStatus(next);
    setPreference(pref);
  }, [authUser?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = useCallback(async (next: boolean) => {
    setBusy(true);
    setActionResult(null);
    try {
      await writePushPreference(next);
      setPreference(next);
      if (!authUser) return;
      // The toggle controls the remote registration, so switching it off really
      // stops delivery rather than only hiding a row.
      if (next) await registerPushToken(authUser.id);
      else await unregisterPushToken(authUser.id);
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [authUser, refresh]);

  const repair = useCallback(async () => {
    if (!authUser) {
      setActionResult('Sign in to repair notifications.');
      return;
    }
    setBusy(true);
    setActionResult(null);
    try {
      // Idempotent: a keyed update on user_id, with duplicate ownership
      // prevented server-side by household_members_push_token_single_owner.
      const result = await registerPushToken(authUser.id);
      setActionResult(result.ok ? '✓ Notifications repaired' : `✗ ${result.reason}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [authUser, refresh]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const statusTone =
    status?.status === 'on' ? colors.success
    : status?.status === 'needs_attention' ? colors.danger
    : colors.muted;

  return (
    <Screen>
      <SubScreenHeader eyebrow="Notifications" title="Push Notifications" />

      <Card style={styles.sectionCard}>
        <View style={styles.introRow}>
          <View style={styles.rowIcon}>
            <Ionicons name="notifications-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Push notifications</Text>
            <Text style={styles.introBody}>
              Receive household shopping alerts and shared updates.
            </Text>
          </View>
          <Switch
            value={preference && status?.status === 'on'}
            onValueChange={(next) => void toggle(next)}
            disabled={busy || status?.issue === 'unsupported'}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Status</Text>
          <Text style={[styles.statValue, { color: statusTone }]}>
            {status ? pushStatusLabel(status.status) : '…'}
          </Text>
        </View>

        {status ? <Text style={styles.statusMessage}>{status.message}</Text> : null}

        {/* Only ever offer the action that can actually resolve the state. */}
        {status?.needsSystemSettings ? (
          <Pressable
            style={({ pressed }) => [styles.registerButton, pressed && { opacity: 0.7 }]}
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open iOS Settings"
          >
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={styles.registerButtonText}>Open Settings</Text>
          </Pressable>
        ) : status?.repairable ? (
          <Pressable
            style={[styles.registerButton, busy && { opacity: 0.6 }]}
            onPress={() => void repair()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Repair notifications"
          >
            <Ionicons name="build-outline" size={16} color={colors.primary} />
            <Text style={styles.registerButtonText}>
              {busy ? 'Repairing…' : 'Repair notifications'}
            </Text>
          </Pressable>
        ) : null}

        {actionResult ? (
          <Text
            style={[
              styles.registerResult,
              actionResult.startsWith('✓') ? { color: colors.success } : { color: colors.danger },
            ]}
          >
            {actionResult}
          </Text>
        ) : null}

        {/* Permission / registration detail is troubleshooting, not a headline. */}
        <Pressable
          style={({ pressed }) => [styles.troubleshootToggle, pressed && { opacity: 0.7 }]}
          onPress={() => setTroubleshootOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={troubleshootOpen ? 'Hide troubleshooting' : 'Show troubleshooting'}
        >
          <Ionicons
            name={troubleshootOpen ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.muted}
          />
          <Text style={styles.troubleshootToggleText}>Troubleshooting</Text>
        </Pressable>

        {troubleshootOpen ? (
          <View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Notification permission</Text>
              <Text style={styles.statValue}>
                {status?.issue === 'permission_denied' ? 'denied'
                  : status?.issue === 'permission_undetermined' ? 'not asked'
                  : status ? 'granted' : '…'}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Registered on server</Text>
              <Text style={styles.statValue}>
                {status === null ? '…'
                  : status.status === 'on' ? 'yes'
                  : status.issue === 'remote_unreadable' ? 'unknown'
                  : 'no'}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Detail</Text>
              <Text style={styles.statValue}>{status?.issue ?? 'none'}</Text>
            </View>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    introTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    introBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
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
    statusMessage: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: spacing.sm },
    registerButton: {
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
    registerButtonText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.primary },
    registerResult: { fontFamily: fonts.monoMedium, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
    troubleshootToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    troubleshootToggleText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  });
}
