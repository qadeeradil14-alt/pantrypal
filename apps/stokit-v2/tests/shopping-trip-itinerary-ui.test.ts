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
    source.indexOf('// ── 3. Per-store summary', start),
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

test('End trip is rendered only when no planned stores remain', () => {
  const source = readFileSync(
    new URL('../app/(tabs)/shopping.tsx', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function StoreSummary');
  const summary = source.slice(
    start,
    source.indexOf('// ── 4.', start),
  );

  assert.match(
    summary,
    /pending\.length === 0 \? \(\s*<Button\s+label=\{copy\.primaryActionLabel\}/s,
  );
  assert.doesNotMatch(summary, /label=\{hasOptions \? 'Finish trip' : 'Done'\}/);
});
