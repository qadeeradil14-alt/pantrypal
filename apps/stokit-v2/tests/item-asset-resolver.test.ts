import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveItemAsset } from '../constants/itemAssetResolver';

test('items awaiting artwork use the neutral placeholder instead of category icons', () => {
  for (const name of ['Chips', 'Dates', 'Duct tape', 'Zip ties', 'Sandpaper', 'Caulk', 'Superglue', 'Staples', 'Tape']) {
    assert.deepEqual(resolveItemAsset(name), { kind: 'placeholder' });
  }
});

test('specific existing representations remain available', () => {
  assert.deepEqual(resolveItemAsset('Batteries'), { kind: 'emoji', value: '🔋' });
});
