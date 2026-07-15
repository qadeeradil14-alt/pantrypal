import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { formatInstalledUpdate } from '../constants/version';

test('formats the installed Expo update identity instead of a release sequence', () => {
  assert.equal(
    formatInstalledUpdate('019f65ca-0aca-7992-8b8b-bc39ee4c4b5e'),
    'Update 019f65ca',
  );
});

test('labels an embedded launch without inventing an OTA number', () => {
  assert.equal(formatInstalledUpdate(null), 'Embedded update');
});

test('About and Welcome display the current Expo update metadata', () => {
  const about = readFileSync(new URL('../app/settings/about.tsx', import.meta.url), 'utf8');
  const welcome = readFileSync(new URL('../app/(auth)/welcome.tsx', import.meta.url), 'utf8');

  for (const source of [about, welcome]) {
    assert.match(source, /Updates\.updateId/);
    assert.match(source, /formatInstalledUpdate/);
    assert.doesNotMatch(source, /OTA_SEQ/);
  }
});
