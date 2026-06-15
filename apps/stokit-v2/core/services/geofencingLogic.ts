import type { PantryItem, Store } from '../../types';

export function geofenceableStores(stores: Store[], limit: number): Store[] {
  return stores
    .filter((store) => store.lat != null && store.lng != null)
    .slice(0, limit);
}

export function arrivalItemCount(items: PantryItem[], storeId: string): number {
  return items.filter(
    (item) =>
      item.storeId === storeId &&
      (item.status === 'low' || item.status === 'expiring'),
  ).length;
}
