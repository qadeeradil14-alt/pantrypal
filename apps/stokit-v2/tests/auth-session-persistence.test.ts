import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const callbackSource = readFileSync(
  new URL('../app/auth/callback.tsx', import.meta.url),
  'utf8'
);
const layoutSource = readFileSync(
  new URL('../app/_layout.tsx', import.meta.url),
  'utf8'
);
const authStoreSource = readFileSync(
  new URL('../store/auth-store.ts', import.meta.url),
  'utf8'
);
const supabaseSource = readFileSync(
  new URL('../lib/supabase.ts', import.meta.url),
  'utf8'
);

test('verified login persists through auth store/app reinitialization', () => {
  assert.match(supabaseSource, /storage:\s*AsyncStorage/);
  assert.match(supabaseSource, /persistSession:\s*true/);
  assert.match(supabaseSource, /lock:\s*processLock/);

  const signInStart = authStoreSource.indexOf('signIn: async');
  const signInEnd = authStoreSource.indexOf('resetPassword: async', signInStart);
  const signInSource = authStoreSource.slice(signInStart, signInEnd);
  assert.ok(signInSource.indexOf('saveBackup(data.session)') >= 0);
  assert.ok(
    signInSource.indexOf('saveBackup(data.session)') <
      signInSource.indexOf('set({ session: data.session')
  );

  const initialSessionStart = authStoreSource.indexOf("event === 'INITIAL_SESSION'");
  const initialSessionEnd = authStoreSource.indexOf('// ── SIGNED_OUT', initialSessionStart);
  const initialSessionSource = authStoreSource.slice(initialSessionStart, initialSessionEnd);
  assert.match(initialSessionSource, /if \(session\)/);
  assert.match(initialSessionSource, /user:\s*session\.user/);
  assert.match(initialSessionSource, /initializing:\s*false/);
});

test('boot waits for INITIAL_SESSION', () => {
  assert.match(authStoreSource, /initializing:\s*true/);

  const readyStart = layoutSource.indexOf('const ready =');
  const readyEnd = layoutSource.indexOf(';', readyStart);
  assert.match(layoutSource.slice(readyStart, readyEnd), /!authInitializing/);
  assert.match(
    layoutSource,
    /if \(!ready \|\| !rootNavigationState\?\.key \|\| !initialUrlChecked\) return;/
  );
});

test('restored verified user routes to Tabs, never Welcome', () => {
  const routingStart = layoutSource.indexOf('const preserveStartupPath');
  const routingEnd = layoutSource.indexOf('if (__DEV__)', routingStart);
  const routingSource = layoutSource.slice(routingStart, routingEnd);
  const tabsRoute = routingSource.indexOf("router.replace('/(tabs)')");
  const welcomeRoute = routingSource.indexOf("router.replace('/(auth)/welcome')");

  assert.ok(tabsRoute >= 0);
  assert.ok(welcomeRoute > tabsRoute);
  assert.match(routingSource, /else if \(unlocked\)/);
});

test('verification cleanup cannot finish after a subsequent sign-in', () => {
  const cleanup = callbackSource.indexOf('await clearConfirmationSession();');
  const navigation = callbackSource.indexOf('router.replace({', cleanup);

  assert.ok(cleanup >= 0);
  assert.ok(navigation > cleanup);
  assert.doesNotMatch(callbackSource, /withTimeout\(clearConfirmationSession\(\)/);
});
