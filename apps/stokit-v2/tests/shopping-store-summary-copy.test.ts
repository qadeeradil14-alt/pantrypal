import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { storeCompletionCopy } from '../core/services/shoppingUx';

test('first stop of two shows Store 1 of 2', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  assert.equal(copy.progressLabel, 'Store 1 of 2');
  assert.equal(copy.heading, 'Costco complete');
});

test('first stop suggests the next store without committing to it', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  assert.equal(copy.suggestedNextLabel, 'Suggested: Safeway');
  assert.equal(copy.nextPromptLabel, 'Where are you shopping next?');
});

test('no copy field offers a forced continue-to-a-specific-store action', () => {
  const copy = storeCompletionCopy('Costco', 0, 2, 'Safeway');
  for (const value of Object.values(copy)) {
    assert.doesNotMatch(
      String(value ?? ''),
      /Continue to/,
      'the shopper chooses the next stop; no copy may present one as the action',
    );
  }
  assert.equal(copy.endTripLabel, 'End Trip');
});

test('final stop shows Store 2 of 2', () => {
  const copy = storeCompletionCopy('Safeway', 1, 2, null);
  assert.equal(copy.progressLabel, 'Store 2 of 2');
  assert.equal(copy.heading, 'Safeway complete');
});

test('final stop offers End Trip and suggests nothing', () => {
  const copy = storeCompletionCopy('Safeway', 1, 2, null);
  assert.equal(copy.endTripLabel, 'End Trip');
  assert.equal(copy.suggestedNextLabel, null);
  assert.equal(copy.nextPromptLabel, 'All planned stops are done.');
});

function postStoreDecisionSource(): string {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function PostStoreDecision');
  return source.slice(start, source.indexOf('// ── Active trip shell', start));
}

test('Reopen remains available on the decision screen, including after the final stop', () => {
  const decision = postStoreDecisionSource();

  // Unconditional — not gated on pending.length, so it is offered after every
  // completed store rather than only at the end of the trip.
  assert.match(decision, /label=\{`Reopen \$\{store\?\.name \?\? 'this store'\}`\}/);
  assert.match(decision, /type: 'REOPEN_STORE', stopId, now: Date\.now\(\)/);
});

test('the decision screen never auto-advances or forces a specific next store', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const decision = postStoreDecisionSource();

  // The shopper selects a stop explicitly; nothing dispatches on render.
  assert.match(decision, /type: 'CHOOSE_NEXT_STORE', storeId: stop\.storeId/);
  assert.match(decision, /type: 'FINISH_TRIP'/);
  assert.doesNotMatch(decision, /router\.(push|replace)|START_TRIP|ADVANCE_STORE/);

  // The auto-advance effect is gone: no effect may dispatch ADVANCE_STORE (or
  // CONTINUE_TRIP) off the back of a status change.
  assert.doesNotMatch(
    source,
    /session\.status === 'next_store_ready'[\s\S]{0,200}dispatch\(\{ type: 'ADVANCE_STORE' \}\)/,
  );
  assert.doesNotMatch(
    source,
    /session\.status === 'store_summary'[\s\S]{0,200}dispatch\(\{ type: 'CONTINUE_TRIP' \}\)/,
  );
});

test('the old two-screen split is gone', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /function StoreSummary\b/);
  assert.doesNotMatch(source, /function NextStoreSelector\b/);
  // All three post-store statuses render the one decision screen.
  assert.match(source, /PostStoreDecision \{\.\.\.props\} \/>/);
});
