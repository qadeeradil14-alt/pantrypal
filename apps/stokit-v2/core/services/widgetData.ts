import type { PantryItem } from '../../types';

export type LowStockWidgetData = {
  count: number;
  itemSummary: string;
  updatedAt: string;
};

export function buildLowStockWidgetData(
  items: PantryItem[],
  updatedAt = new Date().toISOString()
): LowStockWidgetData {
  const lowItems = items.filter((item) => item.status === 'low' || item.status === 'expiring');

  return {
    count: lowItems.length,
    itemSummary: lowItems.slice(0, 3).map((item) => item.name).join(', '),
    updatedAt,
  };
}
