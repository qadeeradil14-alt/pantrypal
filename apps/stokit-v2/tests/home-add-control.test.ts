import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

test('Home removes the floating add FAB', () => {
  assert.doesNotMatch(home, /components\/shared\/Fab/);
  assert.doesNotMatch(home, /<Fab\b/);
});

test('Home embeds a compact direct-add button inside the search field', () => {
  assert.match(home, /accessibilityLabel="Add item"/);
  assert.match(home, /onPress=\{\(\) => setAddVisible\(true\)\}/);
  assert.match(home, /style=\{styles\.searchAddButton\}/);
  assert.match(home, /placeholder="Search or add anything…"/);
});
