import type { Store } from '../../types';

export type StoreDuplicateInput = Pick<Store, 'name' | 'placeId' | 'address' | 'lat' | 'lng'>;

export function normalizeStoreText(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

/**
 * Name/address comparison key. Adds punctuation-insensitivity on top of
 * normalizeStoreText, so "2904 Prince William Pkwy, Woodbridge, VA" and
 * "2904 Prince William Pkwy Woodbridge VA" — or "Sam's Club" and "Sams Club" —
 * are recognised as the same place. Providers and hand-entry disagree on commas,
 * periods and apostrophes constantly.
 *
 * Deliberately NOT used for placeId: provider ids are opaque and may rely on
 * punctuation to stay distinct, so those still compare with normalizeStoreText.
 */
export function normalizeStoreLabel(value?: string | null) {
  return normalizeStoreText(value)
    .replace(/[.,#'’`"\-/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Collapse stores that describe the same physical location down to one record
 * for display, and map every collapsed id onto the record that survives.
 *
 * addStore already refuses a duplicate, but that check only ever sees the
 * device's own list. Two household members (or one member on two devices, or
 * either while offline) can each add the same store, generating two different
 * `uid('store')` ids. mergeStores unions by id, so both survive the merge and
 * the Stores tab renders the same shop twice. This is the render-side guard
 * for records that already exist; nothing is deleted locally or remotely, so
 * every `storeId` reference from items, trips and receipts keeps resolving.
 *
 * The oldest record wins, so the surviving card is the one the household has
 * been assigning items to. Original list order is preserved.
 */
export function dedupeStoresForDisplay(stores: Store[]): {
  stores: Store[];
  canonicalIdFor: Map<string, string>;
} {
  const oldestFirst = [...stores].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id),
  );

  const canonical: Store[] = [];
  const canonicalIdFor = new Map<string, string>();

  for (const store of oldestFirst) {
    const existing = findDuplicateStore(canonical, store);
    if (existing) {
      canonicalIdFor.set(store.id, existing.id);
      continue;
    }
    canonical.push(store);
    canonicalIdFor.set(store.id, store.id);
  }

  const survivors = new Set(canonical.map((store) => store.id));
  return { stores: stores.filter((store) => survivors.has(store.id)), canonicalIdFor };
}

export function findDuplicateStore(stores: Store[], input: StoreDuplicateInput) {
  const inputName = normalizeStoreLabel(input.name);
  const inputPlaceId = normalizeStoreText(input.placeId);
  const inputAddress = normalizeStoreLabel(input.address);
  if (!inputName) return undefined;

  return stores.find((store) => {
    const storePlaceId = normalizeStoreText(store.placeId);
    if (inputPlaceId && storePlaceId && inputPlaceId === storePlaceId) return true;

    const storeName = normalizeStoreLabel(store.name);
    if (inputName !== storeName) return false;

    const storeAddress = normalizeStoreLabel(store.address);
    if (inputAddress && storeAddress && inputAddress === storeAddress) return true;
    if (hasStoreCoords(input) && hasStoreCoords(store) && distanceMeters(input, store) <= 75) return true;
    return !hasStoreIdentity(input) && !hasStoreIdentity(store);
  });
}
