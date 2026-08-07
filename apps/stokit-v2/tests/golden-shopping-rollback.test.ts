import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('removed shopping entries are not resurrected by pantry-item auto-add reconciliation', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /const isRemoved = session\.removedEntryIds\.includes\(item\.id\)/);
  assert.match(source, /\|\| session\.removedEntryIds\.includes\(entryId\)/);
  assert.match(source, /\[items, session\.entries, session\.removedEntryIds,/);
});

test('active shopper removes a trip entry while collaborators use durable tombstone deletion', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /import Swipeable from 'react-native-gesture-handler\/Swipeable'/);
  // A picked entry must be excluded — and the row closed rather than left
  // open — BEFORE the permission-gated delete dispatch below (see
  // tests/shopping-swipe-delete-picked-guard.test.ts for the dedicated
  // regression on that guard).
  assert.match(source, /onSwipeableWillOpen=\{\(\) => \{\s*\n\s*if \(!canEditActiveItems\) return;\s*\n\s*if \(e\.picked\) \{/);
  assert.match(source, /if \(!canEditActiveItems\) return;\s*\n\s*if \(e\.picked\) \{[\s\S]*?\n\s*void Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Medium\);\s*\n\s*dispatch\(\{ type: 'REMOVE_ENTRY', entryId: e\.entryId, now: Date\.now\(\) \}\);/);
});
