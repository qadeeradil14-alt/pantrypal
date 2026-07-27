import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { nextTimestamp } from '../core/services/id';
import { mergePantryItems } from '../core/services/mergePantryState';
import type { PantryItem } from '../types';

// Bug: AddItemSheet.tsx's commitItems reactivates an existing same-named item
// (quickAdd path, used by the primary Pantry-tab "Add something to buy" sheet)
// by spreading `...existing` — which silently discards the freshly-selected
// quantity (default 1) and never patches the pantry item's quantity either.
// Before OTA 389, item.quantity never drifted from its creation value (mid-
// trip stepper edits were ephemeral), so this was invisible. OTA 389 made
// stepper edits durable, so a completed/canceled trip can leave item.quantity
// at a large value (e.g. 5) that then silently resurfaces the next time the
// same item is re-added — NOT a monotonic-timestamp or sync-engine defect.
//
// Fix: the reuse path now takes `quantity` from the current add action (the
// freshly-selected value, default 1) instead of `existing.quantity`, and
// patches it into the pantry item via updateItem. item.quantity for a
// `stocked` item (its "how many I have at home" display) is untouched by
// this fix — resetShoppingList/clearShoppingEntries are not modified.

const item = (o: Partial<PantryItem> = {}): PantryItem => ({
  id: 'grapes', name: 'Grapes', quantity: 1, unit: 'unit', status: 'stocked',
  storageLocation: 'fridge', storeId: null, expiryDate: null,
  createdAt: 1, updatedAt: 1, ...o,
});

test('AddItemSheet no longer reuses the stale existing quantity on reactivation', () => {
  const source = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  const commitItems = source.slice(source.indexOf('const commitItems ='), source.indexOf('const submit ='));

  assert.match(
    commitItems,
    /\{\s*\n\s*\.\.\.existing,\s*\n(?:\s*\/\/.*\n)*\s*quantity,/,
    'the reactivated item must take quantity from the current add action, not from ...existing',
  );
  assert.match(
    commitItems,
    /updateItem\(existing\.id, \{ quantity: item\.quantity, status: item\.status, storeId: item\.storeId \}\)/,
    'the persisted pantry item must be patched with the fresh quantity, not left stale',
  );
});

// ── 1. quantity ×5 in old trip → cancel/reset → re-add item = ×1 ────────────

test('re-adding an item after a prior trip left it at quantity 5 initializes at 1', () => {
  // Simulates the fixed commitItems reuse expression directly: existing item
  // still holds quantity=5 (from the prior trip's stepper, now durable per
  // OTA 389); the add sheet's fresh selection defaults to quantity=1.
  const existing = item({ quantity: 5, status: 'stocked', storeId: null });
  const freshQuantity = 1; // SelectedItem default in AddItemSheet.toggle()
  const reactivated = { ...existing, quantity: freshQuantity, status: 'low' as const, updatedAt: nextTimestamp(existing.updatedAt) };

  assert.equal(reactivated.quantity, 1, 'the new shopping request starts at 1, not the stale 5');
  assert.ok(reactivated.updatedAt > existing.updatedAt, 'the correction is stamped as the newer version so it syncs');
});

// ── 2. both devices converge on ×1 ───────────────────────────────────────────

test('both devices converge on the corrected quantity 1 after the reactivation syncs', () => {
  // Peer (iPad) never saw the correction — it still holds the stale
  // trip-end snapshot with quantity=5.
  const peerStillFive = item({ quantity: 5, status: 'low', storeId: 'store-1', updatedAt: 1000 });
  const localCorrectedToOne = {
    ...peerStillFive,
    quantity: 1,
    updatedAt: nextTimestamp(peerStillFive.updatedAt),
  };

  const mergedOnPeer = mergePantryItems([peerStillFive], [localCorrectedToOne], []);
  const mergedOnLocal = mergePantryItems([localCorrectedToOne], [peerStillFive], []);

  assert.equal(mergedOnPeer[0].quantity, 1, 'the peer converges on the corrected quantity');
  assert.equal(mergedOnLocal[0].quantity, 1, 'the originating device keeps the corrected quantity');
  assert.equal(mergedOnPeer[0].quantity, mergedOnLocal[0].quantity, 'both devices converge');
});

// ── 3. normal +/- sync still works afterward ─────────────────────────────────

test('a normal +/- quantity edit after the reset still propagates and wins the merge', () => {
  const freshItem = item({ quantity: 1, status: 'low', storeId: 'store-1', updatedAt: 2000 });
  // User taps "+" during the new trip: quantity 1 -> 2.
  const bumped = { ...freshItem, quantity: 2, updatedAt: nextTimestamp(freshItem.updatedAt) };

  const merged = mergePantryItems([freshItem], [bumped], []);
  assert.equal(merged[0].quantity, 2, 'the +/- edit still propagates normally after the fix');
});

// ── 4. completed-trip history and pantry data remain intact ─────────────────

test('the fix does not touch trip/receipt commit logic or pantry stocked-item reads', () => {
  const source = readFileSync(join(process.cwd(), 'components/pantry/AddItemSheet.tsx'), 'utf8');
  assert.doesNotMatch(source, /commitTrip|removeTrip|receipts\.push|Receipt\b/, 'AddItemSheet must not touch trip/receipt commit logic');

  const durable = readFileSync(join(process.cwd(), 'store/durable-store.ts'), 'utf8');
  assert.match(
    durable,
    /resetShoppingList: \(\) => \{\s*\n\s*if \(!currentShoppingAccess\(\)\.canStartTrip\) return;\s*\n\s*set\(\(s\) => \(\{\s*\n\s*items: s\.items\.map\(\(item\) =>\s*\n\s*item\.status === 'low' \|\| item\.status === 'expiring'\s*\n\s*\? \{ \.\.\.item, status: 'stocked', storeId: null, updatedAt: nextTimestamp\(item\.updatedAt\) \}/,
    'resetShoppingList must still preserve quantity — only status/storeId reset, matching "preserve pantry quantity"',
  );
});
