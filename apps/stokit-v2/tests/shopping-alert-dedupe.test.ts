import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resetShoppingAlertGuard,
  sendShoppingAlertOnce,
} from '../core/services/shoppingAlertOnce';

afterEach(() => resetShoppingAlertGuard());

test('repeated manual alerts for the same trip share one delivery', async () => {
  let deliveries = 0;
  const send = async () => {
    deliveries += 1;
    return { ok: true, sent: 1, result: 'sent' };
  };

  const firstManual = sendShoppingAlertOnce('trip-1', send, 1_000);
  const secondManual = sendShoppingAlertOnce('trip-1', send, 2_900);
  const [firstResult, secondResult] = await Promise.all([firstManual, secondManual]);

  assert.equal(deliveries, 1);
  assert.deepEqual(secondResult, firstResult);
});

test('manual alert remains available after the duplicate window', async () => {
  let deliveries = 0;
  const send = async () => {
    deliveries += 1;
    return { ok: true, sent: 1, result: 'sent' };
  };

  await sendShoppingAlertOnce('trip-1', send, 1_000);
  await sendShoppingAlertOnce('trip-1', send, 20_000);

  assert.equal(deliveries, 2);
});

test('failed manual alert can be retried immediately', async () => {
  let deliveries = 0;
  const send = async () => {
    deliveries += 1;
    return deliveries === 1
      ? { ok: false, sent: 0, result: 'failed' }
      : { ok: true, sent: 1, result: 'sent' };
  };

  await sendShoppingAlertOnce('trip-1', send, 1_000);
  const retry = await sendShoppingAlertOnce('trip-1', send, 1_100);

  assert.equal(deliveries, 2);
  assert.equal(retry.ok, true);
});

test('only the Notify Family button invokes the household alert transport', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.equal(source.match(/sendShoppingAlertOnce\(/g)?.length, 1);
  assert.doesNotMatch(source, /sendShoppingAlertOnce\(\s*tripId,/);
  assert.match(source, /sendShoppingAlertOnce\(\s*session\.tripId,/);
});
