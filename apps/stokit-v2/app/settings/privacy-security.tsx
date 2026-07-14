import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { SubScreenHeader } from '../../components/shared/SubScreenHeader';
import { Button, Card } from '../../components/shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useHouseholdStore } from '../../store/household-store';
import { useTheme } from '../../hooks/useTheme';
import { clearLocalAppData } from '../../lib/local-data';
import { stopGeofencing } from '../../core/services/geofencing';

export default function PrivacySecurityScreen() {
  const { colors } = useTheme();
  const household = useHouseholdStore((s) => s.household);
  const members = useHouseholdStore((s) => s.members);
  const isSharedOwnerWithMembers = Boolean(household && !household.isPersonal && household.role === 'owner' && members.length > 1);

  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  return (
    <Screen>
      <SubScreenHeader eyebrow="More" title="Privacy & Security" />

      <Card style={styles.sectionCard}>
        <View style={styles.introRow}>
          <View style={styles.rowIcon}>
            <Ionicons name="location-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Location privacy</Text>
            <Text style={styles.introBody}>
              Your location is compared only against your saved stores' coordinates —
              Stokit doesn't track or save a history of where you've been. When you
              arrive somewhere on your list, you'll get a reminder on this device.
            </Text>
          </View>
        </View>
        <View style={[styles.introRow, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
          <View style={styles.rowIcon}>
            <Ionicons name="cloud-done-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Your data</Text>
            <Text style={styles.introBody}>
              Pantry, stores, receipts, and shopping history are synced to your Stokit account and shared only with your household members.
            </Text>
          </View>
        </View>
      </Card>

      <Card style={[styles.sectionCard, styles.dangerCard, { marginTop: spacing.lg }]}>
        <View style={styles.introRow}>
          <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Start fresh</Text>
            <Text style={styles.introBody}>Wipe pantry items, stores, receipts, and shopping history. Your account stays active.</Text>
          </View>
        </View>
        <Button label="Reset all local data" variant="danger" onPress={confirmReset} />
      </Card>
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionCard: { paddingVertical: spacing.md, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    dangerCard: { borderColor: colors.danger + '24' },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    introTitle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
    introBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
  });
}
