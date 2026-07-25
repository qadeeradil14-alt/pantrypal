import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { OTA_SEQ } from '../../constants/version';
import { isExpoGo } from '../../core/services/geofencing';
import { syncDiagEnabled, dumpSyncDiag } from '../../core/services/syncDiag'; // DIAG: temporary — remove after OTA 389/390 investigation
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeveloperConsole } from '../../components/diagnostics/DeveloperConsole';
import {
  canAccessDiagnostics,
  initialUnlockTapState,
  parseAllowlist,
  registerUnlockTap,
} from '../../core/services/diagnostics/access';
import { config, hasDiagnosticsFlag } from '../../lib/config';
import { useAuthStore } from '../../store/auth-store';

const DEV_MODE_KEY = 'stokit:v2:developer_mode';
const DEV_MODE_TAP_TARGET = 7;

export default function AboutScreen() {
  const { colors } = useTheme();
  const inExpoGo = isExpoGo();
  const [devMode, setDevMode] = useState(false);
  const [, setDevTapCount] = useState(0);
  const devTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(DEV_MODE_KEY).then((v) => setDevMode(v === 'true'));
  }, []);

  // DIAG: temporary — remove after OTA 389/390 investigation. Hidden export of
  // the sync diagnostic buffer via the OS share sheet; only wired when enabled.
  const handleExportDiag = useCallback(async () => {
    if (!syncDiagEnabled()) return;
    try {
      await Share.share({ message: dumpSyncDiag(OTA_SEQ) });
    } catch {
      /* user dismissed the share sheet — non-fatal */
    }
  }, []);

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

  // ── Developer Diagnostics (read-only observer) ─────────────────────────────
  // Authorization is the existing developer flag AND an explicit config flag
  // (optionally narrowed to an allowlist). The tap gesture only reveals an
  // already-authorized console — it is obscurity, never the access control.
  const authUser = useAuthStore((s) => s.user);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticsTapsRef = React.useRef(initialUnlockTapState);

  const diagnosticsAuthorized = canAccessDiagnostics({
    isDevBundle: __DEV__,
    flagEnabled: hasDiagnosticsFlag(),
    allowlist: parseAllowlist(config.diagnosticsAllowlist),
    signedInUserId: authUser?.id ?? null,
    signedInEmail: authUser?.email ?? null,
    developerModeEnabled: devMode,
  });

  const handleDiagnosticsTap = useCallback(() => {
    // Unauthorized taps are inert: no counting, no feedback, nothing to probe.
    if (!diagnosticsAuthorized) return;
    const next = registerUnlockTap(diagnosticsTapsRef.current, Date.now());
    diagnosticsTapsRef.current = { count: next.count, lastTapAt: next.lastTapAt };
    if (next.unlocked) setDiagnosticsOpen(true);
  }, [diagnosticsAuthorized]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen>
      <SubScreenHeader eyebrow="More" title="About" />
      <Card style={styles.sectionCard}>
        <View style={styles.statRow}>
          <View style={styles.aboutLabel}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>App</Text>
          </View>
          <Text style={styles.statValue}>Stokit</Text>
        </View>
        <Pressable
          style={styles.statRow}
          onPress={handleDevTap}
          onLongPress={syncDiagEnabled() ? handleExportDiag : undefined}
          delayLongPress={800}
          accessibilityRole="button"
          accessibilityLabel="Version info"
        >
          <View style={styles.aboutLabel}>
            <Ionicons name="git-branch-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Version</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.statValue}>{Constants.expoConfig?.version ?? '1.0.0'} (OTA {OTA_SEQ})</Text>
            {devMode && (
              <View style={styles.devModeBadge}>
                <Text style={styles.devModeBadgeText}>DEV</Text>
              </View>
            )}
          </View>
        </Pressable>
        {/*
          Diagnostics unlock lives on Build, not Version: the Version row
          already owns the 7-tap developer-mode gesture, and a 5-tap unlock
          there would fire first and make that existing toggle unreachable.
          Pressable adds no visual or behavioural change for normal users —
          taps are inert unless diagnostics are authorized.
        */}
        <Pressable
          style={styles.statRow}
          onPress={handleDiagnosticsTap}
          accessibilityRole="button"
          accessibilityLabel="Build info"
        >
          <View style={styles.aboutLabel}>
            <Ionicons name="cube-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Build</Text>
          </View>
          <Text style={styles.statValue}>
            {inExpoGo ? 'Expo Go' : 'Standalone'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.statRow, { borderBottomWidth: 0 }]}
          onPress={() => Linking.openURL('https://support-site-xi.vercel.app/privacy')}
          accessibilityRole="button"
          accessibilityLabel="Privacy Policy"
        >
          <View style={styles.aboutLabel}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Privacy Policy</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </Pressable>
      </Card>

      {/* Mounted only after a successful unlock; closing unmounts it entirely. */}
      {diagnosticsOpen ? (
        <DeveloperConsole visible onClose={() => setDiagnosticsOpen(false)} />
      ) : null}
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
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
    statLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.inkSoft },
    statValue: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink },
    aboutLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    devModeBadge: {
      backgroundColor: colors.primary,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    devModeBadgeText: { fontFamily: fonts.sansSemibold, fontSize: 10, color: '#fff' },
  });
}
