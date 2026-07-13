import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { handleAuthLink } from '../../lib/auth-links';
import { getAuthCallbackPresentation } from '../../lib/auth-link-processing';
import { useAuthStore } from '../../store/auth-store';
import { spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useLinkingURL();
  const clearConfirmationSession = useAuthStore((state) => state.clearConfirmationSession);
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [message, setMessage] = useState('Confirming your email…');

  useEffect(() => {
    let active = true;

    void (async () => {
      const url = linkingUrl ?? Linking.getLinkingURL();
      const result = url ? await handleAuthLink(url) : { status: 'ignored' as const };
      const presentation = getAuthCallbackPresentation(result);

      if (!active) return;
      setMessage(presentation.statusText);
      await clearConfirmationSession();
      await new Promise((resolve) => setTimeout(resolve, 900));

      if (!active) return;
      router.replace({
        pathname: '/(auth)/sign-in',
        params: { message: presentation.signInMessage },
      });
    })().catch(() => {
      if (active) {
        router.replace({
          pathname: '/(auth)/sign-in',
          params: { message: 'Could not finish email confirmation. Please sign in or request a new email.' },
        });
      }
    });

    return () => {
      active = false;
    };
  }, [clearConfirmationSession, linkingUrl, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      backgroundColor: colors.background,
      padding: spacing.xl,
    },
    message: {
      color: colors.ink,
      fontSize: 16,
      textAlign: 'center',
    },
  });
}
