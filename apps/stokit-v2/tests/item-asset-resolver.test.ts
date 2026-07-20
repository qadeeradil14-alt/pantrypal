import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveItemAsset } from '../constants/itemAssetResolver';

test('items awaiting artwork use the neutral placeholder instead of category icons', () => {
  assert.deepEqual(resolveItemAsset('Chips'), { kind: 'placeholder', icon: 'package-variant-closed' });
  assert.deepEqual(resolveItemAsset('Vegetable oil'), { kind: 'placeholder', icon: 'bottle-tonic-outline' });
  assert.deepEqual(resolveItemAsset('Staples'), { kind: 'placeholder', icon: 'archive-outline' });
  assert.deepEqual(resolveItemAsset('Duct tape'), { kind: 'placeholder', icon: 'package-variant-closed' });
});

test('specific existing representations remain available', () => {
  assert.deepEqual(resolveItemAsset('Batteries'), { kind: 'emoji', value: '🔋' });
});
