import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { OTA_SEQ } from '../../constants/version';
import { supabase } from '../../lib/supabase';

const PENDING_CRASH_FILE = 'stokit-pending-crash.json';

type CrashContext = {
  screen: string;
  operation: string;
  householdId: string | null;
  syncState: Record<string, unknown>;
};

type ErrorUtilsApi = {
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let context: CrashContext = {
  screen: 'boot',
  operation: 'app.initialize',
  householdId: null,
  syncState: {},
};
let installed = false;

function pendingFile(): File {
  return new File(Paths.document, PENDING_CRASH_FILE);
}

function errorDetails(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  return { message: String(error), stack: null };
}

function crashPayload(error: unknown, fatal: boolean) {
  const details = errorDetails(error);
  return {
    occurredAt: new Date().toISOString(),
    fatal,
    message: details.message,
    stack: details.stack,
    screen: context.screen,
    operation: context.operation,
    householdId: context.householdId,
    syncState: context.syncState,
    otaVersion: OTA_SEQ,
    updateId: Updates.updateId ?? null,
    platform: Platform.OS,
  };
}

function persistFatal(error: unknown): void {
  try {
    const file = pendingFile();
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(crashPayload(error, true)));
  } catch (writeError) {
    console.error('[CrashReporter] Could not persist fatal context.', writeError);
  }
}

export function installFatalExceptionReporter(): void {
  if (installed) return;
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
  if (!errorUtils) return;
  installed = true;
  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal !== false) persistFatal(error);
    if (previousHandler) previousHandler(error, isFatal);
    else throw error;
  });
}

export function setCrashContext(patch: Partial<CrashContext>): void {
  context = { ...context, ...patch };
}

export async function runObservedOperation<T>(operation: string, task: () => Promise<T>): Promise<T | undefined> {
  setCrashContext({ operation });
  try {
    return await task();
  } catch (error) {
    const details = errorDetails(error);
    console.error(`[ObservedOperation] ${operation}: ${details.message}`, error);
    return undefined;
  }
}

export async function flushPendingCrashReport(): Promise<void> {
  const file = pendingFile();
  if (!file.exists) return;
  try {
    const report = JSON.parse(file.textSync()) as ReturnType<typeof crashPayload>;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) return;
    const { error } = await supabase.from('client_crash_reports').insert({
      user_id: session.user.id,
      household_id: report.householdId,
      occurred_at: report.occurredAt,
      fatal: report.fatal,
      message: report.message,
      stack: report.stack,
      screen: report.screen,
      operation: report.operation,
      sync_state: report.syncState,
      ota_version: report.otaVersion,
      update_id: report.updateId,
      platform: report.platform,
    });
    if (!error) file.delete();
  } catch (error) {
    console.error('[CrashReporter] Could not flush pending fatal context.', error);
  }
}
