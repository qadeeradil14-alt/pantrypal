import type { Store } from '../../types';

export type StoreDuplicateInput = Pick<Store, 'name' | 'placeId' | 'address' | 'lat' | 'lng'>;

export function normalizeStoreText(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function hasStoreCoords(value: Pick<StoreDuplicateInput, 'lat' | 'lng'>) {
  return typeof value.lat === 'number'
    && Number.isFinite(value.lat)
    && typeof value.lng === 'number'
    && Number.isFinite(value.lng);
}

function distanceMeters(a: StoreDuplicateInput, b: StoreDuplicateInput) {
  if (!hasStoreCoords(a) || !hasStoreCoords(b)) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const earthMeters = 6371000;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const lat1 = toRad(a.lat ?? 0);
  const lat2 = toRad(b.lat ?? 0);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function hasStoreIdentity(value: StoreDuplicateInput) {
  return Boolean(normalizeStoreText(value.placeId) || normalizeStoreText(value.address) || hasStoreCoords(value));
}

export function findDuplicateStore(stores: Store[], input: StoreDuplicateInput) {
  const inputName = normalizeStoreText(input.name);
  const inputPlaceId = normalizeStoreText(input.placeId);
  const inputAddress = normalizeStoreText(input.address);
  if (!inputName) return undefined;

  return stores.find((store) => {
    const storePlaceId = normalizeStoreText(store.placeId);
    if (inputPlaceId && storePlaceId && inputPlaceId === storePlaceId) return true;

    const storeName = normalizeStoreText(store.name);
    if (inputName !== storeName) return false;

    const storeAddress = normalizeStoreText(store.address);
    if (inputAddress && storeAddress && inputAddress === storeAddress) return true;
    if (hasStoreCoords(input) && hasStoreCoords(store) && distanceMeters(input, store) <= 75) return true;
    return !hasStoreIdentity(input) && !hasStoreIdentity(store);
  });
}
