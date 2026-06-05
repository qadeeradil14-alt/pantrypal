/**
 * storeSearch.ts — provider abstraction for store-location lookup.
 *
 * Current provider: Geoapify (https://www.geoapify.com)
 * Requires: EXPO_PUBLIC_GEOAPIFY_API_KEY in .env
 *
 * To swap providers later, replace the Geoapify fetch calls inside
 * geocodeLocation() and searchStoreLocations() without touching any
 * call sites — the exported function signatures are the stable API.
 */

import { normalizeUSState } from './usStates';

const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? '';
const GEO_BASE = 'https://api.geoapify.com';
const HEADERS = { Accept: 'application/json' };

const SEARCH_RADII_M = [15_000, 25_000, 40_000, 60_000];
const MIN_USEFUL_RESULTS = 3;
export const MAX_STORE_SEARCH_DISTANCE_MILES = 40;

/** Category set covers supermarkets, grocers, convenience, warehouse, discount. */
const STORE_CATEGORIES = [
  'commercial.supermarket',
  'commercial.grocery',
  'commercial.food_and_drink',
  'commercial.convenience',
  'commercial.warehouse',
  'commercial.discount_store',
].join(',');

// ─── Public types ────────────────────────────────────────────────────────────

export interface GeoAnchor {
  lat: number;
  lon: number;
  /**
   * Canonical 2-letter USPS state code for the resolved search area (e.g. "VA").
   * Present when geocodeLocation successfully extracted a US state from the
   * provider response.  Used to reject wrong-state results in searchStoreLocations
   * and as a second-pass guard in handleSavePlace.
   */
  stateCode?: string | null;
}

/**
 * Structurally identical to StorePlace in lib/stores.ts.
 * Kept separate to avoid a circular import; TypeScript structural typing
 * makes the two interfaces interchangeable at all call sites.
 */
export interface StoreSearchResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

// ─── String helpers ───────────────────────────────────────────────────────────

/**
 * Normalize a store name for fuzzy comparison only (never shown to the user).
 * - lowercase
 * - remove apostrophes / backtick  (Sam's → sams)
 * - & → and
 * - hyphens → space               (7-Eleven → 7 eleven)
 * - strip remaining punctuation
 * - collapse whitespace
 */
export function normalizeStoreNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, 'and')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Common store-type suffixes that do NOT distinguish one brand from another.
 * Stripping them gives the "core" brand name for comparison.
 */
const STORE_SUFFIXES = new Set([
  'market', 'markets', 'marketplace', 'market place',
  'food', 'foods',
  'grocery', 'groceries',
  'supermarket', 'super market', 'supermarkets', 'super markets',
  'supercenter', 'super center',
  'store', 'stores',
  'wholesale', 'warehouse',
  'super', 'inc', 'llc', 'co',
]);

/** Strip trailing generic store-type words to get the core brand token. */
function coreStoreName(normalized: string): string {
  const words = normalized.split(' ');
  let end = words.length;
  while (end > 1 && STORE_SUFFIXES.has(words[end - 1])) end--;
  return words.slice(0, end).join(' ');
}

// ─── Named helpers (exported for testing) ────────────────────────────────────

/**
 * Return true when a provider result name is an acceptable match for the
 * user's query — robust against punctuation, case, suffix, and spacing
 * differences.
 *
 * Acceptance rules:
 *  • Normalized result contains normalized query (or vice-versa)
 *  • Core brand tokens match even when one side has extra suffixes
 *  • Minimum 3-character token length prevents single-character noise matches
 */
export function isAcceptableStoreMatch(queryName: string, resultName: string): boolean {
  if (!resultName || !queryName) return false;
  const qn = normalizeStoreNameForMatch(queryName);
  const rn = normalizeStoreNameForMatch(resultName);
  if (!qn || !rn) return false;

  // Direct normalized contains checks
  if (rn.includes(qn)) return true;
  if (qn.includes(rn)) return true;

  // Core-name checks (strip trailing suffixes from both sides)
  const qCore = coreStoreName(qn);
  const rCore = coreStoreName(rn);
  if (qCore.length >= 3 && rn.includes(qCore)) return true;
  if (rCore.length >= 3 && qn.includes(rCore)) return true;
  if (qCore.length >= 3 && rCore.length >= 3 && qCore === rCore) return true;

  return false;
}

/**
 * Score a result so that better name matches + closer stores rank first.
 * Higher = better.  Used for final sort before returning results to the UI.
 */
export function scoreStoreResult({
  queryName,
  resultName,
  distance,
}: {
  queryName: string;
  resultName: string;
  distance: number; // Manhattan degrees from anchor
}): number {
  const qn = normalizeStoreNameForMatch(queryName);
  const rn = normalizeStoreNameForMatch(resultName);
  const qCore = coreStoreName(qn);
  const rCore = coreStoreName(rn);

  let nameScore = 0;
  if (rn === qn) nameScore = 10;
  else if (qCore.length >= 3 && rCore.length >= 3 && qCore === rCore) nameScore = 9;
  else if (rn.includes(qn) || qn.includes(rn)) nameScore = 8;
  else if (qCore.length >= 3 && rn.includes(qCore)) nameScore = 6;
  else if (rCore.length >= 3 && qn.includes(rCore)) nameScore = 5;

  const distScore = distance < 5 ? 4 : distance < 20 ? 3 : distance < 35 ? 2 : 1;

  return nameScore + distScore;
}

/**
 * Supplement-only alias table for common brand-name variations.
 * Keys are normalized (via normalizeStoreNameForMatch).
 * This supplements the generic expansion logic — it is NOT the primary strategy.
 */
const BRAND_ALIASES: Record<string, string[]> = {
  'giant': ['Giant Food', 'Giant Food Stores'],
  'whole foods': ['Whole Foods Market'],
  'walmart': ['Walmart Supercenter', 'Walmart Neighborhood Market'],
  'costco': ['Costco Wholesale'],
  'sams club': ['Sam\'s Club'],
  'publix': ['Publix Super Markets'],
  '7 eleven': ['7-Eleven'],
  '7eleven': ['7-Eleven'],
  'heb': ['H-E-B'],
  'trader joes': ['Trader Joe\'s'],
};

/**
 * Generic suffix variants to append when the typed name has no store-type
 * suffix already.  Kept short — too many variants costs API credits.
 */
const GENERIC_SUFFIX_EXPANSIONS = ['Food', 'Market', 'Foods'];

/**
 * Build an ordered, deduplicated list of search query strings for a given
 * store name.  Includes:
 *  1. Original typed name (always first)
 *  2. Known-brand aliases (supplement)
 *  3. Generic suffix expansions when the name has no type suffix
 *
 * Maximum 4 queries to keep API usage reasonable on free tier.
 */
export function buildStoreSearchQueries(storeName: string): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  function add(q: string) {
    const key = q.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      queries.push(q.trim());
    }
  }

  const trimmed = storeName.trim();
  add(trimmed);

  const normalized = normalizeStoreNameForMatch(trimmed);

  // Brand alias supplement
  const aliases = BRAND_ALIASES[normalized] ?? [];
  aliases.forEach(add);

  // Generic suffix expansions — only when core name has no type suffix already
  const core = coreStoreName(normalized);
  if (core === normalized && aliases.length === 0) {
    for (const suffix of GENERIC_SUFFIX_EXPANSIONS) {
      add(`${trimmed} ${suffix}`);
    }
  }

  return queries.slice(0, 4); // hard cap at 4 queries
}

// ─── Distance helper ──────────────────────────────────────────────────────────

function distMiles(lat: number, lon: number, anchor: GeoAnchor): number {
  return haversineDistanceMiles(anchor.lat, anchor.lon, lat, lon);
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/** Two results are the same place if they round to the same 3-decimal lat/lon. */
function dedupeResults(results: StoreSearchResult[]): StoreSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const coordKey = `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`;
    const addressKey = `${normalizeStoreNameForMatch(r.name)}|${normalizeStoreNameForMatch(r.address)}`;
    if (seen.has(coordKey) || seen.has(addressKey)) return false;
    seen.add(coordKey);
    seen.add(addressKey);
    return true;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

// ─── Distance helpers ─────────────────────────────────────────────────────────

/**
 * True great-circle distance between two lat/lon pairs, in miles.
 * Uses the Haversine formula — accurate to within 0.5% for distances < 200 mi.
 * Use this for save-time validation; use distDeg() only for fast pre-screening.
 */
export function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3_958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve any freeform location text (zip code, city/state, full address)
 * to a lat/lon anchor — plus the US state code when available — using the
 * Geoapify Geocoding API.
 *
 * stateCode is the canonical 2-letter USPS code (e.g. "VA" for ZIP 22193).
 * It is used downstream to reject wrong-state store results.
 */
export async function geocodeLocation(text: string): Promise<GeoAnchor | null> {
  if (!GEOAPIFY_KEY || !text.trim()) return null;
  try {
    const url =
      `${GEO_BASE}/v1/geocode/search` +
      `?text=${encodeURIComponent(text.trim())}` +
      `&format=json&limit=1&countrycodes=us` +
      `&apiKey=${GEOAPIFY_KEY}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    if (typeof r?.lat !== 'number' || typeof r?.lon !== 'number') return null;

    // Capture state — Geoapify returns state_code (2-letter) and state (full name).
    // Normalize whichever is present; fall back to null if neither resolves.
    const rawCode = typeof r.state_code === 'string' ? r.state_code : null;
    const rawName = typeof r.state === 'string' ? r.state : null;
    const stateCode = normalizeUSState(rawCode) ?? normalizeUSState(rawName) ?? null;

    return { lat: r.lat, lon: r.lon, stateCode };
  } catch {
    return null;
  }
}

/**
 * Find store locations matching storeName near the given anchor.
 *
 * Three-tier strategy:
 *
 *  Tier 1 — Geoapify Places API, progressively expanded from 15 km to 60 km.
 *            Best for chains well-represented in OSM.
 *
 *  Tier 2 — Geoapify Geocoding API, run in parallel for each query string
 *            returned by buildStoreSearchQueries().  Catches stores that
 *            are in the geocoding index but not the places category index,
 *            and finds matches via alias/suffix expansion.
 *
 *  Both tiers:
 *    • apply isAcceptableStoreMatch() (handles punctuation/suffix differences)
 *    • apply MAX_STORE_SEARCH_DISTANCE_MILES hard reject
 *    • apply state-code filter when anchor.stateCode is present
 *    • rank results with scoreStoreResult()
 *    • deduplicate by rounded coordinate
 */
export async function searchStoreLocations({
  storeName,
  anchor,
}: {
  storeName: string;
  anchor: GeoAnchor;
}): Promise<StoreSearchResult[]> {
  if (!GEOAPIFY_KEY || !storeName.trim()) return [];

  const anchorState = anchor.stateCode ?? null;

  /**
   * Returns true if a result's state matches the anchor, or if we have no
   * anchor state to compare against (graceful: don't over-filter).
   * Accepts both 2-letter codes and full names from the provider.
   */
  function stateMatches(resultState: string | null | undefined): boolean {
    if (!anchorState) return true; // no anchor state → don't filter
    if (!resultState) return true; // no state in result → give benefit of the doubt
    const normalized = normalizeUSState(resultState);
    if (!normalized) return true; // unknown token → don't reject
    return normalized === anchorState;
  }

  const collected: StoreSearchResult[] = [];
  const withinSearchDistance = (lat: number, lon: number) =>
    distMiles(lat, lon, anchor) <= MAX_STORE_SEARCH_DISTANCE_MILES;

  for (const radius of SEARCH_RADII_M) {
    try {
      const url =
        `${GEO_BASE}/v2/places` +
        `?categories=${STORE_CATEGORIES}` +
        `&filter=circle:${anchor.lon},${anchor.lat},${radius}` +
        `&bias=proximity:${anchor.lon},${anchor.lat}` +
        `&conditions=named&limit=50` +
        `&apiKey=${GEOAPIFY_KEY}`;
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) {
        const data = await res.json();
        for (const f of (data.features ?? []) as any[]) {
          const pName: string = f.properties?.name ?? '';
          if (!isAcceptableStoreMatch(storeName, pName)) continue;
          const lat = f.geometry.coordinates[1] as number;
          const lon = f.geometry.coordinates[0] as number;
          if (!withinSearchDistance(lat, lon)) continue;
          const resultState: string | undefined = f.properties?.state_code ?? f.properties?.state;
          if (!stateMatches(resultState)) continue;
          collected.push({
            name: pName,
            address: (f.properties.formatted ?? f.properties.address_line1 ?? '') as string,
            latitude: lat,
            longitude: lon,
          });
        }
        if (rankAndSlice(collected, storeName, anchor).length >= MIN_USEFUL_RESULTS) break;
      }
    } catch { /* continue expansion */ }
  }

  // ── Tier 2: Geocoding API — parallel queries via buildStoreSearchQueries ──
  // Runs one Geocoding API call per query variant and merges results.
  // Always runs when Tier 1 is weak, so the UI waits for the full fallback.
  const queries = buildStoreSearchQueries(storeName);
  if (rankAndSlice(collected, storeName, anchor).length < MIN_USEFUL_RESULTS) {
    const maxRadius = SEARCH_RADII_M[SEARCH_RADII_M.length - 1];
    const tier2Results = await Promise.all(
      queries.map(async (q) => {
        try {
          const url =
            `${GEO_BASE}/v1/geocode/search` +
            `?text=${encodeURIComponent(q)}` +
            `&bias=proximity:${anchor.lon},${anchor.lat}` +
            `&filter=circle:${anchor.lon},${anchor.lat},${maxRadius}` +
            `&format=json&limit=10&countrycodes=us` +
            `&apiKey=${GEOAPIFY_KEY}`;
          const res = await fetch(url, { headers: HEADERS });
          if (!res.ok) return [];
          const data = await res.json();
          return ((data.results ?? []) as any[])
            .filter((r) => isAcceptableStoreMatch(storeName, r.name ?? ''))
            .filter((r) => withinSearchDistance(r.lat, r.lon))
            .filter((r) => stateMatches(r.state_code ?? r.state))
            .map((r) => ({
              name: (r.name ?? storeName.trim()) as string,
              address: (r.formatted ?? '') as string,
              latitude: r.lat as number,
              longitude: r.lon as number,
            }));
        } catch {
          return [];
        }
      }),
    );

    for (const batch of tier2Results) {
      collected.push(...batch);
    }
  }

  return rankAndSlice(collected, storeName, anchor);
}

/** Dedupe, score, sort descending, and return top 8. */
function rankAndSlice(
  results: StoreSearchResult[],
  queryName: string,
  anchor: GeoAnchor,
): StoreSearchResult[] {
  return dedupeResults(results)
    .map((r) => ({
      result: r,
      score: scoreStoreResult({
        queryName,
        resultName: r.name,
        distance: distMiles(r.latitude, r.longitude, anchor),
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ result }) => result);
}
