import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { CURRENT_OTA_LABEL, formatAppVersion, formatInstalledUpdate } from '../../constants/version';
import { isExpoGo } from '../../core/services/geofencing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_MODE_KEY = 'stokit:v2:developer_mode';
const DEV_MODE_TAP_TARGET = 7;

export default function AboutScreen() {
  const { colors } = useTheme();
  const inExpoGo = isExpoGo();
  const [devMode, setDevMode] = useState(false);
  const [showBuildType, setShowBuildType] = useState(false);
  const [showUpdateDetails, setShowUpdateDetails] = useState(false);
  const [, setDevTapCount] = useState(0);
  const devTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(DEV_MODE_KEY).then((v) => setDevMode(v === 'true'));
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
          onLongPress={() => setShowBuildType(true)}
          accessibilityRole="button"
          accessibilityLabel="Version info"
        >
          <View style={styles.aboutLabel}>
            <Ionicons name="git-branch-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Version</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.statValue}>
              {formatAppVersion(
                Constants.expoConfig?.version ?? '1.0.0',
                Constants.nativeBuildVersion ?? Constants.platform?.ios?.buildNumber,
              )}
            </Text>
            {devMode && (
              <View style={styles.devModeBadge}>
                <Text style={styles.devModeBadgeText}>DEV</Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable
          style={styles.statRow}
          onPress={() => setShowUpdateDetails((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel="Update details"
          accessibilityState={{ expanded: showUpdateDetails }}
        >
          <View style={styles.aboutLabel}>
            <Ionicons name="cloud-download-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Update</Text>
          </View>
          <View style={styles.updateValue}>
            <Text style={styles.statValue}>{CURRENT_OTA_LABEL}</Text>
            <Ionicons name={showUpdateDetails ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </View>
        </Pressable>
        {showUpdateDetails && (
          <View style={styles.updateDetails}>
            <View style={styles.updateDetailRow}>
              <Text style={styles.updateDetailLabel}>Expo Update ID</Text>
              <Text style={styles.updateDetailValue} selectable>{formatInstalledUpdate(Updates.updateId)}</Text>
            </View>
            <View style={styles.updateDetailRow}>
              <Text style={styles.updateDetailLabel}>Runtime Version</Text>
              <Text style={styles.updateDetailValue}>{Updates.runtimeVersion ?? 'Unavailable'}</Text>
            </View>
            <View style={styles.updateDetailRow}>
              <Text style={styles.updateDetailLabel}>Channel</Text>
              <Text style={styles.updateDetailValue}>{Updates.channel ?? 'Unavailable'}</Text>
            </View>
          </View>
        )}
        {(devMode || showBuildType) && (
          <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
            <View style={styles.aboutLabel}>
              <Ionicons name="cube-outline" size={16} color={colors.muted} />
              <Text style={styles.statLabel}>Build Type</Text>
            </View>
            <Text style={styles.statValue}>
              {Updates.channel === 'production' ? 'Production' : (Updates.channel ?? (inExpoGo ? 'Expo Go' : 'Standalone'))}
            </Text>
          </View>
        )}
      </Card>
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
    updateValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    updateDetails: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    updateDetailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
    updateDetailLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.inkSoft },
    updateDetailValue: { flex: 1.5, fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink, textAlign: 'right' },
    devModeBadge: {
      backgroundColor: colors.primary,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    devModeBadgeText: { fontFamily: fonts.sansSemibold, fontSize: 10, color: '#fff' },
  });
}
