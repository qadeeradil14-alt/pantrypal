import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CURRENT_OTA_LABEL, formatInstalledUpdate } from '../constants/version';

test('keeps the production OTA label in one centralized version source', () => {
  assert.equal(CURRENT_OTA_LABEL, 'OTA 312');
});

test('uses the full installed Expo update identity only in developer details', () => {
  assert.equal(
    formatInstalledUpdate('019f65ca-0aca-7992-8b8b-bc39ee4c4b5e'),
    '019f65ca-0aca-7992-8b8b-bc39ee4c4b5e',
  );
});

test('labels an embedded launch without inventing an OTA number', () => {
  assert.equal(formatInstalledUpdate(null), 'Embedded update');
});

test('About keeps developer update metadata expandable and Welcome hides it', () => {
  const about = readFileSync(new URL('../app/settings/about.tsx', import.meta.url), 'utf8');
  const welcome = readFileSync(new URL('../app/(auth)/welcome.tsx', import.meta.url), 'utf8');

  assert.match(about, /CURRENT_OTA_LABEL/);
  assert.match(about, /Updates\.updateId/);
  assert.match(about, /Updates\.runtimeVersion/);
  assert.match(about, /Updates\.channel/);
  assert.match(about, /showUpdateDetails/);
  assert.match(about, /Constants\.nativeBuildVersion/);
  assert.doesNotMatch(welcome, /Updates\.updateId|formatInstalledUpdate|OTA_SEQ/);
});
