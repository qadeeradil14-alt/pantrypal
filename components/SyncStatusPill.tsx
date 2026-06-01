import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPendingMutationCount, subscribeOfflineQueue } from '../lib/offlineQueue';
import { useTheme } from '../hooks/useTheme';
import { fonts, type AppColors } from '../constants/theme';

export default function SyncStatusPill() {
  const { colors } = useTheme();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    void getPendingMutationCount().then((count) => {
      if (mounted) setPending(count);
    });
    const unsub = subscribeOfflineQueue(() => {
      void getPendingMutationCount().then((count) => {
        if (mounted) setPending(count);
      });
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (pending === 0) return null;

  return (
    <View style={[styles.pill, styles.pillOffline]}>
      <View style={[styles.dot, styles.dotOffline]} />
      <Text style={[styles.text, styles.textOffline]}>
        {`Offline · ${pending} pending`}
      </Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    pillOffline: {
      backgroundColor: colors.warningSoft,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dotOffline: { backgroundColor: colors.warning },
    text: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      letterSpacing: 0.2,
    },
    textOffline: { color: colors.warning },
  });
}
