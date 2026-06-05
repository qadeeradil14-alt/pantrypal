import { supabase } from './supabase';
import * as Location from 'expo-location';
import { enqueueOfflineMutation, isTransientNetworkErrorForQueue, runWithOfflineQueue } from './offlineQueue';
import { geocodeLocation, searchStoreLocations } from './storeSearch';

export const OFFLINE_STORE_ID_PREFIX = 'offline-store:';

/**
 * Normalise a raw store name to its canonical brand display form.
 * Applied at render-time only — never mutates DB values.
 *
 * Examples:  "sam's club" → "Sam's Club"
 *            "7 eleven"   → "7-Eleven"
 *            "aldi"       → "ALDI"
 */
export function normalizeStoreName(raw: string): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return trimmed;
  const KNOWN: Record<string, string> = {
    'walmart': 'Walmart',
    'walmart supercenter': 'Walmart',
    'walmart neighborhood market': 'Walmart',
    "sam's club": "Sam's Club",
    'sams club': "Sam's Club",
    'target': 'Target',
    'costco': 'Costco',
    'costco wholesale': 'Costco',
    'aldi': 'ALDI',
    'amazon fresh': 'Amazon Fresh',
    'amazon': 'Amazon',
    'whole foods': 'Whole Foods',
    'whole foods market': 'Whole Foods',
    'kroger': 'Kroger',
    '7-eleven': '7-Eleven',
    '7 eleven': '7-Eleven',
    '7eleven': '7-Eleven',
    'food lion': 'Food Lion',
    "trader joe's": "Trader Joe's",
    'trader joes': "Trader Joe's",
    'publix': 'Publix',
    'wegmans': "Wegmans",
    'heb': 'H-E-B',
    'h-e-b': 'H-E-B',
    'cvs': 'CVS',
    'walgreens': 'Walgreens',
    'safeway': 'Safeway',
    'meijer': 'Meijer',
    'hy-vee': 'Hy-Vee',
    'hyvee': 'Hy-Vee',
    'stop & shop': 'Stop & Shop',
    'stop and shop': 'Stop & Shop',
    'giant': 'Giant',
    'harris teeter': 'Harris Teeter',
    'sprouts': 'Sprouts',
    'sprouts farmers market': 'Sprouts',
    'wingstop': 'Wingstop',
    'papa johns': "Papa John's",
    "papa john's": "Papa John's",
    'dollar tree': 'Dollar Tree',
    'giant food': 'Giant Food',
    'kabul halal market': 'Kabul Halal Market',
  };
  return KNOWN[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Extract the US state name or 2-letter abbreviation from a store address string.
 * Used to detect wrong-state stores in the UI.
 * Returns e.g. "Virginia", "California", "VA", "CA", or null if not found.
 */
export function extractAddressState(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  // Walk from end: skip ZIP codes, country, find state segment
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    // "VA 22193" or "VA" — 2-letter state abbreviation
    const abbrMatch = p.match(/^([A-Z]{2})(\s+\d[\d-]*)?$/);
    if (abbrMatch) return abbrMatch[1];
    // bare ZIP — skip
    if (/^\d{5}(-\d{4})?$/.test(p)) continue;
    // Country — skip
    if (/^(united states|usa|us)$/i.test(p)) continue;
    // Full state name: starts uppercase, no digits, length > 3
    if (/^[A-Z][a-zA-Z ]+$/.test(p) && p.length > 3 && !/\d/.test(p)) return p;
  }
  return null;
}

// Re-export from the shared utility so call sites don't need to change.
export { normalizeUSState } from './usStates';

export function isOfflineStoreId(id: string): boolean {
  return id.startsWith(OFFLINE_STORE_ID_PREFIX);
}

function makeOfflineStoreId(): string {
  return `${OFFLINE_STORE_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeOptimisticStore(householdId: string, name: string, address?: string): Store {
  const ts = new Date().toISOString();
  return {
    id: makeOfflineStoreId(),
    household_id: householdId,
    name: name.trim(),
    address: address?.trim() || null,
    latitude: null,
    longitude: null,
    radius_meters: 150,
    store_brand_id: null,
    brand_domain: null,
    logo_url: null,
    created_at: ts,
  };
}

export interface Store {
  id: string;
  household_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  store_brand_id: string | null;
  brand_domain: string | null;
  logo_url: string | null;
  created_at: string;
}

export interface StoreBrand {
  id: string;
  name: string;
  aliases: string[];
  domain: string | null;
  logo_url: string | null;
  priority: number;
  search_text: string;
}

export interface StorePlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export const PRESET_STORES = [
  'Walmart', "Sam's Club", 'Costco', 'Kroger', 'Food Lion',
  'Publix', 'Target', 'Aldi', 'Whole Foods', 'Trader Joe\'s',
  'H-E-B', 'Safeway', 'Meijer', 'Giant', 'Stop & Shop',
];

/**
 * Keyword fragments that identify restaurants / fast-food / pickup-only places.
 * Matched against a normalized store name (lowercase, non-alphanumeric → space).
 * Anything NOT matched is treated as grocery / retail — the safe default.
 */
const PICKUP_STORE_KEYWORDS: string[] = [
  // Fast food / QSR
  'mcdonalds', 'starbucks', 'subway', 'chipotle', 'chick fil a', 'chickfila',
  'taco bell', 'burger king', 'wendys', 'kfc', 'popeyes', 'raising canes',
  'cookout', 'whataburger', 'sonic', 'arbys', 'dairy queen', 'culvers',
  'jack in the box', 'del taco', 'checkers', 'rallys', 'hardees', 'carls jr',
  // Pizza
  'dominos', 'papa johns', 'pizza hut', 'blaze pizza', 'little caesars',
  // Wings / chicken
  'wingstop', 'wing stop', 'buffalo wild wings', 'bdubs', 'hooters', 'zaxbys',
  // Burgers / subs
  'five guys', 'shake shack', 'in n out', 'smashburger', 'freddys',
  'jimmy johns', 'jersey mikes', 'firehouse subs', 'quiznos', 'potbelly',
  // Casual dining
  'chilis', 'applebees', 'olive garden', 'red lobster', 'red robin',
  'texas roadhouse', 'outback', 'denny', 'ihop', 'cracker barrel',
  // Café / coffee / bakery
  'dunkin', 'krispy kreme', 'panera', 'panda express', 'noodles',
  // Delivery platforms
  'doordash', 'grubhub', 'ubereats',
];

export type StoreCategory = 'grocery' | 'pickup';

/**
 * Classify a store name as grocery/retail or pickup/restaurant.
 * Uses keyword-fragment matching so "Wingstop #4312" → 'pickup',
 * while "Sam's Club" or any unknown store → 'grocery' (safe default).
 */
export function classifyStore(name: string): StoreCategory {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return PICKUP_STORE_KEYWORDS.some((kw) => n.includes(kw)) ? 'pickup' : 'grocery';
}

const FALLBACK_STORE_BRANDS: StoreBrand[] = [
  { id: 'fallback-walmart', name: 'Walmart', aliases: ['Supercenter', 'Walmart Supercenter'], domain: 'walmart.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Walmart_logo_%282025%29.svg/960px-Walmart_logo_%282025%29.svg.png', priority: 100, search_text: 'walmart supercenter walmart supercenter' },
  { id: 'fallback-sams-club', name: "Sam's Club", aliases: ['Sams Club', 'Sam Club'], domain: 'samsclub.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Sam%27s_Club_Logo_2020.svg/960px-Sam%27s_Club_Logo_2020.svg.png', priority: 95, search_text: 'sam club sams club sam club' },
  { id: 'fallback-costco', name: 'Costco', aliases: ['Costco Wholesale'], domain: 'costco.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Costco_Wholesale_logo_2010-10-26.svg/960px-Costco_Wholesale_logo_2010-10-26.svg.png', priority: 95, search_text: 'costco costco wholesale' },
  { id: 'fallback-kroger', name: 'Kroger', aliases: [], domain: 'kroger.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Kroger_logo_%281961-2019%29.svg/960px-Kroger_logo_%281961-2019%29.svg.png', priority: 90, search_text: 'kroger' },
  { id: 'fallback-food-lion', name: 'Food Lion', aliases: [], domain: 'foodlion.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Food_lion.png', priority: 90, search_text: 'food lion' },
  { id: 'fallback-publix', name: 'Publix', aliases: [], domain: 'publix.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Publix_Logo.svg/960px-Publix_Logo.svg.png', priority: 90, search_text: 'publix' },
  { id: 'fallback-target', name: 'Target', aliases: [], domain: 'target.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Target_logo.svg/960px-Target_logo.svg.png', priority: 90, search_text: 'target' },
  { id: 'fallback-aldi', name: 'ALDI', aliases: ['Aldi'], domain: 'aldi.us', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Aldi_S%C3%BCd_2017_logo.svg/960px-Aldi_S%C3%BCd_2017_logo.svg.png', priority: 85, search_text: 'aldi' },
  { id: 'fallback-whole-foods', name: 'Whole Foods Market', aliases: ['Whole Foods'], domain: 'wholefoodsmarket.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Whole_Foods_Market_201x_logo.svg/960px-Whole_Foods_Market_201x_logo.svg.png', priority: 85, search_text: 'whole foods market whole foods' },
  { id: 'fallback-trader-joes', name: "Trader Joe's", aliases: ['Trader Joes'], domain: 'traderjoes.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Trader_Joes_Logo.svg/960px-Trader_Joes_Logo.svg.png', priority: 85, search_text: 'trader joes trader joe' },
  { id: 'fallback-heb', name: 'H-E-B', aliases: ['HEB', 'H E B'], domain: 'heb.com', logo_url: null, priority: 80, search_text: 'h e b heb' },
  { id: 'fallback-safeway', name: 'Safeway', aliases: [], domain: 'safeway.com', logo_url: null, priority: 80, search_text: 'safeway' },
  { id: 'fallback-meijer', name: 'Meijer', aliases: [], domain: 'meijer.com', logo_url: null, priority: 80, search_text: 'meijer' },
  { id: 'fallback-giant-food', name: 'Giant Food', aliases: ['Giant'], domain: 'giantfood.com', logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Giant_Food_2008_logo.svg/960px-Giant_Food_2008_logo.svg.png', priority: 75, search_text: 'giant food giant' },
  { id: 'fallback-stop-shop', name: 'Stop & Shop', aliases: ['Stop and Shop'], domain: 'stopandshop.com', logo_url: null, priority: 75, search_text: 'stop and shop stop shop' },
  { id: 'fallback-wegmans', name: 'Wegmans', aliases: [], domain: 'wegmans.com', logo_url: null, priority: 70, search_text: 'wegmans' },
  { id: 'fallback-lidl', name: 'Lidl', aliases: [], domain: 'lidl.com', logo_url: null, priority: 70, search_text: 'lidl' },
  { id: 'fallback-dollar-general', name: 'Dollar General', aliases: [], domain: 'dollargeneral.com', logo_url: null, priority: 65, search_text: 'dollar general' },
  { id: 'fallback-family-dollar', name: 'Family Dollar', aliases: [], domain: 'familydollar.com', logo_url: null, priority: 65, search_text: 'family dollar' },
  { id: 'fallback-dollar-tree', name: 'Dollar Tree', aliases: [], domain: 'dollartree.com', logo_url: null, priority: 65, search_text: 'dollar tree' },
];

function fallbackStoreBrands(query: string): StoreBrand[] {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  return FALLBACK_STORE_BRANDS
    .filter((brand) => normalizeSearch(brand.search_text).includes(q))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, 12);
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export async function fetchStores(householdId: string): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data as Store[];
}

export async function searchStoreBrands(query: string): Promise<StoreBrand[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const fallback = fallbackStoreBrands(q);
  const { data, error } = await supabase
    .from('store_brands')
    .select('id, name, aliases, domain, logo_url, priority, search_text')
    .ilike('search_text', `%${q.replace(/[%_]/g, '')}%`)
    .order('priority', { ascending: false })
    .order('name')
    .limit(12);
  if (error) return fallback;
  const remote = data as StoreBrand[];
  return remote.length > 0 ? remote : fallback;
}

export async function addStore(
  householdId: string,
  name: string,
  address?: string,
  brand?: StoreBrand | null,
  skipGeocode = false,
): Promise<Store> {
  const normalizedName = name.trim();
  const { data: existingStore } = await supabase
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .ilike('name', normalizedName)
    .maybeSingle();
  if (existingStore) return existingStore as Store;

  let finalAddress = address?.trim() || null;
  let latitude: number | null = null;
  let longitude: number | null = null;

  if (skipGeocode) {
    finalAddress = null;
  } else if (finalAddress) {
    const coords = await geocodeAddress(finalAddress);
    latitude = coords?.latitude ?? null;
    longitude = coords?.longitude ?? null;
  } else {
    const place = await geocodeStoreName(name.trim());
    if (place) {
      latitude = place.latitude;
      longitude = place.longitude;
      finalAddress = place.address ?? null;
    }
  }

  return insertStoreWithBrandFallback({
    household_id: householdId,
    name: normalizedName,
    address: finalAddress,
    latitude,
    longitude,
    store_brand_id: brand?.id.startsWith('fallback-') ? null : brand?.id ?? null,
    brand_domain: brand?.domain ?? null,
    logo_url: brand?.logo_url ?? null,
  });
}

export async function addStoreFromPlace(householdId: string, place: StorePlace, brand?: StoreBrand | null): Promise<Store> {
  const normalizedName = place.name.trim();
  const { data: existingStore } = await supabase
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .ilike('name', normalizedName)
    .maybeSingle();
  if (existingStore) return existingStore as Store;

  return insertStoreWithBrandFallback({
    household_id: householdId,
    name: normalizedName,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    store_brand_id: brand?.id.startsWith('fallback-') ? null : brand?.id ?? null,
    brand_domain: brand?.domain ?? null,
    logo_url: brand?.logo_url ?? null,
  });
}

function isMissingStoreBrandColumnError(error: any): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`;
  return message.includes('brand_domain') || message.includes('store_brand_id') || message.includes('logo_url');
}

async function insertStoreWithBrandFallback(payload: Record<string, any>): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .insert(payload)
    .select()
    .single();

  if (!error) return data as Store;
  if (!isMissingStoreBrandColumnError(error)) throw error;

  const {
    store_brand_id: _storeBrandId,
    brand_domain: _brandDomain,
    logo_url: _logoUrl,
    ...legacyPayload
  } = payload;
  const legacy = await supabase
    .from('stores')
    .insert(legacyPayload)
    .select()
    .single();
  if (legacy.error) throw legacy.error;
  return {
    ...(legacy.data as Store),
    store_brand_id: null,
    brand_domain: payload.brand_domain ?? null,
    logo_url: payload.logo_url ?? null,
  };
}

/**
 * Fast location: last-known first (instant), then current with 5-second timeout.
 * BestForNavigation hangs indefinitely on iOS when GPS can't get a fix — never use
 * it for store search. Balanced accuracy is more than sufficient for city-level search.
 */
async function getFastLocation(): Promise<Location.LocationObject | null> {
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 30_000 });
    if (lastKnown) return lastKnown;
  } catch { /* fall through */ }
  try {
    const currentPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000));
    return await Promise.race([currentPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export async function searchNearbyStores(storeName: string, locationText?: string): Promise<StorePlace[]> {
  const normalized = storeName.trim();
  if (!normalized) return [];

  // ── Location-text path (zip / city / full address) — resolved via Geoapify ──
  if (locationText?.trim()) {
    const anchor = await geocodeLocation(locationText.trim());
    if (anchor) {
      const results = await searchStoreLocations({ storeName: normalized, anchor });
      // Return results from the resolved location (even if empty).
      // Never fall through to GPS — that would risk returning stores from a
      // completely different state than the one the user specified.
      return results;
    }
    // geocodeLocation returned null (key not configured or network failure).
    // Do NOT fall through to GPS when the user provided an explicit location —
    // GPS position may be in a different region and would produce wrong-state results.
    return [];
  }

  // ── GPS fallback — used when no location text provided, or Geoapify unavailable ──
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === 'granted') {
      // Use fast location (last-known → balanced current with 5 s timeout).
      // Never BestForNavigation — hangs 30+ s on iOS.
      const here = await getFastLocation();
      if (here) {
        const anchor = { lat: here.coords.latitude, lon: here.coords.longitude };
        return await searchStoreLocations({ storeName: normalized, anchor });
      }
    }
  } catch { /* fall through */ }

  return [];
}

/** Sort by distance from a point. Keep up to 8 nearest results within ~70 miles. */
function clusterNearestResults(places: StorePlace[], lat: number, lon: number): StorePlace[] {
  const withDist = places.map((p) => ({
    ...p,
    dist: Math.abs(p.latitude - lat) + Math.abs(p.longitude - lon),
  }));
  withDist.sort((a, b) => a.dist - b.dist);
  // Keep results within ~70 miles (1° ≈ 69 miles). Don't cluster aggressively —
  // the old 2x filter caused only 1 result to appear in low-density areas like
  // military bases where the nearest store might be 20+ miles away.
  return withDist.filter((p) => p.dist <= 1.0).slice(0, 8).map(({ dist: _, ...p }) => p);
}

export async function deleteStore(storeId: string) {
  const { error } = await supabase.from('stores').delete().eq('id', storeId);
  if (error) throw error;
}

export async function addStoreWithQueue(
  householdId: string,
  name: string,
  address?: string,
  brand?: StoreBrand | null,
  skipGeocode = false,
): Promise<{ queued: boolean; store: Store }> {
  try {
    const store = await addStore(householdId, name, address, brand, skipGeocode);
    return { queued: false, store };
  } catch (error) {
    if (!isTransientNetworkErrorForQueue(error)) throw error;
    const store = makeOptimisticStore(householdId, name, address);
    await enqueueOfflineMutation('add_store', {
      householdId,
      name: name.trim(),
      address: address?.trim() || undefined,
      brandDomain: brand?.domain ?? null,
      logoUrl: brand?.logo_url ?? null,
    });
    return { queued: true, store };
  }
}

export async function deleteStoreWithQueue(storeId: string): Promise<{ queued: boolean }> {
  if (isOfflineStoreId(storeId)) {
    return { queued: true };
  }
  return runWithOfflineQueue(
    'delete_store',
    { storeId },
    () => deleteStore(storeId),
  );
}

export async function setItemStore(itemId: string, storeId: string | null) {
  const { error } = await supabase
    .from('items')
    .update({ preferred_store_id: storeId })
    .eq('id', itemId);
  if (error) throw error;
}

export async function setItemStoreWithQueue(itemId: string, storeId: string | null): Promise<{ queued: boolean }> {
  return runWithOfflineQueue(
    'set_item_store',
    { itemId, storeId },
    () => setItemStore(itemId, storeId),
  );
}

async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const native = await Location.geocodeAsync(address);
    if (native.length > 0) {
      return { latitude: native[0].latitude, longitude: native[0].longitude };
    }
  } catch {
    // Fallback to HTTP geocoder below.
  }

  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'Stokit/1.0',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );
    if (!res.ok) return null;
    const results = await res.json();
    if (!results.length) return null;
    return { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

async function geocodeStoreName(
  storeName: string,
): Promise<{ latitude: number; longitude: number; address?: string } | null> {
  if (!storeName) return null;

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    let results: StorePlace[] = [];
    if (permission.status === 'granted') {
      // Use fast location — same reason as searchNearbyStores (no BestForNavigation).
      const here = await getFastLocation();
      if (here) {
        const delta = 0.35;
        const left = here.coords.longitude - delta;
        const right = here.coords.longitude + delta;
        const top = here.coords.latitude + delta;
        const bottom = here.coords.latitude - delta;
        results = await searchNominatimStores(storeName, `&bounded=1&viewbox=${left},${top},${right},${bottom}`, 1);
      }
    }
    if (results.length === 0) results = await searchNominatimStores(storeName, '', 1);
    if (!results.length) return null;
    return {
      latitude: results[0].latitude,
      longitude: results[0].longitude,
      address: results[0].address,
    };
  } catch {
    return null;
  }
}

async function searchNominatimStores(storeName: string, suffix = '', limit = 12): Promise<StorePlace[]> {
  const encoded = encodeURIComponent(storeName);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&addressdetails=1${suffix}`,
    {
      headers: {
        'User-Agent': 'Stokit/1.0',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  );
  if (!res.ok) throw new Error('Could not search nearby stores.');
  const results = await res.json();
  const places = (results as any[]).filter(hasNamedPlace).map((result) => ({
    name: bestPlaceName(result, storeName),
    address: formatNominatimAddress(result) ?? result?.display_name ?? storeName,
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  })).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

  // If results span > 30° in any direction (i.e. multiple continents), keep only
  // the cluster closest to the median point. Prevents MapView crash (longitudeDelta > 360)
  // for global chains like Kmart that Nominatim returns from AU, NZ, and the US.
  if (places.length > 1) {
    const lats = places.map((p) => p.latitude);
    const lons = places.map((p) => p.longitude);
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lonSpread = Math.max(...lons) - Math.min(...lons);
    if (latSpread > 30 || lonSpread > 30) {
      const medLat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const medLon = lons.reduce((a, b) => a + b, 0) / lons.length;
      const dist = (p: { latitude: number; longitude: number }) =>
        Math.abs(p.latitude - medLat) + Math.abs(p.longitude - medLon);
      const anchor = places.reduce((best, p) => dist(p) < dist(best) ? p : best, places[0]);
      return places.filter((p) => Math.abs(p.latitude - anchor.latitude) < 15 && Math.abs(p.longitude - anchor.longitude) < 15);
    }
  }
  return places;
}

function hasNamedPlace(result: any): boolean {
  const addr = result?.address ?? {};
  const name = result?.namedetails?.name ?? result?.name ?? addr.shop ?? addr.amenity ?? addr.building;
  return typeof name === 'string' && name.trim().length > 0;
}

function formatNominatimAddress(result: any): string | undefined {
  const addr = result?.address ?? {};
  const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality;
  const parts = [
    addr.house_number,
    addr.road,
    city,
    addr.state,
    addr.postcode,
  ].filter((part) => typeof part === 'string' && part.trim().length > 0);

  if (parts.length > 0) return parts.join(', ');
  if (typeof result?.display_name === 'string' && result.display_name.trim()) {
    return result.display_name
      .split(',')
      .map((p: string) => p.trim())
      .slice(0, 4)
      .join(', ');
  }
  return undefined;
}

function bestPlaceName(result: any, fallback: string): string {
  const named = result?.name ?? result?.address?.shop ?? result?.address?.amenity;
  return typeof named === 'string' && named.trim() ? named.trim() : fallback;
}
