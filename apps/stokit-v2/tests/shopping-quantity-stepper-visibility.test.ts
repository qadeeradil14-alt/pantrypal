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
    /dispatch\(\{ type: 'UPDATE_QUANTITY', itemId: e\.itemId, quantity: e\.quantity - 1 \}\); if \(e\.quantity - 1 <= 1\) setQuantityStepperId\(null\);/,
    'the close check must account for the decrement that was just dispatched (e.quantity - 1 <= 1), not the pre-decrement value (e.quantity <= 1) which stays open when going from 2 to 1',
  );
  assert.doesNotMatch(
    shopping,
    /quantity: e\.quantity - 1 \}\); if \(e\.quantity <= 1\)/,
    'the stale pre-decrement check must not be reintroduced',
  );
});
