import { useState } from 'react';
import {
  View, Text, StyleSheet,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useItemsStore } from '../../store/items';
import { signOut } from '../../lib/auth';
import { hapticError, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/haptics';
import { colors, radii, shadow } from '../../constants/theme';
import ScalePressable from '../../components/ScalePressable';

export default function SettingsScreen() {
  const { session } = useAuthStore();
  const { household, clearHousehold } = useHouseholdStore();
  const { setItems } = useItemsStore();
  const [signingOut, setSigningOut] = useState(false);

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
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroTitle}>{household?.name ?? 'Household'}</Text>
          <Text style={styles.heroLabel}>{session?.user.email ?? 'Signed in'}</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="settings-outline" size={24} color={colors.primary} />
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
              <Text style={styles.rowValue}>{household.inviteCode}</Text>
            </View>
          ) : null}
        </View>
        {household?.inviteCode ? (
          <ScalePressable
            style={styles.shareBtn}
            onPress={() => {
              void hapticSelection();
              void handleShare();
            }}
          >
            <Ionicons name="share-outline" size={18} color={colors.primary} />
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

      <View style={styles.footer}>
        <ScalePressable
          profile="danger"
          style={styles.signOutBtn}
          onPress={() => {
            void hapticSelection();
            handleSignOut();
          }}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator color={colors.danger} />
            : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.signOutText}>Sign out</Text>
              </>
            )
          }
        </ScalePressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  eyebrow: { fontSize: 12, color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  heroCard: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: radii.xl,
    backgroundColor: colors.surface, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.faint, ...shadow,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, maxWidth: 245, letterSpacing: -0.3 },
  heroLabel: { fontSize: 14, color: colors.muted, fontWeight: '700', marginTop: 4, maxWidth: 245 },
  heroIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft,
  },
  section: { marginTop: 16, paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.faint, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  rowBorderTop: { borderTopWidth: 1, borderTopColor: colors.faint },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 15, color: colors.muted, fontWeight: '700' },
  rowValue: { fontSize: 15, color: colors.ink, fontWeight: '700', maxWidth: '55%', textAlign: 'right' },
  shareBtn: {
    marginTop: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, borderRadius: radii.md, borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  shareBtnText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  footer: { position: 'absolute', bottom: 48, left: 20, right: 20 },
  signOutBtn: {
    flexDirection: 'row', gap: 8, justifyContent: 'center',
    backgroundColor: colors.dangerSoft, borderRadius: radii.md,
    paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F9D1D1',
  },
  signOutText: { color: colors.danger, fontSize: 17, fontWeight: '800' },
});
