import type { PantryItem } from '../../types';

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function consolidatePantryItems(items: PantryItem[]): PantryItem[] {
  const byName = new Map<string, PantryItem>();
  const order: string[] = [];

  for (const item of items) {
    const key = normalizeItemName(item.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, item);
      order.push(key);
      continue;
    }

    const newer = item.updatedAt >= existing.updatedAt ? item : existing;
    const original = item.createdAt < existing.createdAt ? item : existing;
    byName.set(key, {
      ...newer,
      id: original.id,
      name: newer.name.trim(),
      storeId: newer.storeId ?? existing.storeId ?? item.storeId,
      expiryDate: newer.expiryDate ?? existing.expiryDate ?? item.expiryDate,
      createdAt: Math.min(existing.createdAt, item.createdAt),
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
    });
  }

  return order.map((key) => byName.get(key)!);
}
