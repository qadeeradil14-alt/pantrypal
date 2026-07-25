/**
 * Developer Diagnostics — console shell.
 *
 * READ-ONLY. Reads Zustand selectors and expo-constants, renders them, and
 * offers a plain-text export via the OS share sheet. It performs no writes,
 * no network requests, no sync triggers and registers no effects. Mount it
 * only after a successful unlock; unmounting it disposes everything.
 */
import React, { useMemo, useCallback } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { Sheet } from '../shared/Sheet';
import { Button } from '../shared/ui';
import { fonts, spacing, type AppColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { OTA_SEQ } from '../../constants/version';
import { useDurableStore } from '../../store/durable-store';
import { useSessionStore } from '../../store/session-store';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { collectGeneral, collectShopping, collectStores } from '../../core/services/diagnostics/collect';
import { formatDiagnosticsReport } from '../../core/services/diagnostics/report';

export function DeveloperConsole({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const stores = useDurableStore((s) => s.stores);
  const items = useDurableStore((s) => s.items);
  const session = useSessionStore((s) => s.session);
  const route = usePathname();

  const runtimeVersion = Constants.expoConfig?.runtimeVersion;

  const sections = useMemo(
    () => [
      collectGeneral({
        appVersion: Constants.expoConfig?.version ?? null,
        buildNumber:
          Constants.expoConfig?.ios?.buildNumber ??
          (Constants.expoConfig?.android?.versionCode != null
            ? String(Constants.expoConfig.android.versionCode)
            : null),
        otaSequence: OTA_SEQ,
        runtimeVersion: typeof runtimeVersion === 'string' ? runtimeVersion : null,
        channel: Constants.expoConfig?.updates?.requestHeaders?.['expo-channel-name'] ?? null,
        route,
        bundle: __DEV__ ? 'development' : 'release',
      }),
      collectStores(stores, items),
      collectShopping(session, items, stores),
    ],
    [stores, items, session, route, runtimeVersion],
  );

  const handleShare = useCallback(async () => {
    try {
      // Built on demand and handed straight to the OS share sheet — the
      // report is never written to disk or uploaded anywhere. This opens
      // the share sheet, which includes a Copy option among others; it does
      // not copy to the clipboard directly.
      await Share.share({ message: formatDiagnosticsReport(sections) });
    } catch {
      /* user dismissed the share sheet — non-fatal */
    }
  }, [sections]);

  return (
    <Sheet visible={visible} title="Developer Diagnostics" onClose={onClose} minHeight="80%">
      <Text style={styles.notice}>
        Read-only observer. No credentials are collected and nothing here can modify app data.
      </Text>
      <View style={styles.panel}>
        <DiagnosticsPanel sections={sections} initiallyExpanded={['general']} />
      </View>
      <Button label="Share diagnostics" variant="subtle" onPress={handleShare} style={styles.copy} />
    </Sheet>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    notice: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    panel: { marginBottom: spacing.md },
    copy: { marginTop: spacing.sm },
  });
}
