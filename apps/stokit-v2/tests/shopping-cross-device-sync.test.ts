import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { remoteShoppingSessionAction } from '../core/services/shoppingSessionSyncPolicy';

test('remote completed trip clears an active local shopping session', () => {
  assert.equal(remoteShoppingSessionAction(null), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'idle' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'trip_summary' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'shopping_store' }), 'apply');
});

test('remote trip end cannot leave persisted state to resurrect after restart', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.doesNotMatch(source, /remoteEnded\s*&&\s*ACTIVE_STATUSES/);
  assert.match(source, /remoteShoppingSessionAction\(remoteSession\) === 'clear'/);
  assert.match(source, /set\(\{ session: initialSession \}\)/);
  assert.match(source, /AsyncStorage\.removeItem\(SESSION_KEY\)/);
});

test('shopping focus and Start Shopping preflight recover a missed remote trip promotion', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.match(source, /useFocusEffect/);
  assert.match(source, /pullFromSupabase\(\)/);
  assert.match(source, /await pullFromSupabase\(\)/);
  assert.match(source, /useSessionStore\.getState\(\)\.session\.status !== 'idle'/);
});
