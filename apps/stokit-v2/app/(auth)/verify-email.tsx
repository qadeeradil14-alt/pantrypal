import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../components/shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { isEmailVerified, useAuthStore } from '../../store/auth-store';

export default function VerifyEmailScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const resend = useAuthStore((s) => s.resendVerificationEmail);
  const signOut = useAuthStore((s) => s.signOut);
  const [message, setMessage] = useState('');
  // Prefer live user email; fall back to pendingEmail set during sign-up if
  // the user object is not yet available due to the onAuthStateChange race.
  const email = user?.email ?? pendingEmail ?? '';

  const checkVerification = async () => {
    const result = await refreshUser();
    const refreshed = useAuthStore.getState().user;
    if (result.ok && isEmailVerified(refreshed)) {
      router.replace('/(tabs)');
      return;
    }
    setMessage('Your email is not verified yet. Open the link we sent, then try again.');
  };

  const resendEmail = async () => {
    if (!email) {
      setMessage('Log in again to resend your verification email.');
      return;
    }
    const result = await resend(email);
    setMessage(result.ok ? 'Verification email sent.' : result.message);
  };

  const useDifferentEmail = async () => {
    await signOut();
    router.replace('/(auth)/sign-up');
  };

  return (
    <View style={styles.root}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="mail-unread-outline" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We sent a verification link to {email || 'your email'}. Please verify your email before using Stokit.
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Button label="I verified my email" onPress={() => void checkVerification()} />
        <Button label="Resend email" variant="subtle" onPress={() => void resendEmail()} />
        <Button label="Use a different email" variant="ghost" onPress={() => void useDifferentEmail()} />
      </Card>
    </View>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
    card: { alignItems: 'stretch', gap: spacing.md },
    icon: { alignSelf: 'center', width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
    title: { fontFamily: fonts.serifItalic, fontSize: 36, lineHeight: 42, color: colors.ink, textAlign: 'center' },
    body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginBottom: spacing.sm },
    message: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: colors.inkSoft, textAlign: 'center', backgroundColor: colors.primarySoft, padding: spacing.md },
  });
}
