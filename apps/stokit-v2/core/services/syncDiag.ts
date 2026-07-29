/**
 * TEMPORARY diagnostic instrumentation — OTA 389/390 directional-sync investigation.
 *
 * Purpose: prove/disprove per-item wall-clock skew as the cause of one-way
 * (iPad → iPhone) shopping sync failure, on the two physical devices.
 *
 * DIAGNOSTICS ONLY — no behavior change, no conflict-resolution change. Every
 * call site logs and returns; no merge decision, timestamp, or snapshot is
 * altered. Gated OFF in every release build, and optionally further restricted
 * in development to one QA household via
 * EXPO_PUBLIC_SYNC_DIAG_HOUSEHOLD.
 *
 * No sensitive data: only generated ids, numeric quantities, booleans, merge
 * decisions, and millisecond timestamps are captured — never names, emails,
 * tokens, or addresses.
 *
 * REMOVE AFTER CONFIRMATION: delete this file and every `syncDiag(` /
 * `setSyncDiagIdentity(` / `syncDiagEnabled(` / `dumpSyncDiag(` call site
 * (grep -rn "syncDiag\|SyncDiag" apps/stokit-v2).
 */
const ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

// Optional runtime household allowlist. Empty => no household restriction (every
// device on this OTA logs). Set to a household id (via the EAS production env at
// publish time — NOT hardcoded here) to restrict capture to the QA household.
const HOUSEHOLD_ALLOW = process.env.EXPO_PUBLIC_SYNC_DIAG_HOUSEHOLD || '';

const MAX_ENTRIES = 2000;
const DEVICE_ID_KEY = 'stokit:v2:diag-device-id';

const buffer: string[] = [];
const sessionStartAt = Date.now();
let totalEntries = 0; // ever appended (may exceed buffer.length once trimmed)

let deviceId = 'pending';
let role: string | null = null;
let householdId: string | null = null;

// Load/persist a stable per-install id using the project's existing OTA-safe
// storage (AsyncStorage). Dynamic-imported and gated on ENABLED so node tests
// (which import this module transitively) never touch the native module.
if (ENABLED) {
  void (async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = `di_${Math.random().toString(36).slice(2, 8)}`;
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      }
      deviceId = id;
    } catch {
      deviceId = `di_${Math.random().toString(36).slice(2, 8)}`;
    }
  })();
}

function householdAllowed(): boolean {
  return HOUSEHOLD_ALLOW === '' || householdId === HOUSEHOLD_ALLOW;
}

/** True when diagnostics should capture AND the hidden export may be exposed. */
export function syncDiagEnabled(): boolean {
  return ENABLED && householdAllowed();
}

/** Feed the current household id + role for attribution and household gating. */
export function setSyncDiagIdentity(next: { householdId?: string | null; role?: string | null }): void {
  if (next.householdId !== undefined) householdId = next.householdId;
  if (next.role !== undefined) role = next.role;
}

export function syncDiag(event: string, data: Record<string, unknown>): void {
  if (!syncDiagEnabled()) return;
  const line = JSON.stringify({ t: Date.now(), dev: deviceId, role, event, ...data });
  buffer.push(line);
  if (buffer.length > MAX_ENTRIES) buffer.shift(); // drop oldest, stay bounded
  totalEntries += 1;
  console.log(`[SyncDiag] ${line}`);
}

/** Full buffer as plain structured text, with a header for the QA session. */
export function dumpSyncDiag(otaSeq: number): string {
  const header = JSON.stringify({
    ota: otaSeq,
    deviceId,
    role,
    householdId,
    sessionStartAt,
    sessionStartIso: new Date(sessionStartAt).toISOString(),
    totalEntries,
    buffered: buffer.length,
    maxEntries: MAX_ENTRIES,
  });
  return `# SyncDiag export (temporary — OTA ${otaSeq})\n${header}\n${buffer.join('\n')}\n`;
}
