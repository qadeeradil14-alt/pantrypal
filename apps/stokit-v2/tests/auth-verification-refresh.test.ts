import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// auth-store.ts transitively imports react-native, which esbuild/tsx cannot
// transform outside the RN runtime — so, consistent with the other auth
// tests in this file, we assert against source text rather than importing
// the module directly.
const layoutSource = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const signInSource = readFileSync(new URL('../app/(auth)/sign-in.tsx', import.meta.url), 'utf8');
const authStoreSource = readFileSync(new URL('../store/auth-store.ts', import.meta.url), 'utf8');

test('isEmailVerified reflects only the confirmed-at claim on the current user', () => {
  assert.match(
    authStoreSource,
    /export const isEmailVerified = \(user: User \| null\) => Boolean\(user\?\.email_confirmed_at\);/
  );
});

test('unverified user returns from background: foreground listener re-checks verification before anything else', () => {
  const start = layoutSource.indexOf('Re-attempt push token registration whenever the app returns to foreground');
  const end = layoutSource.indexOf('}, [user, verified]);', start);
  assert.ok(start >= 0, 'foreground AppState listener comment must exist');
  assert.ok(end > start, 'effect must depend on [user, verified]');

  const block = layoutSource.slice(start, end);
  const refreshIdx = block.indexOf('if (!verified) await useAuthStore.getState().refreshUser();');
  const householdRefreshIdx = block.indexOf('await useHouseholdStore.getState().refresh();');
  const pullIdx = block.indexOf('await pullFromSupabase();');

  assert.ok(refreshIdx >= 0, 'foreground handler must re-check verification');
  assert.ok(householdRefreshIdx > refreshIdx, 'verification re-check must run before household refresh');
  assert.ok(pullIdx > refreshIdx, 'verification re-check must run before the sync pull');

  // Already-verified users must not pay for a refreshUser() network call on
  // every foreground event — the call is gated on `!verified`.
  assert.match(block, /if \(!verified\) await useAuthStore\.getState\(\)\.refreshUser\(\);/);
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
