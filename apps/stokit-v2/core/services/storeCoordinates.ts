export function hasValidStoreCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

export function storeBackfillQuery(store: { name: string; address?: string }): string {
  return [store.name.trim(), store.address?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(', ');
}
