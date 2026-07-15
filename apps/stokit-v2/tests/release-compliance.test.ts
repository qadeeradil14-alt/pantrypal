import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');
const app = JSON.parse(readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo;

test('Build 108 permission prompts describe every production use', () => {
  assert.equal(app.ios.buildNumber, '108');
  assert.equal(
    app.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker')[1].cameraPermission,
    'Stokit uses your camera to scan receipts and take a profile photo you choose.',
  );
  assert.equal(
    app.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker')[1].photosPermission,
    'Stokit uses your photo library to attach receipt images and choose a profile photo.',
  );
  assert.equal(
    app.ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription,
    'Stokit uses background location to remind you when you arrive at a saved store with items on your list.',
  );
});

test('the app-level privacy manifest aggregates required-reason APIs', () => {
  const declared = Object.fromEntries(
    app.ios.privacyManifests.NSPrivacyAccessedAPITypes.map((entry: { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }) => [
      entry.NSPrivacyAccessedAPIType,
      entry.NSPrivacyAccessedAPITypeReasons,
    ]),
  );
  assert.deepEqual(declared.NSPrivacyAccessedAPICategoryDiskSpace, ['85F4.1', 'E174.1']);
  assert.deepEqual(declared.NSPrivacyAccessedAPICategoryFileTimestamp, ['0A2A.1', '3B52.1', 'C617.1']);
  assert.deepEqual(declared.NSPrivacyAccessedAPICategorySystemBootTime, ['35F9.1']);
  assert.deepEqual(declared.NSPrivacyAccessedAPICategoryUserDefaults, ['1C8F.1', 'CA92.1']);
  assert.equal(app.ios.privacyManifests.NSPrivacyTracking, false);
});

test('public support content documents account, receipt, location, and privacy choices', () => {
  const support = readFileSync(path.join(repoRoot, 'support-site/index.html'), 'utf8');
  const privacy = readFileSync(path.join(repoRoot, 'support-site/privacy/index.html'), 'utf8');
  assert.match(support, /href="\/privacy"/);
  assert.match(privacy, /id="choices"/);
  assert.match(privacy, /profile photo/i);
  assert.match(privacy, /receipt image/i);
  assert.match(privacy, /TheMealDB/);
  assert.match(privacy, /Delete Account/);
});

test('release documents keep App Review submission blocked', () => {
  const qa = readFileSync(path.join(repoRoot, 'docs/release/STOKIT_FINAL_MULTI_DAY_QA.md'), 'utf8');
  const gate = readFileSync(path.join(repoRoot, 'docs/release/STOKIT_APP_REVIEW_SUBMISSION_GATE.md'), 'utf8');
  assert.match(qa, /Day 1/);
  assert.match(qa, /Day 5/);
  assert.match(qa, /sync delay/i);
  assert.match(gate, /DO NOT SUBMIT TO APP REVIEW WITHOUT EXPLICIT OWNER APPROVAL/);
  assert.match(gate, /Build 108/);
});
