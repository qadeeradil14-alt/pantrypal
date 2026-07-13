import assert from 'node:assert/strict';
import test from 'node:test';
import { readFunctionError } from '../core/services/functionError';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const notificationsSource = readFileSync(
  new URL('../core/services/notifications.ts', import.meta.url),
  'utf8',
);

const shoppingSource = readFileSync(
  new URL('../app/(tabs)/shopping.tsx', import.meta.url),
  'utf8',
);

test('captures an Edge Function HTTP status and structured response body', async () => {
  const error = new FunctionsHttpError(new Response(JSON.stringify({
    error: 'expo_push_rejected',
    message: 'Expo rejected one or more push tickets',
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  }));

  const detail = await readFunctionError(error);

  assert.equal(detail.status, 502);
  assert.equal(detail.code, 'expo_push_rejected');
  assert.equal(detail.serverMessage, 'Expo rejected one or more push tickets');
  assert.match(detail.log, /HTTP 502/);
  assert.match(detail.log, /expo_push_rejected/);
});

test('captures a non-HTTP invocation error without throwing', async () => {
  const detail = await readFunctionError(new Error('network unavailable'));

  assert.equal(detail.status, null);
  assert.equal(detail.code, null);
  assert.equal(detail.serverMessage, null);
  assert.equal(detail.log, 'network unavailable');
});

test('Notify Family records the parsed server failure while keeping a safe UI message', () => {
  assert.match(notificationsSource, /readFunctionError\(error\)/);
  assert.match(notificationsSource, /appendNotificationLog\('household_alert_error'/);
  assert.match(shoppingSource, /Couldn't notify family\. Try again\./);
});
