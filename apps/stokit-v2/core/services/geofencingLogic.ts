import type { PantryItem, Store } from '../../types';

export function geofenceableStores(
  stores: Store[],
  limit: number,
  items: PantryItem[] = [],
): Store[] {
  const qualifyingStoreIds = new Set(
    items
      .filter((item) => item.storeId && (item.status === 'low' || item.status === 'expiring'))
      .map((item) => item.storeId),
  );
  const withQualifyingItems: Store[] = [];
  const withoutQualifyingItems: Store[] = [];

  stores
    .filter((store) => store.lat != null && store.lng != null)
    .forEach((store) => {
      if (qualifyingStoreIds.has(store.id)) withQualifyingItems.push(store);
      else withoutQualifyingItems.push(store);
    });

  return [...withQualifyingItems, ...withoutQualifyingItems].slice(0, limit);
}

export function arrivalItemCount(items: PantryItem[], storeId: string): number {
  return items.filter(
    (item) =>
      item.storeId === storeId &&
      (item.status === 'low' || item.status === 'expiring'),
  ).length;
}

/** Straight-line distance between two GPS coordinates in metres. */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Whether `storeId` is the closest geofenceable store to (lat, lng).
 * If no stores have coordinates, there is nothing to compare against, so the
 * candidate is treated as confirmed (matches the prior fail-open behavior).
 */
export function isNearestStore(storeId: string, stores: Store[], lat: number, lng: number): boolean {
  const withCoords = stores.filter((s) => s.lat != null && s.lng != null);
  if (withCoords.length === 0) return true;
  const nearest = withCoords.reduce((best, s) => {
    const d = haversineMetres(lat, lng, s.lat!, s.lng!);
    const dBest = haversineMetres(lat, lng, best.lat!, best.lng!);
    return d < dBest ? s : best;
  });
  return nearest.id === storeId;
}
