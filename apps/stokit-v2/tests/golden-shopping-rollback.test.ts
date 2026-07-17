import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('removed shopping entries are not resurrected by pantry-item auto-add reconciliation', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /const removedItemIds = new Set\(session\.removedItemIds\)/);
  assert.match(source, /!entryIds\.has\(item\.id\) &&\s*\n\s*!removedItemIds\.has\(item\.id\)/);
  assert.match(source, /\[items, storeId, session\.entries, session\.removedItemIds, dispatch\]/);
});

test('active shopping list swipe-to-delete dispatches REMOVE_ENTRY like Pantry swipe pattern', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /import Swipeable from 'react-native-gesture-handler\/Swipeable'/);
  assert.match(source, /onSwipeableWillOpen=\{\(\) => \{\s*\n\s*void Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\);\s*\n\s*dispatch\(\{ type: 'REMOVE_ENTRY', itemId: e\.itemId \}\);/);
});
