import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../app/(tabs)/settings.tsx', import.meta.url), 'utf8');
const about = readFileSync(new URL('../app/settings/about.tsx', import.meta.url), 'utf8');
const subScreenHeader = readFileSync(new URL('../components/shared/SubScreenHeader.tsx', import.meta.url), 'utf8');

test('Home routes avatars to Household and gear to Settings', () => {
  assert.match(home, /<MemberAvatars members=\{members\} onPress=\{\(\) => router\.push\('\/household'\)\} \/>/);
  assert.match(home, /router\.push\('\/settings'\)/);
  assert.doesNotMatch(home, /OTA_SEQ|expo-updates|syncPill/);
});

test('Settings routes Household & roles to the canonical Household screen', () => {
  assert.match(settings, /label: 'Household & roles', route: '\/household'/);
});

test('subscreens go back when possible and fall back to Settings', () => {
  assert.match(subScreenHeader, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/settings'\)/);
});

test('version and installed update information live under About', () => {
  assert.match(about, /Updates\.updateId/);
  assert.match(about, /formatInstalledUpdate/);
  assert.match(about, /title="About"/);
});
