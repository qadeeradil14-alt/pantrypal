import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useAuthStore } from '../../store/auth-store';
import { useTheme } from '../../hooks/useTheme';
import {
  registerPushToken,
  getMyPushDiagnostics,
  type MyPushDiagnostics,
} from '../../core/services/notifications';

export default function PushNotificationsScreen() {
  const { colors } = useTheme();
  const authUser = useAuthStore((s) => s.user);

  const [diag, setDiag] = useState<MyPushDiagnostics | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDiag(await getMyPushDiagnostics());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const register = useCallback(async () => {
    if (!authUser) {
      setRegisterStatus('No signed-in user.');
      return;
    }
    setRegistering(true);
    setRegisterStatus(null);
    try {
      const result = await registerPushToken(authUser.id);
      setRegisterStatus(result.ok ? '✓ Push notifications enabled' : `✗ ${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
      await refresh();
    } finally {
      setRegistering(false);
    }
  }, [authUser, refresh]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen>
      <SubScreenHeader eyebrow="Notifications" title="Push Notifications" />

      <Card style={styles.sectionCard}>
        <View style={styles.introRow}>
          <View style={styles.rowIcon}>
            <Ionicons name="notifications-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Push delivery</Text>
            <Text style={styles.introBody}>
              Push notifications let household members reach this device — trip alerts and shared updates arrive even when Stokit is closed.
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Permission</Text>
          <Text style={[styles.statValue, diag?.permission === 'denied' && { color: colors.danger }]}>
            {diag ? diag.permission : '…'}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Registration</Text>
          <Text style={[styles.statValue, diag && { color: diag.tokenPresent ? colors.success : colors.danger }]}>
            {diag ? (diag.tokenPresent ? 'Registered' : 'Not registered') : '…'}
          </Text>
        </View>
        {diag?.error ? (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Error</Text>
            <Text style={[styles.statValue, { color: colors.danger }]}>{diag.error}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.registerButton, registering && { opacity: 0.6 }]}
          onPress={() => void register()}
          disabled={registering}
          accessibilityRole="button"
          accessibilityLabel="Enable push notifications"
        >
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={styles.registerButtonText}>
            {registering ? 'Registering…' : diag?.tokenPresent ? 'Re-register this device' : 'Enable push notifications'}
          </Text>
        </Pressable>
        {registerStatus ? (
          <Text
            style={[
              styles.registerResult,
              registerStatus.startsWith('✓') ? { color: colors.success } : { color: colors.danger },
            ]}
          >
            {registerStatus}
          </Text>
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
  });
}
