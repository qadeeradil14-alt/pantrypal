import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  remoteShoppingSessionAction,
  shouldPreserveCompletedTripSummary,
} from '../core/services/shoppingSessionSyncPolicy';

test('remote completed trip clears an active local shopping session', () => {
  assert.equal(remoteShoppingSessionAction(null), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'idle' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'trip_summary' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'shopping_store' }), 'apply');
});

test('a completed local summary survives null-session reconciliation until Done', () => {
  assert.equal(shouldPreserveCompletedTripSummary({ status: 'trip_summary' }), true);
  assert.equal(shouldPreserveCompletedTripSummary({ status: 'shopping_store' }), false);
  assert.equal(shouldPreserveCompletedTripSummary(null), false);
});

test('remote trip end cannot leave persisted state to resurrect after restart', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.doesNotMatch(source, /remoteEnded\s*&&\s*ACTIVE_STATUSES/);
  assert.match(source, /if \(shouldPreserveCompletedTripSummary\(previous\)\) return;/,
    'reconciliation must not reset the local final summary before Done');
  assert.match(source, /remoteShoppingSessionAction\(remoteSession\) === 'clear'/);
  assert.match(source, /set\(\{ session: initialSession \}\)/);
  assert.match(source, /AsyncStorage\.removeItem\(SESSION_KEY\)/);
});
