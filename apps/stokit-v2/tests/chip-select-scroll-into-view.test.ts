import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { chipScrollOffset } from '../core/services/chipScroll';

// Bug: selecting a store in the Add Items sheet's top bulk selector assigned
// that store to every selected item correctly, but each item's "Buy at store"
// row is a horizontally scrolling chip list pinned at offset 0. Any store past
// the first ~3 chips had its highlight rendered off-screen, so the row showed
// only unselected chips and read as "the bulk assignment didn't apply".
// Costco/Walmart/Safeway appeared to work purely because they fit on screen;
// Sam's Club, Kabul Halal Market and every later store appeared to fail.
// Fix: ChipSelect scrolls the selected chip into view when the value changes.
//
// Geometry below mirrors the reported device: a ~340pt-wide row where the
// first three store chips fill the visible width.
const VIEWPORT = 340;
const CHIPS = {
  costco: { x: 0, width: 150 },
  familyDollar: { x: 158, width: 130 },
  safeway: { x: 296, width: 100 },
  samsClub: { x: 404, width: 120 },
  kabulHalalMarket: { x: 532, width: 190 },
};

test('chips already fully visible do not scroll the row', () => {
  assert.equal(chipScrollOffset(CHIPS.costco, VIEWPORT, 0), null);
  assert.equal(chipScrollOffset(CHIPS.familyDollar, VIEWPORT, 0), null);
});

test('a store beyond the first three scrolls into view instead of staying hidden', () => {
  // Safeway straddles the right edge (296 + 100 > 340) — the last store that
  // looked like it "worked" was already partially clipped.
  const safeway = chipScrollOffset(CHIPS.safeway, VIEWPORT, 0);
  assert.ok(safeway !== null && safeway > 0, 'Safeway must scroll into full view');

  const sams = chipScrollOffset(CHIPS.samsClub, VIEWPORT, 0);
  assert.ok(sams !== null && sams > 0, "Sam's Club must scroll into view");

  const kabul = chipScrollOffset(CHIPS.kabulHalalMarket, VIEWPORT, 0);
  assert.ok(kabul !== null && kabul > 0, 'Kabul Halal Market must scroll into view');

  // Each resolved offset genuinely brings the chip fully inside the viewport.
  for (const [name, chip] of [['sams', CHIPS.samsClub], ['kabul', CHIPS.kabulHalalMarket]] as const) {
    const offset = chipScrollOffset(chip, VIEWPORT, 0)!;
    assert.ok(chip.x >= offset, `${name} left edge must be at/after the scroll offset`);
    assert.ok(chip.x + chip.width <= offset + VIEWPORT, `${name} right edge must be inside the viewport`);
  }
});

test('a user-created store at the end of the list scrolls into view', () => {
  // Newly added stores append to the end, the worst case for the old behavior.
  const custom = { x: 980, width: 210 };
  const offset = chipScrollOffset(custom, VIEWPORT, 0);
  assert.ok(offset !== null, 'a freshly created store must not stay off-screen');
  assert.ok(custom.x >= offset!);
  assert.ok(custom.x + custom.width <= offset! + VIEWPORT);
});

test('a chip left of the current scroll position scrolls back into view, clamped at zero', () => {
  const offset = chipScrollOffset(CHIPS.costco, VIEWPORT, 600);
  assert.equal(offset, 0, 'the first chip must clamp to the row start, never a negative offset');

  const familyDollar = chipScrollOffset(CHIPS.familyDollar, VIEWPORT, 600);
  assert.ok(familyDollar !== null && familyDollar >= 0);
  assert.ok(familyDollar! <= CHIPS.familyDollar.x, 'must scroll to at/before the chip so it is visible');
});

test('an unmeasured viewport is treated as "cannot scroll yet" rather than scrolling to 0', () => {
  assert.equal(chipScrollOffset(CHIPS.kabulHalalMarket, 0, 0), null);
});

test('ChipSelect wires the selected chip into view on value change', () => {
  const src = readFileSync(join(process.cwd(), 'components/shared/Field.tsx'), 'utf8');

  assert.match(src, /const scrollRef = useRef<ScrollView>\(null\);/, 'the row needs a ScrollView ref to scroll');
  assert.match(src, /chipLayouts\.current\[opt\.value\] = \{ x, width \};/, 'each chip must report its measured position');
  assert.match(
    src,
    /const offset = chipScrollOffset\(chip, viewportWidth\.current, scrollX\.current\);/,
    'the scroll target must come from the shared, tested offset helper',
  );
  assert.match(
    src,
    /scrollRef\.current\?\.scrollTo\(\{ x: offset, animated: true \}\);/,
    'the selected chip must actually be scrolled into view',
  );
  assert.match(src, /const \[layoutRevision, setLayoutRevision\] = useState\(0\);/, 'the effect must retry once native chip layout is available');
  assert.match(src, /setLayoutRevision\(\(revision\) => revision \+ 1\);/, 'a newly measured chip must trigger the retry');
  assert.match(src, /\}, \[value, layoutRevision\]\);/, 'the scroll must retry when the initial selected chip has just been measured');
});
