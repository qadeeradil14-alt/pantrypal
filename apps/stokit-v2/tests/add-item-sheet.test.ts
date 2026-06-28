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
