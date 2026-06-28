import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { receiptContinuationEvent, renameReviewItem, reviewReceiptItems, unplannedStores } from '../core/services/shoppingUx';

test('receipt scan continuation saves a positive total with its image', () => {
  assert.deepEqual(receiptContinuationEvent(25.85, 'file://receipt.jpg', 123), {
    type: 'SAVE_RECEIPT',
    amount: 25.85,
    status: 'logged',
    imageUri: 'file://receipt.jpg',
    now: 123,
  });
});

test('receipt scan continuation safely skips when no total was extracted', () => {
  assert.deepEqual(receiptContinuationEvent(0, 'file://receipt.jpg', 123), {
    type: 'SKIP_RECEIPT',
    now: 123,
  });
});

test('unplanned stores excludes every store already in the active trip', () => {
  const stores = [{ id: 'aldi' }, { id: 'lidl' }, { id: 'target' }];
  assert.deepEqual(unplannedStores(stores, ['aldi', 'target']), [{ id: 'lidl' }]);
});

test('shopping UI exposes receipt review and new-store actions', () => {
  const source = readFileSync(join(process.cwd(), 'app/(tabs)/shopping.tsx'), 'utf8');
  assert.match(source, /title="Receipt scanned"/);
  assert.match(source, /Unchecked items will be skipped\. Select only the items you recognize\./);
  // Suspicious rows are flagged "Unclear" (not "Needs review") with plain-English helper copy.
  assert.match(source, /label="Unclear"/);
  assert.doesNotMatch(source, /label="Needs review"/);
  assert.match(source, /Looks like receipt text\. Skipped unless selected\./);
  // Button copy counts confirmed items, not raw "selected".
  assert.match(source, /'Select items to add'\s*\n\s*: `Add \$\{selectedScanCount\} confirmed item/);
  // Inline edit affordance + rename handler wired up.
  assert.match(source, />Edit<\/Text>/);
  assert.match(source, /renameReviewItem\(r, editingScanText\)/);
  assert.match(source, /label="Skip for now"/);
  assert.match(source, /label="Add a new store"/);
  assert.match(source, /<AddStoreContent/);
});

test('batch assignment opens individual store assignment without stacked modals', () => {
  const indexSource = readFileSync(join(process.cwd(), 'app/(tabs)/index.tsx'), 'utf8');
  const assignSource = readFileSync(join(process.cwd(), 'components/pantry/IndividualAssignSheet.tsx'), 'utf8');

  assert.match(indexSource, /onItemsAdded=\{\(items\) => \{\s*setAddedBatch\(items\);\s*setShowIndividualAssign\(items\.length > 0\);/);
  assert.doesNotMatch(indexSource, /secondaryActionLabel="Assign to individual stores"/);
  assert.doesNotMatch(assignSource, /StorePickerSheet/);
  assert.match(assignSource, /label="Assign to individual stores"/);
  assert.match(assignSource, /const \[mode, setMode\] = useState<'bulk' \| 'individual' \| 'item'>\('bulk'\)/);
  assert.match(assignSource, /const assignAll = \(storeId: string\) => \{\s*liveBatch\.forEach\(\(item\) => updateItem\(item\.id, \{ storeId \}\)\);\s*setMode\('individual'\);/);
  assert.match(assignSource, /onPress=\{\(\) => \{\s*setPickingItem\(item\);\s*setMode\('item'\);/);
  assert.match(assignSource, /const assignOne = \(storeId: string \| null\) => \{/);
});

test('clean items are selected by default, code-like and duplicate items are not', () => {
  const result = reviewReceiptItems([
    { name: 'Bananas' },
    { name: 'SKU0091' },
    { name: 'Whole Milk' },
    { name: 'Whole Milk' },
    { name: '7' },
  ]);
  assert.deepEqual(result.map((r) => r.selected), [true, false, true, false, false]);
  assert.deepEqual(result.map((r) => r.reviewReason), [null, 'code', null, 'duplicate', 'code']);
});

test('reviewReceiptItems leaves an empty scan with no rows', () => {
  assert.deepEqual(reviewReceiptItems([]), []);
});

test('all-caps garbled OCR text needs review even without digits or a single token', () => {
  const [result] = reviewReceiptItems([{ name: 'LB BANNSANML' }]);
  assert.equal(result.needsReview, true);
  assert.equal(result.selected, false);
  assert.equal(result.reviewReason, 'code');
});

test('short all-caps fragments and OCR noise need review', () => {
  const result = reviewReceiptItems([
    { name: 'BDS' },
    { name: '3PC SET' },
    { name: '3PK BDS' },
    { name: 'DR SMITHS' },
  ]);
  assert.deepEqual(result.map((r) => r.needsReview), [true, true, true, true]);
  assert.deepEqual(result.map((r) => r.selected), [false, false, false, false]);
  assert.deepEqual(result.map((r) => r.reviewReason), ['code', 'code', 'code', 'code']);
});

test('clean cased item names stay selected', () => {
  const result = reviewReceiptItems([
    { name: 'Bananas' },
    { name: 'Whole Milk' },
    { name: 'Eggs' },
  ]);
  assert.deepEqual(result.map((r) => r.needsReview), [false, false, false]);
  assert.deepEqual(result.map((r) => r.selected), [true, true, true]);
});

test('suspicious OCR row starts unchecked and Unclear (reviewReason set)', () => {
  const [row] = reviewReceiptItems([{ name: 'SKU0091' }]);
  assert.equal(row.selected, false);
  assert.equal(row.needsReview, true);
  assert.equal(row.reviewReason, 'code');
});

test('editing a suspicious item makes it selected and clean', () => {
  const [row] = reviewReceiptItems([{ name: 'LB BANNSANML' }]);
  const edited = renameReviewItem(row, 'Bananas');
  assert.equal(edited.item.name, 'Bananas');
  assert.equal(edited.needsReview, false);
  assert.equal(edited.reviewReason, null);
  assert.equal(edited.selected, true);
});

test('rename trims whitespace and ignores an empty name', () => {
  const [row] = reviewReceiptItems([{ name: 'SKU0091' }]);
  assert.equal(renameReviewItem(row, '  Whole Milk  ').item.name, 'Whole Milk');
  const untouched = renameReviewItem(row, '   ');
  assert.equal(untouched.item.name, 'SKU0091');
  assert.equal(untouched.selected, false);
});

test('renamed items are preserved by selected-only import filtering', () => {
  const rows = reviewReceiptItems([
    { name: 'Bananas', price: 1.5 },
    { name: 'SKU0091', price: 9.99 },
    { name: '7', price: 2.0 },
  ]);
  // User confirms the first suspicious row by renaming it; leaves the noise row.
  rows[1] = renameReviewItem(rows[1], 'Whole Milk');
  const imported = rows.filter((r) => r.selected).map((r) => r.item.name);
  assert.deepEqual(imported, ['Bananas', 'Whole Milk']);
});

test('confirmed count rises only when a row is confirmed', () => {
  const rows = reviewReceiptItems([{ name: 'Bananas' }, { name: 'SKU0091' }]);
  assert.equal(rows.filter((r) => r.selected).length, 1);
  rows[1] = renameReviewItem(rows[1], 'Whole Milk');
  assert.equal(rows.filter((r) => r.selected).length, 2);
});
