import type { Receipt } from '../../types';

export type ReceiptHistoryItem = { id: string; itemName: string; price: number };

export function storedReceiptItems(
  receipt: Pick<Receipt, 'id' | 'items'> | null | undefined,
): ReceiptHistoryItem[] {
  if (!receipt || !Array.isArray(receipt.items)) return [];
  return receipt.items.flatMap((item, index) => {
    const itemName = String(item?.name ?? '').trim();
    if (!itemName) return [];
    return [{
      id: `${receipt.id}:${index}`,
      itemName,
      price: typeof item.price === 'number' && item.price > 0 ? item.price : 0,
    }];
  });
}
