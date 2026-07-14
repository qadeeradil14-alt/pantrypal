import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

test('Pantry search keeps text entry separate from the direct add control', () => {
  assert.match(home, /placeholder="Search or add anything…"/);
  assert.match(home, /onSubmitEditing=\{handleAddCustom\}/);
  assert.match(home, /accessibilityLabel="Add item"/);
  assert.match(home, /style=\{styles\.searchAddButton\}/);
  assert.doesNotMatch(home, /<Fab position="bottom"/);
  assert.doesNotMatch(home, /components\/shared\/Fab/);
});
