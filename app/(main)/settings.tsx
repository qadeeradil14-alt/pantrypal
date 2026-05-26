import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet,
  Alert, Share, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useItemsStore } from '../../store/items';
import { signOut } from '../../lib/auth';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/haptics';
import { useTheme } from '../../hooks/useTheme';
import type { AppColors } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { session } = useAuthStore();
  const { household, clearHousehold } = useHouseholdStore();
  const { setItems } = useItemsStore();
  const [signingOut, setSigningOut] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          void hapticWarning();
          setSigningOut(true);
          try {
            await signOut();
            clearHousehold();
            setItems([]);
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

  async function handleShare() {
    if (!household?.inviteCode) return;
    try {
      void hapticSelection();
      await Share.share({
        message: `Join my household on PantryPal! Use invite code: ${household.inviteCode}`,
      });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Please try again.');
      void hapticError();
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>{household?.name ?? 'Household'}</Text>
            <Text style={styles.heroLabel} numberOfLines={1}>{session?.user.email ?? 'Signed in'}</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="settings-outline" size={20} color={colors.primary} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLabelWrap}>
                <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Dark mode</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => { void hapticSelection(); toggleTheme(); }}
                trackColor={{ false: colors.faint, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Household</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLabelWrap}>
                <Ionicons name="home-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Name</Text>
              </View>
              <Text style={styles.rowValue}>{household?.name ?? '—'}</Text>
            </View>
            {household?.inviteCode ? (
              <View style={[styles.row, styles.rowBorderTop]}>
                <View style={styles.rowLabelWrap}>
                  <Ionicons name="key-outline" size={17} color={colors.muted} />
                  <Text style={styles.rowLabel}>Invite code</Text>
                </View>
                <Text style={styles.rowCode}>{household.inviteCode}</Text>
              </View>
            ) : null}
          </View>
          {household?.inviteCode ? (
            <ScalePressable
              style={styles.shareBtn}
              onPress={() => { void hapticSelection(); void handleShare(); }}
            >
              <Ionicons name="share-outline" size={17} color={colors.primary} />
              <Text style={styles.shareBtnText}>Share invite code</Text>
            </ScalePressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLabelWrap}>
                <Ionicons name="mail-outline" size={17} color={colors.muted} />
                <Text style={styles.rowLabel}>Email</Text>
              </View>
              <Text style={styles.rowValue} numberOfLines={1}>{session?.user.email ?? '—'}</Text>
            </View>
          </View>
        </View>

        <ScalePressable
          profile="danger"
          style={styles.signOutBtn}
          onPress={() => { void hapticSelection(); handleSignOut(); }}
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
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 40 },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
    eyebrow: { fontSize: 12, color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
    heroCard: {
      marginHorizontal: 16, marginBottom: 16, borderRadius: 20,
      backgroundColor: colors.surface, padding: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: colors.border,
    },
    heroLeft: { flex: 1, paddingRight: 12 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
    heroLabel: { fontSize: 15, color: colors.muted, fontWeight: '600', marginTop: 4 },
    heroIcon: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft,
    },
    section: { marginTop: 14, paddingHorizontal: 20 },
    sectionLabel: {
      fontSize: 11, fontWeight: '800', color: colors.muted,
      textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.surface, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 15, gap: 12,
    },
    rowBorderTop: { borderTopWidth: 1, borderTopColor: colors.border },
    rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { fontSize: 15, color: colors.muted, fontWeight: '700' },
    rowValue: { fontSize: 16, color: colors.ink, fontWeight: '700', maxWidth: '58%', textAlign: 'right' },
    rowCode: { fontSize: 16, color: colors.ink, fontWeight: '800', maxWidth: '58%', textAlign: 'right', letterSpacing: 0.4 },
    shareBtn: {
      marginTop: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    shareBtnText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
    signOutBtn: {
      marginHorizontal: 20, marginTop: 28,
      flexDirection: 'row', gap: 8, justifyContent: 'center',
      backgroundColor: colors.dangerSoft, borderRadius: 16,
      paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '33',
    },
    signOutText: { color: colors.danger, fontSize: 17, fontWeight: '800' },
  });
}
