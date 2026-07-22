import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAuthCallbackPresentation,
  processAuthLink,
  withTimeout,
} from '../lib/auth-link-processing';

test('exchanges a PKCE callback code', async () => {
  const calls: string[] = [];
  const session = { user: { email_confirmed_at: '2026-06-22T00:00:00Z' } };
  const result = await processAuthLink('pantrypal://auth/callback?code=one-time-code', {
    exchangeCodeForSession: async (code) => {
      calls.push(code);
      return { data: { session }, error: null };
    },
    setSession: async () => ({ data: { session: null }, error: null }),
  });

  assert.deepEqual(calls, ['one-time-code']);
  assert.deepEqual(result, { status: 'success', session });
});

test('sets an implicit-flow session from callback tokens', async () => {
  const calls: Array<{ access_token: string; refresh_token: string }> = [];
  const session = { user: { email_confirmed_at: '2026-06-22T00:00:00Z' } };
  const result = await processAuthLink(
    'pantrypal://auth/callback#access_token=access&refresh_token=refresh',
    {
      exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
      setSession: async (tokens) => {
        calls.push(tokens);
        return { data: { session }, error: null };
      },
    },
  );

  assert.deepEqual(calls, [{ access_token: 'access', refresh_token: 'refresh' }]);
  assert.deepEqual(result, { status: 'success', session });
});

test('returns the provider error from a rejected callback', async () => {
  const result = await processAuthLink(
    'pantrypal://auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+expired',
    {
      exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
      setSession: async () => ({ data: { session: null }, error: null }),
    },
  );

  assert.deepEqual(result, {
    status: 'error',
    message: 'Email link is invalid or expired',
  });
});

test('ignores a callback without auth parameters', async () => {
  const result = await processAuthLink('pantrypal://auth/callback', {
    exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
    setSession: async () => ({ data: { session: null }, error: null }),
  });

  assert.deepEqual(result, { status: 'ignored' });
});

test('times out a callback that never completes', async () => {
  const result = await withTimeout(
    new Promise<never>(() => {}),
    5,
    { status: 'error', message: 'Confirmation timed out. Please sign in to continue.' } as const,
  );

  assert.deepEqual(result, {
    status: 'error',
    message: 'Confirmation timed out. Please sign in to continue.',
  });
});

test('shows an error message for callbacks without session parameters', () => {
  assert.deepEqual(getAuthCallbackPresentation({ status: 'ignored' }), {
    statusText: 'Email confirmation could not be completed.',
    signInMessage: 'The confirmation link was incomplete. Open the full link from your email or request a new one.',
  });
});

test('shows callback errors before forwarding them to sign-in', () => {
  assert.deepEqual(getAuthCallbackPresentation({ status: 'error', message: 'Email link expired.' }), {
    statusText: 'Email confirmation failed. Email link expired.',
    signInMessage: 'Email link expired.',
  });
});
