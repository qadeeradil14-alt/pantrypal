import type { ShoppingEvent } from '../shopping-machine';

export function receiptContinuationEvent(
  amount: number,
  imageUri: string | null,
  now: number,
): ShoppingEvent {
  if (amount <= 0) return { type: 'SKIP_RECEIPT', now };
  return { type: 'SAVE_RECEIPT', amount, status: 'logged', imageUri, now };
}

export function unplannedStores<T extends { id: string }>(stores: T[], storeQueue: string[]): T[] {
  const planned = new Set(storeQueue);
  return stores.filter((store) => !planned.has(store.id));
}

export type ReceiptReviewReason = 'code' | 'duplicate' | null;

export interface ReceiptReviewItem<T> {
  rowId: string;
  item: T;
  needsReview: boolean;
  reviewReason: ReceiptReviewReason;
  selected: boolean;
}

/** OCR line that reads like a SKU/UPC/PLU code or raw OCR noise rather than a clean product name. */
function looksLikeCode(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length <= 2) return true;
  if (/^\d+$/.test(trimmed)) return true;
  // The AI is asked to return human-readable cased names (e.g. "Bananas"), so an
  // all-caps result of any length — digits or not, spaces or not — is almost
  // always raw OCR leakage (a SKU, a short fragment like "BDS", or garbled
  // text like "LB BANNSANML" / "3PC SET" / "DR SMITHS").
  if (trimmed.length >= 3 && /[A-Z]/.test(trimmed) && !/[a-z]/.test(trimmed)) return true;
  return false;
}

/**
 * Flags OCR receipt items that need a second look (code-like names, repeats)
 * and defaults selection to clean items only — duplicates and code-like rows
 * start unchecked so a bad scan can't silently import junk into the pantry.
 */
export function reviewReceiptItems<T extends { name: string }>(items: T[]): ReceiptReviewItem<T>[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const key = item.name.trim().toLowerCase();
    const isDuplicate = seen.has(key);
    seen.add(key);
    const isCodeLike = !isDuplicate && looksLikeCode(item.name);
    const needsReview = isDuplicate || isCodeLike;
    return {
      rowId: `${index}-${key}`,
      item,
      needsReview,
      reviewReason: isDuplicate ? 'duplicate' : isCodeLike ? 'code' : null,
      selected: !needsReview,
    };
  });
}

/**
 * Apply a user rename to a reviewed receipt row. A renamed item is treated as
 * confirmed: it stops being flagged ("Unclear" goes away) and becomes selected
 * for import. An empty/whitespace name is ignored (row left untouched).
 */
export function renameReviewItem<T extends { name: string }>(
  row: ReceiptReviewItem<T>,
  newName: string,
): ReceiptReviewItem<T> {
  const name = newName.trim();
  if (!name) return row;
  return {
    rowId: row.rowId,
    item: { ...row.item, name },
    needsReview: false,
    reviewReason: null,
    selected: true,
  };
}
