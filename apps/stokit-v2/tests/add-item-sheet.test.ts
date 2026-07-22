import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const source = fs.readFileSync(path.join(__dirname, '../components/pantry/AddItemSheet.tsx'), 'utf-8');

test('quick add still shows selected items before submit', () => {
  assert.ok(source.includes('{selectedItems.length ? ('), 'selected items must render in quickAdd mode');
  assert.ok(!source.includes('{!quickAdd && selectedItems.length ? ('), 'quickAdd must not hide selected items');
});

test('search return key selects typed custom item', () => {
  assert.ok(source.includes('onSubmitEditing={addCustomItem}'), 'typed custom item must be selectable from keyboard submit');
  assert.ok(source.includes('returnKeyType="done"'), 'search input should expose a submit action');
});

test('active-trip add sheet always uses the current locked store', () => {
  assert.ok(
    source.includes('const activeStoreId = hideStorePicker ? defaultStoreId : bulkStoreId;'),
    'hidden store picker must make the current default store authoritative',
  );
  assert.ok(
    source.includes('const effectiveStoreId = hideStorePicker ? defaultStoreId : storeId ?? bulkStoreId;'),
    'committed items must not retain a stale store from an earlier stop',
  );
  assert.ok(
    source.includes('setBulkStoreId(defaultStoreId);') && source.includes('[defaultStoreId, visible]'),
    'opening the sheet must synchronize its internal store state',
  );
});
