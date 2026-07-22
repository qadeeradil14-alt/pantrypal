import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isAccountDeletedError } from '../core/services/authResponses';

// auth-store.ts transitively imports react-native, which esbuild/tsx cannot
// transform outside the RN runtime — so, consistent with the other auth
// tests in this file, we assert against source text rather than importing
// the module directly.
const layoutSource = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const signInSource = readFileSync(new URL('../app/(auth)/sign-in.tsx', import.meta.url), 'utf8');
const authStoreSource = readFileSync(new URL('../store/auth-store.ts', import.meta.url), 'utf8');
const syncEngineSource = readFileSync(new URL('../core/services/syncEngine.ts', import.meta.url), 'utf8');

test('isEmailVerified reflects only the confirmed-at claim on the current user', () => {
  assert.match(
    authStoreSource,
    /export const isEmailVerified = \(user: User \| null\) => Boolean\(user\?\.email_confirmed_at\);/
  );
});

test('user returns from background: foreground listener re-checks auth state before anything else, and bails if the account is gone', () => {
  const start = layoutSource.indexOf('Re-attempt push token registration whenever the app returns to foreground');
  const end = layoutSource.indexOf('}, [user]);', start);
  assert.ok(start >= 0, 'foreground AppState listener comment must exist');
  assert.ok(end > start, 'effect must depend on [user]');

  const block = layoutSource.slice(start, end);
  const refreshIdx = block.indexOf('await useAuthStore.getState().refreshUser();');
  const bailIdx = block.indexOf('if (!useAuthStore.getState().user) return;');
  const householdRefreshIdx = block.indexOf('await useHouseholdStore.getState().refresh();');
  const pullIdx = block.indexOf('await pullFromSupabase();');

  assert.ok(refreshIdx >= 0, 'foreground handler must re-check auth state');
  assert.ok(bailIdx > refreshIdx, 'must bail out if refreshUser() found the account gone (force-signed-out)');
  assert.ok(householdRefreshIdx > bailIdx, 'household refresh must not run once the account-gone bail-out fires');
  assert.ok(pullIdx > bailIdx, 'sync pull must not run once the account-gone bail-out fires');

  // Unlike the sign-in-screen check, this runs for every signed-in user
  // (verified or not) on every foreground — it's how an already-verified,
  // already-logged-in device notices its account was deleted elsewhere.
  assert.doesNotMatch(block, /if \(!verified\)/);
});

test('sign-in screen regains focus: refreshes verification status when the cached user looks unverified', () => {
  assert.match(signInSource, /import \{ useFocusEffect, useLocalSearchParams, useRouter \} from 'expo-router';/);

  const focusStart = signInSource.indexOf('useFocusEffect(');
  const focusEnd = signInSource.indexOf('const submit = async', focusStart);
  assert.ok(focusStart >= 0 && focusEnd > focusStart, 'sign-in screen must register a focus effect before submit()');

  const focusBlock = signInSource.slice(focusStart, focusEnd);
  assert.match(focusBlock, /if \(user && !isEmailVerified\(user\)\) void refreshUser\(\);/);
  // Reads the store directly rather than subscribing, so this effect cannot
  // itself cause extra re-renders/loops on every store update.
  assert.match(focusBlock, /useAuthStore\.getState\(\)\.user/);
});

test('verified user signs in normally: a failed sign-in short-circuits before any refresh re-check', () => {
  const submitStart = signInSource.indexOf('const submit = async');
  const submitEnd = signInSource.indexOf('const sendReset = async', submitStart);
  const submitBlock = signInSource.slice(submitStart, submitEnd);

  const failReturnIdx = submitBlock.indexOf('if (!result.ok) {');
  const refreshCallIdx = submitBlock.indexOf('await refreshUser();');

  assert.ok(failReturnIdx >= 0 && refreshCallIdx >= 0, 'submit() must both check sign-in success and re-check verification');
  assert.ok(refreshCallIdx > failReturnIdx, 'refreshUser() must only run after a successful signIn(), never on bad credentials');
  assert.match(submitBlock.slice(failReturnIdx, refreshCallIdx), /return;/, 'the failure branch must return before reaching refreshUser()');
});

test('failed refresh does not crash or incorrectly sign out the user', () => {
  const start = authStoreSource.indexOf('refreshUser: async');
  const end = authStoreSource.indexOf('clearConfirmationSession: async', start);
  const block = authStoreSource.slice(start, end);

  const errorBranchStart = block.indexOf('if (error) {');
  const errorBranchEnd = block.indexOf('return { ok: false, message };', errorBranchStart);
  assert.ok(errorBranchStart >= 0 && errorBranchEnd > errorBranchStart, 'refreshUser must have an error branch that returns { ok: false }');
  const errorBranch = block.slice(errorBranchStart, errorBranchEnd + 'return { ok: false, message };'.length);

  // On failure, only `loading`/`authError` may be touched — the existing
  // signed-in user/session must be left completely alone.
  assert.doesNotMatch(errorBranch, /user:\s*null/);
  assert.doesNotMatch(errorBranch, /session:\s*null/);
  assert.match(errorBranch, /return \{ ok: false, message \};/);
});

test('isAccountDeletedError only matches a real GoTrue "user gone" response, not generic/network errors', () => {
  assert.equal(isAccountDeletedError(null), false);
  assert.equal(isAccountDeletedError(new Error('Network request failed')), false);
  assert.equal(isAccountDeletedError({ status: 500, message: 'Internal Server Error' }), false);
  assert.equal(isAccountDeletedError({ status: 403, message: 'User not found' }), true);
  assert.equal(isAccountDeletedError({ status: 404, message: 'user not found' }), true);
});

test('refreshUser() forces a full local sign-out when the account was deleted elsewhere, before falling back to the generic error path', () => {
  const start = authStoreSource.indexOf('refreshUser: async');
  const end = authStoreSource.indexOf('handleRemoteAccountDeletion: async', start);
  const block = authStoreSource.slice(start, end);

  const deletedCheckIdx = block.indexOf('if (isAccountDeletedError(error)) {');
  const handledCallIdx = block.indexOf('await get().handleRemoteAccountDeletion();');
  const genericErrorIdx = block.indexOf('const message = friendlyAuthError(error);');

  assert.ok(deletedCheckIdx >= 0, 'refreshUser must check isAccountDeletedError before the generic error path');
  assert.ok(handledCallIdx > deletedCheckIdx, 'must delegate cleanup to handleRemoteAccountDeletion()');
  assert.ok(genericErrorIdx > handledCallIdx, 'the account-deleted branch must be checked before the generic friendlyAuthError fallback');
});

test('handleRemoteAccountDeletion() wipes local state and clears the signed-in user, mirroring deleteAccount()', () => {
  const start = authStoreSource.indexOf('handleRemoteAccountDeletion: async');
  const end = authStoreSource.indexOf('clearConfirmationSession: async', start);
  const block = authStoreSource.slice(start, end);

  assert.match(block, /useDurableStore\.getState\(\)\.resetLocalOnly\(\)/);
  assert.match(block, /useHouseholdStore\.getState\(\)\.clearLocal\(\)/);
  assert.match(block, /useSessionStore\.getState\(\)\.clearSession\(\)/);
  assert.match(block, /stopSyncEngine\(\)/);
  assert.match(block, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(block, /user:\s*null/);
  assert.match(block, /session:\s*null/);
});

test('realtime snapshot DELETE events trigger an account-existence check instead of silently re-syncing', () => {
  const start = syncEngineSource.indexOf("'postgres_changes'");
  const end = syncEngineSource.indexOf('.subscribe(', start);
  const block = syncEngineSource.slice(start, end);

  const deleteCheckIdx = block.indexOf("payload.eventType === 'DELETE'");
  const refreshCallIdx = block.indexOf('useAuthStore.getState().refreshUser()');
  const scheduleIdx = block.indexOf('realtimePullScheduler.schedule();');

  assert.ok(deleteCheckIdx >= 0, 'must special-case DELETE events on the household snapshot channel');
  assert.ok(refreshCallIdx > deleteCheckIdx, 'DELETE events must trigger a live auth re-check');
  assert.ok(scheduleIdx > refreshCallIdx, 'the routine pull is still scheduled for all event types, DELETE included');
});
