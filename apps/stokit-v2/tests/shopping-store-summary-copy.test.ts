import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { storeCompletionCopy } from '../core/services/shoppingUx';

test('first stop of two shows Store 1 of 2', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  assert.equal(copy.progressLabel, 'Store 1 of 2');
  assert.equal(copy.heading, 'Costco complete');
});

test('first stop names the next store', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  assert.equal(copy.nextStopLabel, 'Next stop: Safeway');
});

test('first stop action continues to the next store', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  assert.equal(copy.primaryActionLabel, 'Continue to Safeway');
});

test('final stop shows Store 2 of 2', () => {
  const copy = storeCompletionCopy('Safeway', 1, 2, null);
  assert.equal(copy.progressLabel, 'Store 2 of 2');
  assert.equal(copy.heading, 'Safeway complete');
});

test('final stop action is End Trip', () => {
  const copy = storeCompletionCopy('Safeway', 1, 2, null);
  assert.equal(copy.primaryActionLabel, 'End Trip');
  assert.equal(copy.nextStopLabel, null);
});

test('Reopen Store remains available after the final stop', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function StoreSummary');
  const summary = source.slice(start, source.indexOf('// ── 5.', start));

  assert.match(summary, /label="Reopen store"/);
  assert.match(summary, /type: 'REOPEN_STORE'/);
});

test('store-summary actions preserve the existing shopping transitions', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function StoreSummary');
  const summary = source.slice(start, source.indexOf('// ── 5.', start));

  assert.match(summary, /type: 'CONTINUE_TRIP'/);
  assert.match(summary, /type: 'FINISH_TRIP'/);
  assert.doesNotMatch(summary, /router\.(push|replace)|START_TRIP|ADVANCE_STORE/);
  assert.doesNotMatch(
    source,
    /session\.status === 'store_summary'[\s\S]{0,200}dispatch\(\{ type: 'CONTINUE_TRIP' \}\)/,
  );
  assert.match(
    source,
    /session\.status === 'next_store_ready'[\s\S]{0,200}dispatch\(\{ type: 'ADVANCE_STORE' \}\)/,
  );
});
