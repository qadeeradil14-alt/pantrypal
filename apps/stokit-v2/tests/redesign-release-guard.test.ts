import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertRedesignReleaseConfig } from '../scripts/redesignReleaseGuard';

const validConfig = {
  name: 'Stokit Redesign',
  version: '1.0.0',
  ios: { bundleIdentifier: 'com.hewadadil.stokit.redesign' },
  runtimeVersion: { policy: 'appVersion' },
  updates: { requestHeaders: { 'expo-channel-name': 'shopping-redesign-test' } },
};

test('redesign release guard accepts the expected variant, identity, channel, and runtime', () => {
  assert.doesNotThrow(() => assertRedesignReleaseConfig('redesign', validConfig));
});

test('redesign release guard rejects a missing variant', () => {
  assert.throws(() => assertRedesignReleaseConfig(undefined, validConfig), /APP_VARIANT=redesign/);
});

test('redesign release guard rejects the base bundle identity', () => {
  assert.throws(
    () => assertRedesignReleaseConfig('redesign', { ...validConfig, ios: { bundleIdentifier: 'com.hewadadil.pantrypal' } }),
    /bundle ID/,
  );
});

test('redesign release guard rejects a non-test update channel', () => {
  assert.throws(
    () => assertRedesignReleaseConfig('redesign', { ...validConfig, updates: { requestHeaders: { 'expo-channel-name': 'production' } } }),
    /channel/,
  );
});

test('redesign release guard rejects a runtime other than 1.0.0', () => {
  assert.throws(
    () => assertRedesignReleaseConfig('redesign', { ...validConfig, runtimeVersion: '1.0.1' }),
    /runtime/,
  );
});
