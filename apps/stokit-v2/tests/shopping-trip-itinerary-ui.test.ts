import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shoppingItineraryPreview } from '../core/services/shoppingItinerary';

test('remaining stops use a compact truncated itinerary preview', () => {
  assert.deepEqual(
    shoppingItineraryPreview(
      ['Apple', 'Banana', 'Milk', 'Bread', 'Eggs'],
      3,
    ),
    {
      visibleNames: ['Apple', 'Banana', 'Milk'],
      moreCount: 2,
      label: 'Apple • Banana • Milk • +2 more',
    },
  );
  assert.deepEqual(
    shoppingItineraryPreview(['Apple', 'Banana'], 3),
    {
      visibleNames: ['Apple', 'Banana'],
      moreCount: 0,
      label: 'Apple • Banana',
    },
  );
});

test('Shopping keeps only the active stop expanded and renders remaining stops without controls', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function TripStopsOverview');
  const overview = source.slice(
    start,
    source.indexOf('// ── 3. Post-store decision', start),
  );

  assert.match(overview, />UP NEXT</);
  assert.match(overview, /group\.classification === 'remaining'/);
  assert.match(overview, /shoppingItineraryPreview/);
  assert.doesNotMatch(overview, /ItemAvatar|PlanStoreHeader|planRow|rowDivider/);
  assert.doesNotMatch(
    overview,
    /Pressable|Button|Checkbox|UPDATE_QUANTITY|TOGGLE_PICK|recordPrice|ShoppingItemEditSheet/,
  );
});

test('End Trip is always available on the decision screen, never gated on remaining stops', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function PostStoreDecision');
  const decision = source.slice(
    start,
    source.indexOf('// ── Active trip shell', start),
  );

  // Previously End Trip only rendered once nothing remained, which is why a
  // shopper mid-route had no way out except walking the rest of the queue.
  // It is now an unconditional action on every post-store screen.
  assert.match(decision, /<Button label=\{copy\.endTripLabel\} onPress=\{endTrip\}/);
  assert.doesNotMatch(decision, /pending\.length === 0 \? \(\s*<Button\s+label=\{copy\./s);
  assert.doesNotMatch(decision, /label=\{hasOptions \? 'Finish trip' : 'Done'\}/);
});
