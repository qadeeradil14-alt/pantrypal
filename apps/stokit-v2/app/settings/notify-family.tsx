import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Card } from '../../components/shared/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import { fonts, spacing, type AppColors } from '../../theme';
import { useHouseholdStore } from '../../store/household-store';
import { useTheme } from '../../hooks/useTheme';
import {
  getHouseholdPushDiagnostics,
  type HouseholdPushDiagnostics,
} from '../../core/services/notifications';

export default function NotifyFamilyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);

  const [diag, setDiag] = useState<HouseholdPushDiagnostics | null>(null);

  const isShared = Boolean(household && !household.isPersonal);

  const refresh = useCallback(async () => {
    setDiag(await getHouseholdPushDiagnostics());
  }, []);

  useEffect(() => {
    if (isShared) void refresh();
  }, [isShared, refresh]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen>
      <SubScreenHeader eyebrow="Notifications" title="Notify Family" />

      {!isShared ? (
        <EmptyState
          icon="people-outline"
          title="No shared household yet"
          body="Family alerts need a shared household. Create one or join with an invite code, then everyone gets notified when a shopping trip starts."
          ctaLabel="Go to Household"
          onCta={() => router.push('/household')}
        />
      ) : (
        <Card style={styles.sectionCard}>
          <View style={styles.introRow}>
            <View style={styles.rowIcon}>
              <Ionicons name="people-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitle}>Family trip alerts</Text>
              <Text style={styles.introBody}>
                When you start a shopping trip, the rest of {household?.name ?? 'your household'} can get a notification — so anyone can add last-minute items while you're at the store.
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Household members</Text>
            <Text style={styles.statValue}>{members.length}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Members reachable by push</Text>
            <Text style={[styles.statValue, diag && { color: diag.recipientsWithToken > 0 ? colors.success : colors.danger }]}>
              {diag ? String(diag.recipientsWithToken) : '…'}
            </Text>
          </View>
          {diag && !diag.ok && diag.error ? (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Error</Text>
              <Text style={[styles.statValue, { color: colors.danger }]}>{diag.error}</Text>
            </View>
          ) : null}

          <Text style={styles.footnote}>
            Members become reachable once they enable push notifications on their own device. You choose whether to notify the family each time you start a trip from the Shopping tab.
          </Text>
        </Card>
      )}
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
    footnote: { fontFamily: fonts.sans, fontSize: 12, color: colors.faintText, lineHeight: 18, marginTop: spacing.md },
  });
}
