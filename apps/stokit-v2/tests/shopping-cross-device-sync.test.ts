import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isCompletedShoppingSession,
  remoteShoppingSessionAction,
} from '../core/services/shoppingSessionSyncPolicy';

test('remote completed trip clears an active local shopping session', () => {
  assert.equal(remoteShoppingSessionAction(null), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'idle' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'trip_summary' }), 'clear');
  assert.equal(remoteShoppingSessionAction({ status: 'shopping_store' }), 'apply');
});

test('an active payload for an already-completed trip is rejected', () => {
  const staleSession = { status: 'shopping_store', tripId: 'trip-complete' };
  assert.equal(isCompletedShoppingSession(staleSession, [{ id: 'trip-complete' }]), true);
  assert.equal(isCompletedShoppingSession(staleSession, [{ id: 'different-trip' }]), false);
});

test('remote trip end cannot leave persisted state to resurrect after restart', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.doesNotMatch(source, /remoteEnded\s*&&\s*ACTIVE_STATUSES/);
  assert.match(source, /remoteShoppingSessionAction\(remoteSession\) === 'clear'/);
  assert.match(source, /set\(\{ session: initialSession \}\)/);
  assert.match(source, /AsyncStorage\.removeItem\(SESSION_KEY\)/);
});

test('stored and remote sessions are checked against completed trip history', () => {
  const source = readFileSync(join(process.cwd(), 'store/session-store.ts'), 'utf8');

  assert.match(source, /isCompletedShoppingSession\(saved, durable\.trips\)/);
  assert.match(source, /isCompletedShoppingSession\(remoteSession, durable\.trips\)/);
  assert.match(source, /await AsyncStorage\.removeItem\(SESSION_KEY\)/);
});
