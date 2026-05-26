import { supabase } from './supabase';
import * as Location from 'expo-location';
import { enqueueOfflineMutation, isTransientNetworkErrorForQueue, runWithOfflineQueue } from './offlineQueue';

export const OFFLINE_STORE_ID_PREFIX = 'offline-store:';

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
  created_at: string;
}

export const PRESET_STORES = [
  'Walmart', "Sam's Club", 'Costco', 'Kroger', 'Food Lion',
  'Publix', 'Target', 'Aldi', 'Whole Foods', 'Trader Joe\'s',
  'H-E-B', 'Safeway', 'Meijer', 'Giant', 'Stop & Shop',
];

export async function fetchStores(householdId: string): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .order('name');
  if (error) throw error;
  return data as Store[];
}

export async function addStore(
  householdId: string,
  name: string,
  address?: string,
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

  if (finalAddress) {
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

  const { data, error } = await supabase
    .from('stores')
    .insert({ household_id: householdId, name: normalizedName, address: finalAddress, latitude, longitude })
    .select()
    .single();

  if (error) throw error;
  return data as Store;
}

export async function deleteStore(storeId: string) {
  const { error } = await supabase.from('stores').delete().eq('id', storeId);
  if (error) throw error;
}

export async function addStoreWithQueue(
  householdId: string,
  name: string,
  address?: string,
): Promise<{ queued: boolean; store: Store }> {
  try {
    const store = await addStore(householdId, name, address);
    return { queued: false, store };
  } catch (error) {
    if (!isTransientNetworkErrorForQueue(error)) throw error;
    const store = makeOptimisticStore(householdId, name, address);
    await enqueueOfflineMutation('add_store', {
      householdId,
      name: name.trim(),
      address: address?.trim() || undefined,
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
          'User-Agent': 'PantryPal/1.0',
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
    if (permission.status !== 'granted') return null;
    const here = await Location.getCurrentPositionAsync({});
    const delta = 0.35;
    const left = here.coords.longitude - delta;
    const right = here.coords.longitude + delta;
    const top = here.coords.latitude + delta;
    const bottom = here.coords.latitude - delta;
    const encoded = encodeURIComponent(storeName);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1&bounded=1&viewbox=${left},${top},${right},${bottom}`,
      {
        headers: {
          'User-Agent': 'PantryPal/1.0',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );
    if (!res.ok) return null;
    const results = await res.json();
    if (!results.length) return null;
    return {
      latitude: parseFloat(results[0].lat),
      longitude: parseFloat(results[0].lon),
      address: formatNominatimAddress(results[0]),
    };
  } catch {
    return null;
  }
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
