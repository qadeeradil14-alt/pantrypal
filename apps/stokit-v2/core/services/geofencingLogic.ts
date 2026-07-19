import type { PantryItem, Store } from '../../types';

/**
 * True when an item belongs on the active shopping list for arrival reminders.
 * Geofencing must mirror Shopping: only low/expiring assigned items should
 * wake the user at a store. Stocked pantry items can keep store memory, but
 * they must not trigger arrival alerts.
 */
export function isActivePantryItem(item: PantryItem): boolean {
  return item.storeId != null && (item.status === 'low' || item.status === 'expiring');
}

export function geofenceableStores(
  stores: Store[],
  limit: number,
  items: PantryItem[] = [],
): Store[] {
  const activeStoreIds = new Set(
    items.filter(isActivePantryItem).map((item) => item.storeId),
  );
  return stores
    .filter((store) =>
      Number.isFinite(store.lat) &&
      Number.isFinite(store.lng) &&
      activeStoreIds.has(store.id)
    )
    .slice(0, limit);
}

export function arrivalItemCount(items: PantryItem[], storeId: string): number {
  return items.filter(
    (item) => item.storeId === storeId && isActivePantryItem(item),
  ).length;
}

/**
 * Names of the active (non-purchased) items assigned to a single store, in
 * pantry order. Uses the exact same predicate as arrivalItemCount so the names
 * shown in an arrival notification always match its count — and only ever
 * describe the ONE matched store, never an aggregate across stores.
 */
export function arrivalItemNames(items: PantryItem[], storeId: string): string[] {
  return items
    .filter((item) => item.storeId === storeId && isActivePantryItem(item))
    .map((item) => item.name);
}

/** Straight-line distance between two GPS coordinates in metres. */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

/**
 * Minimum distance advantage (metres) the closest eligible store must have
 * over the second-closest before we consider the match unambiguous.
 *
 * Rationale: Sam's Club and Walmart Supercenter can share a parking lot.
 * Their centroids are typically 100–300 m apart, but GPS accuracy under
 * canopy can be ±50 m. A 50 m margin prevents the wrong store winning when
 * both are inside the 200 m geofence radius and the GPS fix might snap to
 * the wrong centroid.
 *
 * If the gap between #1 and #2 is < AMBIGUITY_MARGIN_M the notification is
 * suppressed and `ambiguous: true` is returned instead.
 */
export const AMBIGUITY_MARGIN_M = 50;

export type ArrivalRejectionReason =
  | 'no_assigned_items'
  | 'out_of_radius'
  | 'cooldown'
  | 'ambiguous_nearby_store';

/** A single candidate store with its computed distance. */
export interface StoreCandidate {
  storeId: string;
  storeName: string;
  distanceMetres: number;
}

export interface ArrivalDecision {
  accepted: boolean;
  storeId?: string;
  storeName?: string;
  distanceMetres?: number;
  reason?: ArrivalRejectionReason;
  /**
   * All eligible assigned stores within radius, sorted by distance (nearest first).
   * Populated on every call regardless of accepted/rejected to enable diagnostics.
   */
  nearbyCandidates: StoreCandidate[];
  /**
   * True when two or more eligible stores are so close together that picking
   * one over the other is not reliable. Notification is suppressed.
   */
  ambiguous: boolean;
}

export interface ArrivalDecisionInput {
  lat: number;
  lng: number;
  stores: Store[];
  items: PantryItem[];
  radiusMetres: number;
  cooldownMs: number;
  /** storeId -> ms timestamp of the last accepted arrival. */
  lastArrivalAt: Record<string, number>;
  now?: number;
}

/**
 * Single source of truth for "should a store-arrival reminder fire right now?".
 * Shared by the native background geofence path and any foreground/app-resume
 * fallback, so both triggers agree on assignment, radius, and cooldown rules
 * instead of drifting apart with their own ad hoc checks.
 *
 * Ambiguity guard: if two or more eligible stores are within `radiusMetres`
 * AND the distance gap between the nearest and second-nearest is less than
 * AMBIGUITY_MARGIN_M, we return `accepted: false, reason: 'ambiguous_nearby_store'`
 * rather than risking a wrong store notification (the Sam's Club / Walmart bug).
 */
export function decideStoreArrival(input: ArrivalDecisionInput): ArrivalDecision {
  const { lat, lng, stores, items, radiusMetres, cooldownMs, lastArrivalAt, now = Date.now() } = input;

  const assignedStoreIds = new Set(
    items.filter(isActivePantryItem).map((item) => item.storeId as string),
  );

  // Build a sorted list of all eligible (assigned + coordinates) stores within radius.
  const candidates: StoreCandidate[] = stores
    .filter((s) => s.lat != null && s.lng != null && assignedStoreIds.has(s.id))
    .map((s) => ({
      storeId: s.id,
      storeName: s.name,
      distanceMetres: haversineMetres(lat, lng, s.lat!, s.lng!),
    }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres);

  // No eligible stores at all.
  if (candidates.length === 0) {
    return { accepted: false, reason: 'no_assigned_items', nearbyCandidates: [], ambiguous: false };
  }

  const nearest = candidates[0];

  // Nearest eligible store is outside the geofence radius.
  if (nearest.distanceMetres > radiusMetres) {
    return {
      accepted: false,
      reason: 'out_of_radius',
      storeId: nearest.storeId,
      storeName: nearest.storeName,
      distanceMetres: nearest.distanceMetres,
      nearbyCandidates: candidates,
      ambiguous: false,
    };
  }

  // Collect all candidates actually inside the radius (the ones that could plausibly
  // be the store the user has arrived at given GPS uncertainty).
  const withinRadius = candidates.filter((c) => c.distanceMetres <= radiusMetres);

  // Ambiguity check: if a second eligible store is also within radius AND its distance
  // advantage over the nearest is less than AMBIGUITY_MARGIN_M, we cannot reliably
  // tell which store the user arrived at. Suppress the notification.
  if (withinRadius.length >= 2) {
    const gap = withinRadius[1].distanceMetres - nearest.distanceMetres;
    if (gap < AMBIGUITY_MARGIN_M) {
      return {
        accepted: false,
        reason: 'ambiguous_nearby_store',
        storeId: nearest.storeId,
        storeName: nearest.storeName,
        distanceMetres: nearest.distanceMetres,
        nearbyCandidates: candidates,
        ambiguous: true,
      };
    }
  }

  // Cooldown check.
  const lastArrival = lastArrivalAt[nearest.storeId] ?? 0;
  if (now - lastArrival < cooldownMs) {
    return {
      accepted: false,
      reason: 'cooldown',
      storeId: nearest.storeId,
      storeName: nearest.storeName,
      distanceMetres: nearest.distanceMetres,
      nearbyCandidates: candidates,
      ambiguous: false,
    };
  }

  return {
    accepted: true,
    storeId: nearest.storeId,
    storeName: nearest.storeName,
    distanceMetres: nearest.distanceMetres,
    nearbyCandidates: candidates,
    ambiguous: false,
  };
}
