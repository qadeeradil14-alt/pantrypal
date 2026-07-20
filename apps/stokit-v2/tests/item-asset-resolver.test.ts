import assert from 'node:assert/strict';
import test from 'node:test';

import { PANTRY_CATALOG } from '../constants/pantryCatalog';
import { resolveItemAsset } from '../constants/itemAssetResolver';

test('priority items use their matching custom asset', () => {
  const expectedAssets = {
    'Vegetable oil': 'custom:vegetable-oil',
    Chips: 'custom:chips',
    Dates: 'custom:dates',
    Funnels: 'custom:funnels',
    'Duct tape': 'custom:duct-tape',
    'Zip ties': 'custom:zip-ties',
    Sandpaper: 'custom:sandpaper',
    Caulk: 'custom:caulk',
    Superglue: 'custom:superglue',
    Staples: 'custom:staples',
    Tape: 'custom:tape',
  };

  for (const [name, icon] of Object.entries(expectedAssets)) {
    assert.equal(PANTRY_CATALOG.find((item) => item.name === name)?.icon, icon, name);
  }
});

test('specific existing representations remain available', () => {
  assert.deepEqual(resolveItemAsset('Batteries'), { kind: 'emoji', value: '🔋' });
});
