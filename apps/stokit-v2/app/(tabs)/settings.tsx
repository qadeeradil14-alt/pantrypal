import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/shared/Screen';
import { Card, PageTitle } from '../../components/shared/ui';
import { fonts, radii, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

type SettingsLink = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
};

type SettingsGroup = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  links: SettingsLink[];
};

const GROUPS: SettingsGroup[] = [
  {
    icon: 'person-outline',
    title: 'You',
    links: [
      { icon: 'id-card-outline', label: 'Account', route: '/settings/account' },
    ],
  },
  {
    icon: 'people-outline',
    title: 'Household',
    links: [
      { icon: 'people-outline', label: 'Household & roles', route: '/household' },
    ],
  },
  {
    icon: 'notifications-outline',
    title: 'Notifications',
    links: [
      { icon: 'notifications-outline', label: 'Push Notifications', route: '/settings/push-notifications' },
      { icon: 'chatbubbles-outline', label: 'Notify Family', route: '/settings/notify-family' },
      { icon: 'location-outline', label: 'Store Arrival Alerts', route: '/settings/store-arrival-alerts' },
    ],
  },
  {
    icon: 'apps-outline',
    title: 'App',
    links: [
      { icon: 'contrast-outline', label: 'Appearance', route: '/settings/appearance' },
      { icon: 'options-outline', label: 'Shopping Preferences', route: '/settings/shopping-preferences' },
      { icon: 'sparkles-outline', label: 'AI Features', route: '/settings/ai-features' },
    ],
  },
  {
    icon: 'time-outline',
    title: 'History',
    links: [
      { icon: 'receipt-outline', label: 'Receipts', route: '/receipts' },
      { icon: 'cart-outline', label: 'Shopping', route: '/shopping' },
    ],
  },
  {
    icon: 'ellipsis-horizontal-circle-outline',
    title: 'More',
    links: [
      { icon: 'star-outline', label: 'Premium', route: '/settings/premium' },
      { icon: 'link-outline', label: 'Integrations', route: '/settings/integrations' },
      { icon: 'shield-checkmark-outline', label: 'Privacy & Security', route: '/settings/privacy-security' },
      { icon: 'information-circle-outline', label: 'About', route: '/settings/about' },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen>
      <PageTitle eyebrow="Your account" title="Settings" />

      {GROUPS.map((group) => (
        <View key={group.title}>
          <View style={styles.sectionHeader}>
            <Ionicons name={group.icon} size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>{group.title}</Text>
          </View>
          <Card style={styles.sectionCard}>
            {group.links.map((link, index) => (
              <View key={link.label}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => router.push(link.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={link.label}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={link.icon} size={19} color={colors.primary} />
                  </View>
                  <Text style={styles.rowLabel}>{link.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    sectionTitle: { fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 26, color: colors.ink },
    sectionCard: { paddingVertical: spacing.xs, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
    },
    rowPressed: { opacity: 0.68 },
    rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    rowLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
    divider: { height: 1, backgroundColor: colors.borderSoft, marginLeft: 50 },
  });
}
