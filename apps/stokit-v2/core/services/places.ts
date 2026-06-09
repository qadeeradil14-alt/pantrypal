/**
 * Store discovery service.
 *
 * PRIMARY (free, no key): OpenStreetMap Overpass API
 *   — No API key, no account, no rate-limit for reasonable use.
 *   — Data quality is excellent in US, Canada, UK, AU, EU.
 *   — https://overpass-api.de
 *
 * UPGRADE (when Google key is set): Google Places Nearby Search
 *   — Set EXPO_PUBLIC_GOOGLE_API_KEY in .env to activate automatically.
 *   — Richer metadata, better coverage in some regions.
 *
 * App Store path: add the Google key to EAS secrets → both stores and OCR
 * upgrade automatically with zero code changes.
 */

import { config, hasGoogleKey, hasGeoapifyKey } from '../../lib/config';

export interface NearbyStore {
  placeId: string;
  name: string;
  address: string;
  distanceMetres: number;
  lat: number;
  lng: number;
  types: string[];
  rating?: number;
  isOpen?: boolean;
}

export interface AutocompleteSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function findNearbyStores(
  lat: number,
  lng: number,
  radiusMetres = 8000,
): Promise<NearbyStore[]> {
  console.log('[Places] findNearbyStores called', { lat, lng, radiusMetres });
  if (hasGoogleKey()) {
    return findNearbyStoresGoogle(lat, lng, radiusMetres);
  }
  if (hasGeoapifyKey()) {
    console.log('[Places] Using Geoapify');
    const results = await findNearbyStoresGeoapify(lat, lng, radiusMetres);
    if (results.length > 0) return results;
    console.log('[Places] Geoapify returned 0 results, falling back to OSM');
  }
  console.log('[Places] Using OSM fallback');
  return findNearbyStoresOSM(lat, lng, radiusMetres);
}

/**
 * Search for stores matching a name near a GPS coordinate.
 * Used when the user types e.g. "Target" in the store name field.
 */
export async function searchNearbyStoresByName(
  lat: number,
  lng: number,
  name: string,
  radiusMetres = 20000,
): Promise<NearbyStore[]> {
  console.log('[Places] searchNearbyStoresByName called', { lat, lng, name, radiusMetres });
  if (!name.trim()) return [];
  if (hasGoogleKey()) return searchByNameGoogle(lat, lng, name, radiusMetres);
  if (hasGeoapifyKey()) {
    console.log('[Places] Using Geoapify search');
    const results = await searchByNameGeoapify(lat, lng, name, radiusMetres);
    if (results.length > 0) return results;
    console.log('[Places] Geoapify returned 0 results, falling back to OSM');
  }
  console.log('[Places] Using OSM fallback search');
  return searchByNameOSM(lat, lng, name, radiusMetres);
}

/**
 * Geocode a free-text location (city, ZIP, address) to lat/lng using Nominatim.
 * Free, no key, part of OpenStreetMap.
 */
export async function geocodeLocation(
  query: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  if (!query.trim()) return null;

  // 1. Try Geoapify if key is present
  if (hasGeoapifyKey()) {
    try {
      const url =
        `https://api.geoapify.com/v1/geocode/search` +
        `?text=${encodeURIComponent(query.trim())}` +
        `&format=json&limit=1&countrycodes=us` +
        `&apiKey=${config.geoapifyApiKey}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const r = data.results[0];
          return {
            lat: r.lat,
            lng: r.lon,
            displayName: [r.city || r.county, r.state_code || r.state]
              .filter(Boolean)
              .join(', '),
          };
        }
      }
    } catch {
      // Fallback to OSM
    }
  }

  // 2. Fallback to OSM Nominatim
  try {
    const params = new URLSearchParams({
      q: query.trim(),
      format: 'json',
      limit: '1',
      countrycodes: 'us', // Fix: Restrict to US to prevent 22193 resolving to Spain!
    });
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Stokit/2.0' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name.split(',').slice(0, 2).join(','),
    };
  } catch {
    return null;
  }
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export function formatDistance(metres: number): string {
  const miles = metres / 1609.344;
  if (miles < 0.1) return `${Math.round(metres)} m`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Fetch with Timeout Helper ────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      fetch(url, { ...options, signal: controller.signal as any }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─── OpenStreetMap / Overpass (FREE, no key) ──────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Shop types that map to "a store you buy groceries/household items at"
const OSM_SHOP_TYPES = [
  'supermarket',
  'convenience',
  'grocery',
  'department_store',
  'wholesale',
  'butcher',
  'bakery',
  'deli',
  'health_food',
  'organic',
  'chemist',
  'drug_store',
  'pharmacy',
].join('|');

/** Nearby stores of any shop type. */
function overpassQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:20];
(
  node["shop"~"${OSM_SHOP_TYPES}"](around:${radius},${lat},${lng});
  way["shop"~"${OSM_SHOP_TYPES}"](around:${radius},${lat},${lng});
);
out center 40;`;
}

/** Stores matching a name anywhere within a wider radius. */
function overpassNameQuery(lat: number, lng: number, name: string, radius: number): string {
  // Case-insensitive regex match on the name tag, broad shop filter
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `[out:json][timeout:20];
(
  node["name"~"${escaped}",i]["shop"](around:${radius},${lat},${lng});
  way["name"~"${escaped}",i]["shop"](around:${radius},${lat},${lng});
  node["name"~"${escaped}",i]["amenity"~"marketplace|pharmacy"](around:${radius},${lat},${lng});
);
out center 30;`;
}

function formatOSMAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (!parts.length && tags['addr:full']) return tags['addr:full'];
  return parts.join(', ');
}

async function findNearbyStoresOSM(
  lat: number,
  lng: number,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  let data: OverpassResponse;
  try {
    const params = new URLSearchParams();
    params.append('data', overpassQuery(lat, lng, radiusMetres));

    const res = await fetchWithTimeout(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Stokit/2.0',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Places] OSM findNearbyStores failed with status:', res.status, errText);
      return [];
    }
    data = (await res.json()) as OverpassResponse;
  } catch (err) {
    console.error('[Places] OSM findNearbyStores exception:', err);
    return [];
  }

  return (data.elements ?? [])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const elLat = el.type === 'node' ? el.lat! : el.center!.lat;
      const elLng = el.type === 'node' ? el.lon! : el.center!.lon;
      return {
        placeId: `osm:${el.type}:${el.id}`,
        name: el.tags!.name!,
        address: formatOSMAddress(el.tags ?? {}),
        distanceMetres: Math.round(haversine(lat, lng, elLat, elLng)),
        lat: elLat,
        lng: elLng,
        types: [el.tags?.shop ?? 'store'],
      };
    })
    .filter((s) => s.name.trim().length > 0)
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
}

async function searchByNameOSM(
  lat: number,
  lng: number,
  name: string,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  let data: OverpassResponse;
  try {
    const params = new URLSearchParams();
    params.append('data', overpassNameQuery(lat, lng, name, radiusMetres));

    const res = await fetchWithTimeout(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Stokit/2.0',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Places] OSM searchByName failed with status:', res.status, errText);
      return [];
    }
    data = (await res.json()) as OverpassResponse;
  } catch (err) {
    console.error('[Places] OSM searchByName exception:', err);
    return [];
  }

  return (data.elements ?? [])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const elLat = el.type === 'node' ? el.lat! : el.center!.lat;
      const elLng = el.type === 'node' ? el.lon! : el.center!.lon;
      return {
        placeId: `osm:${el.type}:${el.id}`,
        name: el.tags!.name!,
        address: formatOSMAddress(el.tags ?? {}),
        distanceMetres: Math.round(haversine(lat, lng, elLat, elLng)),
        lat: elLat,
        lng: elLng,
        types: [el.tags?.shop ?? 'store'],
      };
    })
    .filter((s) => s.name.trim().length > 0)
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
}

async function searchByNameGoogle(
  lat: number,
  lng: number,
  name: string,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  const params = new URLSearchParams({
    query: name,
    location: `${lat},${lng}`,
    radius: String(radiusMetres),
    key: config.googleApiKey,
  });
  try {
    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
      { headers: { 'X-Ios-Bundle-Identifier': 'com.hewadadil.pantrypal' } }
    );
    if (!res.ok) {
      console.log('[Places] Google textsearch failed:', res.status, await res.text());
      return [];
    }
    const data = (await res.json()) as GooglePlacesResponse;
    return (data.results ?? []).map((p) => ({
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity ?? '',
      distanceMetres: Math.round(
        haversine(lat, lng, p.geometry.location.lat, p.geometry.location.lng),
      ),
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      types: p.types ?? [],
      rating: p.rating,
    })).sort((a, b) => a.distanceMetres - b.distanceMetres);
  } catch {
    return [];
  }
}

// ─── Google Places Autocomplete & Details ──────────────────────────────────────

export async function autocompleteGooglePlaces(query: string, lat?: number, lng?: number): Promise<AutocompleteSuggestion[]> {
  if (!hasGoogleKey() || !query.trim()) return [];
  
  const params = new URLSearchParams({
    input: query,
    key: config.googleApiKey,
    types: 'establishment',
  });
  
  if (lat !== undefined && lng !== undefined) {
    params.append('location', `${lat},${lng}`);
    params.append('radius', '50000'); // 50km bias
  }

  try {
    const res = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, {
      headers: { 'X-Ios-Bundle-Identifier': 'com.hewadadil.pantrypal' }
    });
    if (!res.ok) {
      console.log('[Places] Google autocomplete failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));
  } catch {
    return [];
  }
}

export async function getPlaceDetailsGoogle(placeId: string): Promise<NearbyStore | null> {
  if (!hasGoogleKey()) return null;
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,vicinity,geometry,types,rating,opening_hours',
    key: config.googleApiKey,
  });

  try {
    const res = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
      headers: { 'X-Ios-Bundle-Identifier': 'com.hewadadil.pantrypal' }
    });
    if (!res.ok) {
      console.log('[Places] Google details failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const p = data.result;
    if (!p) return null;
    return {
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity ?? '',
      distanceMetres: 0,
      lat: p.geometry?.location?.lat ?? 0,
      lng: p.geometry?.location?.lng ?? 0,
      types: p.types ?? [],
      rating: p.rating,
      isOpen: p.opening_hours?.open_now,
    };
  } catch {
    return null;
  }
}

// ─── Google Places (premium upgrade, activated by setting API key) ────────────

const GOOGLE_PLACES_URL =
  'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

async function findNearbyStoresGoogle(
  lat: number,
  lng: number,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radiusMetres),
    type: 'grocery_or_supermarket',
    key: config.googleApiKey,
  });

  let data: GooglePlacesResponse;
  try {
    const res = await fetchWithTimeout(`${GOOGLE_PLACES_URL}?${params.toString()}`, {
      headers: { 'X-Ios-Bundle-Identifier': 'com.hewadadil.pantrypal' }
    });
    if (!res.ok) {
      console.log('[Places] Google nearbysearch failed:', res.status, await res.text());
      return [];
    }
    data = (await res.json()) as GooglePlacesResponse;
  } catch {
    return [];
  }

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

  return (data.results ?? [])
    .filter((p) => p.business_status === 'OPERATIONAL' || !p.business_status)
    .map((p) => ({
      placeId: p.place_id,
      name: p.name,
      address: p.vicinity ?? '',
      distanceMetres: Math.round(
        haversine(lat, lng, p.geometry.location.lat, p.geometry.location.lng),
      ),
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      types: p.types ?? [],
      rating: p.rating,
      isOpen: p.opening_hours?.open_now,
    }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
}

// ─── Geoapify (FREE, requires key) ────────────────────────────────────────────

const GEO_BASE = 'https://api.geoapify.com';
const STORE_CATEGORIES = [
  'commercial.supermarket',
  'commercial.grocery',
  'commercial.food_and_drink',
  'commercial.convenience',
  'commercial.warehouse',
  'commercial.discount_store',
].join(',');

async function findNearbyStoresGeoapify(
  lat: number,
  lng: number,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  const url =
    `${GEO_BASE}/v2/places` +
    `?categories=${STORE_CATEGORIES}` +
    `&filter=circle:${lng},${lat},${radiusMetres}` +
    `&bias=proximity:${lng},${lat}` +
    `&conditions=named&limit=50` +
    `&apiKey=${config.geoapifyApiKey}`;

  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.features ?? []) as any[])
      .map((f) => {
        const fLat = f.geometry.coordinates[1] as number;
        const fLng = f.geometry.coordinates[0] as number;
        return {
          placeId: `geoapify:${f.properties.place_id}`,
          name: f.properties.name ?? '',
          address: (f.properties.formatted ?? f.properties.address_line1 ?? '') as string,
          distanceMetres: Math.round(haversine(lat, lng, fLat, fLng)),
          lat: fLat,
          lng: fLng,
          types: f.properties.categories ?? [],
        };
      })
      .filter((s) => s.name.trim().length > 0)
      .sort((a, b) => a.distanceMetres - b.distanceMetres);
  } catch {
    return [];
  }
}

async function searchByNameGeoapify(
  lat: number,
  lng: number,
  name: string,
  radiusMetres: number,
): Promise<NearbyStore[]> {
  const cats = 'commercial.supermarket,commercial.department_store';
  const url =
    `${GEO_BASE}/v2/places` +
    `?categories=${cats}` +
    `&filter=circle:${lng},${lat},${radiusMetres}` +
    `&limit=500` +
    `&apiKey=${config.geoapifyApiKey}`;

  try {
    console.log('[Geoapify] Fetching URL:', url);
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.log('[Geoapify] API Error:', res.status);
      return [];
    }
    const data = await res.json();
    const targetName = name.toLowerCase();
    const mapped: NearbyStore[] = (data.features || [])
      .filter((f: any) => {
        const storeName = f.properties?.name?.toLowerCase() || '';
        return storeName.includes(targetName);
      })
      .map((f: any) => {
        const rLat = f.geometry.coordinates[1];
        const rLng = f.geometry.coordinates[0];
        return {
          placeId: `geoapify-${f.properties.place_id}`,
          name: f.properties.name,
          lat: rLat,
          lng: rLng,
          address: [f.properties.street, f.properties.city, f.properties.state_code || f.properties.state]
            .filter(Boolean)
            .join(', '),
          distanceMetres: Math.round(haversine(lat, lng, rLat, rLng)),
          types: ['store'],
        };
      })
      .sort((a: NearbyStore, b: NearbyStore) => (a.distanceMetres || 0) - (b.distanceMetres || 0));

    console.log('[Geoapify] Mapped results count:', mapped.length);
    return mapped;
  } catch (err) {
    console.error('[Geoapify] searchByName exception:', err);
    return [];
  }
}

// ─── Google Places (PREMIUM) ───────────────────────────────────────────────────────────

// ─── Response types ───────────────────────────────────────────────────────────

interface OverpassResponse {
  elements?: OverpassElement[];
}
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
interface GooglePlacesResponse {
  status: string;
  results?: Array<{
    place_id: string;
    name: string;
    vicinity?: string;
    business_status?: string;
    geometry: { location: { lat: number; lng: number } };
    types?: string[];
    rating?: number;
    opening_hours?: { open_now?: boolean };
  }>;
}
