import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The quantity stepper's open/closed state (quantityStepperId) is local UI
// state, not derived from e.quantity — so it only closes where the code
// explicitly tells it to. The "-" button's auto-close check evaluated the
// quantity captured before its own decrement was applied, so decrementing
// from 2 -> 1 never closed it (the stale value 2 failed the <= 1 test).
// Verified as source-regex, matching this codebase's convention for RN
// component files that can't be imported into a plain node:test run.

const shopping = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');

test('the "-" button closes the stepper based on the post-decrement quantity, not the stale pre-decrement value', () => {
  assert.match(
    shopping,
    /dispatch\(\{ type: 'UPDATE_QUANTITY', entryId: e\.entryId, quantity: e\.quantity - 1 \}\); if \(e\.quantity - 1 <= 1\) setQuantityStepperId\(null\);/,
    'the close check must account for the decrement that was just dispatched (e.quantity - 1 <= 1), not the pre-decrement value (e.quantity <= 1) which stays open when going from 2 to 1',
  );
  assert.doesNotMatch(
    shopping,
    /quantity: e\.quantity - 1 \}\); if \(e\.quantity <= 1\)/,
    'the stale pre-decrement check must not be reintroduced',
  );
});

// Separately, the stepper also only closed on a tap inside the list card or
// on the row itself — any tap elsewhere on the same screen (Finish store,
// Add another item, Notify family, blank space) left it open indefinitely.

const shoppingActive = shopping.slice(
  shopping.indexOf('function ShoppingActive('),
  shopping.indexOf('function ReceiptPrompt('),
);

test('tapping anywhere on the active-trip screen closes an open quantity stepper', () => {
  assert.match(
    shoppingActive,
    /<Pressable onPress=\{\(\) => setQuantityStepperId\(null\)\}>\s*\n\s*<PageTitle/,
    'the whole screen must be wrapped in a dismiss-on-tap Pressable, not just the list card, so taps on Finish store / Add another item / Notify family / blank space also close the stepper',
  );
});
