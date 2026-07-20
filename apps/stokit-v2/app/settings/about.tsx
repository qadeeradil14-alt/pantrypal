import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { OTA_SEQ } from '../../constants/version';
import { isExpoGo } from '../../core/services/geofencing';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        <Pressable style={styles.statRow} onPress={handleDevTap} accessibilityRole="button" accessibilityLabel="Version info">
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
        <View style={styles.statRow}>
          <View style={styles.aboutLabel}>
            <Ionicons name="cube-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>Build</Text>
          </View>
          <Text style={styles.statValue}>
            {inExpoGo ? 'Expo Go' : 'Standalone'}
          </Text>
        </View>
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
