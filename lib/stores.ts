import { supabase } from './supabase';
import * as Location from 'expo-location';

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
    // Best-effort geocoding for quick-add presets (e.g., "Walmart")
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

export async function setItemStore(itemId: string, storeId: string | null) {
  const { error } = await supabase
    .from('items')
    .update({ preferred_store_id: storeId })
    .eq('id', itemId);
  if (error) throw error;
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
    const native = await Location.geocodeAsync(storeName);
    if (native.length > 0) {
      return { latitude: native[0].latitude, longitude: native[0].longitude };
    }
  } catch {
    // Continue to HTTP fallback.
  }

  try {
    const encoded = encodeURIComponent(storeName);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`,
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
    const conciseAddress = formatNominatimAddress(results[0]);
    return {
      latitude: parseFloat(results[0].lat),
      longitude: parseFloat(results[0].lon),
      address: conciseAddress,
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
