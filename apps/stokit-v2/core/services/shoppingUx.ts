import type { ReceiptLineItem } from '../../types';
import type { ShoppingEvent } from '../shopping-machine';

export function receiptContinuationEvent(
  amount: number,
  imageUri: string | null,
  now: number,
  items?: ReceiptLineItem[],
): ShoppingEvent {
  if (amount <= 0) return { type: 'SKIP_RECEIPT', now };
  return {
    type: 'SAVE_RECEIPT',
    amount,
    status: 'logged',
    imageUri,
    ...(items?.length ? { items } : {}),
    now,
  };
}

export function receiptLineItemsFromScan(
  items: Array<{ name?: unknown; quantity?: unknown; price?: unknown; unit_price?: unknown; total_price?: unknown }>,
): ReceiptLineItem[] {
  return items.flatMap((item) => {
    const name = String(item.name ?? '').trim();
    if (!name) return [];
    const rawPrice = item.price ?? item.unit_price ?? item.total_price;
    const price = typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0
      ? rawPrice
      : null;
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
      ? item.quantity
      : 1;
    return [{ name, quantity, price }];
  });
}

export function unplannedStores<T extends { id: string }>(stores: T[], storeQueue: string[]): T[] {
  const planned = new Set(storeQueue);
  return stores.filter((store) => !planned.has(store.id));
}

/**
 * Copy for the post-store decision screen.
 *
 * `suggestedNextStoreName` is advisory only — the next stop in queue order,
 * shown so the shopper has a default to reach for. It deliberately does NOT
 * become a primary action: the screen offers every remaining stop and the
 * shopper picks one, so the trip never advances to a store nobody chose.
 */
export function storeCompletionCopy(
  currentStoreName: string,
  currentIndex: number,
  totalStops: number,
  suggestedNextStoreName: string | null,
) {
  return {
    heading: `${currentStoreName} complete`,
    progressLabel: `Store ${currentIndex + 1} of ${totalStops}`,
    suggestedNextLabel: suggestedNextStoreName ? `Suggested: ${suggestedNextStoreName}` : null,
    nextPromptLabel: suggestedNextStoreName
      ? 'Where are you shopping next?'
      : 'All planned stops are done.',
    endTripLabel: 'End Trip',
  };
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
    const safeName = String(item?.name ?? '').trim();
    const key = safeName.toLowerCase();
    const isDuplicate = seen.has(key);
    seen.add(key);
    const isCodeLike = !isDuplicate && looksLikeCode(safeName);
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
