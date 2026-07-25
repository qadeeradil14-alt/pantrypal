/**
 * Developer Diagnostics — shared authorization hook.
 *
 * Wraps canAccessDiagnostics() with the two runtime inputs every diagnostics
 * surface needs (the persisted developer flag, the signed-in user), so every
 * call site — Settings/About, AddItemSheet, and any future surface — makes
 * the exact same authorization decision. READ-ONLY: this hook only reads
 * AsyncStorage and the auth store; it never writes either.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../../store/auth-store';
import { config, hasDiagnosticsFlag } from '../../../lib/config';
import { canAccessDiagnostics, parseAllowlist } from './access';

const DEV_MODE_KEY = 'stokit:v2:developer_mode';

/** True only when the current user is fully authorized to see diagnostics UI. */
export function useDiagnosticsAuthorization(): boolean {
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(false);
  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    void AsyncStorage.getItem(DEV_MODE_KEY).then((v) => setDeveloperModeEnabled(v === 'true'));
  }, []);

  return canAccessDiagnostics({
    isDevBundle: __DEV__,
    flagEnabled: hasDiagnosticsFlag(),
    allowlist: parseAllowlist(config.diagnosticsAllowlist),
    signedInUserId: authUser?.id ?? null,
    signedInEmail: authUser?.email ?? null,
    developerModeEnabled,
  });
}
