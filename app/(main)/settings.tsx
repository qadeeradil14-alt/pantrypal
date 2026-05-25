import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/auth';
import { useHouseholdStore } from '../../store/household';
import { useItemsStore } from '../../store/items';
import { signOut } from '../../lib/auth';

export default function SettingsScreen() {
  const router = useRouter();
  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(main)/pantry');
  }

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
          setSigningOut(true);
          try {
            await signOut();
            clearHousehold();
            setItems([]);
          } catch (e: any) {
            Alert.alert('Sign out failed', e?.message ?? 'Please try again.');
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
      await Share.share({
        message: `Join my household on PantryPal! Use invite code: ${household.inviteCode}`,
      });
    } catch (e: any) {
      Alert.alert('Could not share', e?.message ?? 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Household</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Name</Text>
            <Text style={styles.rowValue}>{household?.name ?? '—'}</Text>
          </View>
          {household?.inviteCode ? (
            <View style={[styles.row, styles.rowBorderTop]}>
              <Text style={styles.rowLabel}>Invite code</Text>
              <Text style={styles.rowValue}>{household.inviteCode}</Text>
            </View>
          ) : null}
        </View>
        {household?.inviteCode ? (
          <TouchableOpacity style={styles.shareBtn} onPress={() => { void handleShare(); }}>
            <Text style={styles.shareBtnText}>Share invite code</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{session?.user.email ?? '—'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
          {signingOut
            ? <ActivityIndicator color="#DC2626" />
            : <Text style={styles.signOutText}>Sign out</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  back: { minWidth: 60 },
  backText: { color: '#2D9CDB', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  backSpacer: { minWidth: 60 },
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorderTop: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  rowLabel: { fontSize: 15, color: '#555' },
  rowValue: { fontSize: 15, color: '#1a1a1a', fontWeight: '500', maxWidth: '55%', textAlign: 'right' },
  shareBtn: {
    marginTop: 10, paddingVertical: 12, alignItems: 'center',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#2D9CDB',
  },
  shareBtnText: { color: '#2D9CDB', fontSize: 15, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 48, left: 20, right: 20 },
  signOutBtn: {
    backgroundColor: '#FEE2E2', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  signOutText: { color: '#DC2626', fontSize: 17, fontWeight: '600' },
});
