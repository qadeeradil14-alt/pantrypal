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

/**
 * The user's persisted intent to receive arrival reminders, read from stored
 * geofence diagnostics.
 *
 * `storeArrivalPreferenceOn` was introduced in OTA 454. Installs that enabled
 * reminders before then only ever persisted `storeArrivalRemindersOn`, so a
 * strict read of the new field alone would report "off" for them and they would
 * never auto-heal from the OTA 454 teardown trap. The legacy field is therefore
 * accepted as equivalent consent.
 *
 * Turning the feature off writes false to BOTH fields (see stopGeofencing), so
 * an explicit opt-out is still honoured.
 *
 * Lives here rather than in geofencing.ts so it stays free of native imports
 * and is directly unit-testable.
 */
// ── Arrival confidence: bounded re-sampling ─────────────────────────────────
//
// A single GPS sample taken 10s after crossing a 100m boundary decided whether
// an arrival was real. Entering a car park at 35 km/h puts you ~95m along after
// those 10s — still rolling, still looking for a space — so the sample reads
// above the 5 m/s threshold and the arrival is discarded. iOS only fires ENTER
// on a boundary crossing, so parking and walking in produces no second event:
// one bad sample killed the notification permanently. Field evidence: a real
// device showed `rejected_speed` with `Last arrival: none yet`.
//
// Re-sampling keeps pass-by rejection intact — someone genuinely driving past
// leaves the radius and is rejected as `moved_away`, and never settles below
// the threshold — while giving a real arrival the chance to be confirmed once
// the car actually stops.

export interface ArrivalSample {
  /** Metres per second. Negative means iOS could not determine speed. */
  speedMps: number;
  /** Horizontal accuracy in metres. */
  accuracyM: number;
  /** Distance to the candidate store in metres. */
  distanceM: number;
}

export interface ArrivalSampleOptions {
  maxAccuracyM: number;
  speedThresholdMps: number;
  arrivalRadiusM: number;
  /** The original post-dwell sample, whose semantics must not change. */
  isFirstSample: boolean;
  /** True once the re-sampling time budget is spent — forces a terminal answer. */
  budgetExpired: boolean;
}

export type ArrivalSampleOutcome =
  | { decision: 'accept' }
  | { decision: 'retry'; reason: 'speed' | 'accuracy' }
  | { decision: 'reject'; reason: 'rejected_speed' | 'rejected_accuracy' | 'moved_away' };

/**
 * Verdict for one location sample during arrival confirmation.
 *
 * First-sample behaviour is unchanged except that "too fast" now asks for a
 * retry instead of ending the attempt. Unknown speed (negative) still passes,
 * matching the previous `speed >= 0 && speed > threshold` guard.
 */
export function evaluateArrivalSample(
  sample: ArrivalSample,
  options: ArrivalSampleOptions,
): ArrivalSampleOutcome {
  const { maxAccuracyM, speedThresholdMps, arrivalRadiusM, isFirstSample, budgetExpired } = options;

  // Leaving the radius is a drive-by. Terminal, and only meaningful once we are
  // re-sampling — the first sample's distance is already vetted by
  // decideStoreArrival.
  if (!isFirstSample && sample.distanceM > arrivalRadiusM) {
    return { decision: 'reject', reason: 'moved_away' };
  }

  if (sample.accuracyM > maxAccuracyM) {
    // An imprecise first fix still fails closed exactly as before. Mid-retry we
    // simply discard that sample rather than throwing the arrival away for a
    // transient loss of precision.
    if (isFirstSample || budgetExpired) {
      return { decision: 'reject', reason: 'rejected_accuracy' };
    }
    return { decision: 'retry', reason: 'accuracy' };
  }

  if (sample.speedMps >= 0 && sample.speedMps > speedThresholdMps) {
    if (budgetExpired) return { decision: 'reject', reason: 'rejected_speed' };
    return { decision: 'retry', reason: 'speed' };
  }

  return { decision: 'accept' };
}

/**
 * Sleep-time offsets (ms from ENTER) at which each confidence sample is taken.
 *
 * GPS-fix duration is NOT included — every fix pushes all later samples out by
 * its own duration, so these are the floor, not the actual times. Exists so the
 * real sampling window is asserted by tests rather than described in prose.
 *
 * maxAttempts counts RETRIES, so the result has maxAttempts + 1 entries: the
 * post-dwell sample plus one per retry.
 */
export function arrivalSampleOffsetsMs(limits: {
  dwellMs: number;
  retryIntervalMs: number;
  maxAttempts: number;
}): number[] {
  const offsets = [limits.dwellMs];
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt += 1) {
    offsets.push(limits.dwellMs + attempt * limits.retryIntervalMs);
  }
  return offsets;
}

/** Loop guard: another sample is only taken while the verdict is still 'retry'. */
export function shouldContinueArrivalSampling(
  outcome: ArrivalSampleOutcome,
  retryCount: number,
  maxAttempts: number,
): boolean {
  return outcome.decision === 'retry' && retryCount < maxAttempts;
}

/**
 * Recover real exit evidence that older builds recorded in the diagnostics blob.
 *
 * Versions before the exit gate wrote per-store `lastExitAt` into diagnostics but
 * never consulted it. Where that value survived it is genuine evidence the user
 * left, so seeding it is strictly better than grandfathering a possibly-spurious
 * arrival.
 *
 * It is NOT reliable on its own: buildRegisteredStoreDiagnostics rebuilds each
 * store with `previous = undefined`, so every successful registration reset
 * `lastExitAt` to null — and registration used to fire on every item/store
 * mutation. Hence this only fills gaps, and the one-time marker still backstops
 * the stores where the evidence was wiped.
 *
 * Existing entries always win: the dedicated key is authoritative once written.
 */
export function seedExitStateFromDiagnostics(
  persisted: Record<string, number>,
  storeDiagnostics: Array<{ id: string; lastExitAt: number | null }>,
): Record<string, number> {
  const seeded = { ...persisted };
  for (const store of storeDiagnostics) {
    if (seeded[store.id] === undefined && typeof store.lastExitAt === 'number' && store.lastExitAt > 0) {
      seeded[store.id] = store.lastExitAt;
    }
  }
  return seeded;
}

/**
 * Decide a newly-eligible store's initial arming state from the best available
 * location evidence.
 *
 * Fails safe by design: anything other than a confident "clearly outside"
 * reading defaults to `awaiting_outside`, which costs at most one missed first
 * notification (recovered the moment a real EXIT is observed) — never a false
 * "arrived" alert. `distanceMetres === null` covers both "no fix obtained" and
 * "the fix timed out", so a slow or failed location call degrades to the same
 * safe outcome rather than hanging the caller or guessing.
 */
export function resolveInitialArmingState(
  distanceMetres: number | null,
  radiusMetres: number,
): StoreArmingState {
  if (distanceMetres === null || !Number.isFinite(distanceMetres)) return 'awaiting_outside';
  return distanceMetres > radiusMetres ? 'armed' : 'awaiting_outside';
}

// ── Native re-registration control ──────────────────────────────────────────

/** The native-relevant shape of one monitored region. */
export interface RegionFingerprintInput {
  /** Optional to match expo-location's LocationRegion, which types it as optional. */
  identifier?: string;
  latitude: number;
  longitude: number;
  radius?: number;
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
}

/**
 * Stable fingerprint of the effective region set.
 *
 * startGeofencingAsync was previously called on EVERY item/store mutation (13
 * call sites), tearing down and re-registering identical regions. Re-registering
 * while the user is already inside a region can make iOS re-deliver ENTER, which
 * is the mechanism behind repeated arrival alerts at a store the user never left.
 *
 * Only fields iOS actually monitors are included — item names and counts change
 * constantly but do not affect the native region set, so they must not force a
 * re-registration. Sorted by identifier so ordering changes are not treated as
 * real changes.
 */
export function regionFingerprint(regions: RegionFingerprintInput[]): string {
  return regions
    .map((r) =>
      [
        r.identifier ?? '',
        r.latitude,
        r.longitude,
        r.radius ?? '',
        r.notifyOnEnter === false ? 0 : 1,
        r.notifyOnExit === false ? 0 : 1,
      ].join(':'),
    )
    .sort()
    .join('|');
}

/**
 * Coalesce concurrent calls onto one in-flight operation.
 *
 * Geofence refreshes fire from many independent mutation paths and could
 * previously overlap, interleaving stop/start cycles and leaving diagnostics
 * describing a registration that had already been superseded. Later callers
 * await the operation already running instead of starting a second one.
 *
 * The guard is cleared on both success and failure, so a rejected run never
 * wedges the queue.
 */
export function createSingleFlight<T>(): (operation: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return (operation) => {
    if (inFlight) return inFlight;
    const run = (async () => operation())().finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  };
}

export function storeArrivalPreferenceFromDiagnostics(diagnostics: {
  storeArrivalPreferenceOn?: boolean;
  storeArrivalRemindersOn?: boolean;
}): boolean {
  return Boolean(diagnostics.storeArrivalPreferenceOn || diagnostics.storeArrivalRemindersOn);
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
  | 'ambiguous_nearby_store'
  | 'no_exit_since_last_arrival'
  | 'not_armed_until_exit';

/** Per-store arming state — the premature-first-arrival guard. */
export type StoreArmingState = 'armed' | 'awaiting_outside';

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
  /**
   * storeId -> ms timestamp of the last recorded geofence EXIT.
   *
   * Optional so existing callers keep compiling; omitted means "no exit ever
   * recorded", which only gates stores that have already produced an arrival.
   */
  lastExitAt?: Record<string, number>;
  /**
   * storeId -> true once the exit gate has taken effect for that store.
   *
   * Upgrade path: installs from before the exit gate have a persisted
   * lastArrivalAt but no exit history, which would otherwise suppress one
   * genuine arrival after updating. A store with prior arrival state and no
   * marker is grandfathered for exactly one accepted arrival; the marker is
   * written on acceptance, so the gate applies to every arrival after it.
   */
  exitGateMigrated?: Record<string, boolean>;
  /**
   * storeId -> arming state. A store absent from this map has no recorded
   * state; a store armed at 100% of call sites is what protects a brand-new
   * store's first ENTER — otherwise lastArrivalAt === 0 skips the exit gate
   * entirely and a store the user was already standing inside notifies on the
   * very first evaluation. Field evidence: a 7-Eleven directly across the
   * street from the user's home notified the moment it was added, before any
   * drive happened.
   */
  armingState?: Record<string, StoreArmingState>;
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
  const { lat, lng, stores, items, radiusMetres, cooldownMs, lastArrivalAt, lastExitAt, exitGateMigrated, armingState, now = Date.now() } = input;

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

  // Arming gate — checked first because it protects a class of store the exit
  // gate cannot see. The exit gate only activates once lastArrival > 0, so a
  // store that has NEVER produced an arrival sails straight through it. If the
  // user was already standing inside that store's radius the moment it became
  // eligible (a store across the street from home, or newly assigned an item
  // while the user happened to be nearby), the very first evaluation notifies
  // with zero drive having happened. A store defaults to 'awaiting_outside'
  // until either an initial location check proves the user was clearly outside,
  // or a real EXIT event is observed — see resolveInitialArmingState and the
  // task's Exit branch in geofencing.ts.
  const arming = armingState?.[nearest.storeId];
  if (arming === 'awaiting_outside') {
    return {
      accepted: false,
      reason: 'not_armed_until_exit',
      storeId: nearest.storeId,
      storeName: nearest.storeName,
      distanceMetres: nearest.distanceMetres,
      nearbyCandidates: candidates,
      ambiguous: false,
    };
  }

  // Exit gate — the primary duplicate guard.
  //
  // A 3-minute cooldown alone let the SAME visit notify repeatedly: iOS can
  // re-deliver ENTER without the user ever leaving (notably when regions are
  // re-registered while already inside one), and nothing required an actual
  // departure in between. Field evidence: repeated "You arrived at..." alerts at
  // a store the user never left.
  //
  // A store that has never produced an arrival (lastArrival === 0) is not gated,
  // so a newly monitored store still notifies on its first ENTER.
  const lastArrival = lastArrivalAt[nearest.storeId] ?? 0;
  const lastExit = lastExitAt?.[nearest.storeId] ?? 0;
  if (lastArrival > 0 && lastExit <= lastArrival) {
    // Upgrade grandfather: a store carrying arrival state from before the exit
    // gate existed has no exit history to satisfy the gate with, so suppressing
    // here would swallow one legitimate arrival. Allow exactly one — the marker
    // is persisted on acceptance, so this branch cannot be taken twice. Stores
    // with no prior arrival never reach here, so new stores are unaffected.
    const gateActive = exitGateMigrated?.[nearest.storeId] === true;
    if (gateActive) {
      return {
        accepted: false,
        reason: 'no_exit_since_last_arrival',
        storeId: nearest.storeId,
        storeName: nearest.storeName,
        distanceMetres: nearest.distanceMetres,
        nearbyCandidates: candidates,
        ambiguous: false,
      };
    }
  }

  // Cooldown check — secondary safeguard against a genuine exit/re-entry that
  // bounces too quickly (parking-lot GPS jitter crossing the boundary).
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
