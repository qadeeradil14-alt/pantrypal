/**
 * Durable repository — the only thing that touches persistent storage.
 *
 * Failure-safe by design: a read/parse error never throws and never returns a
 * wiped state. Callers keep their in-memory copy. A future network/Supabase
 * layer can sit behind this same interface without ever being able to clobber
 * the local pantry, stores, or receipts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DurableState, HouseholdPrefs } from '../../types';

const STORAGE_KEY = 'stokit.v2.durable.v1';

export const defaultPrefs: HouseholdPrefs = {
  householdName: 'My Household',
  defaultUnit: 'unit',
  expiringWindowDays: 3,
  weeklyBudget: 200,
};

export const emptyDurableState: DurableState = {
  items: [],
  stores: [],
  priceHistory: [],
  receipts: [],
  trips: [],
  activity: [],
  prefs: defaultPrefs,
  activeSession: null,
  updatedAt: 0,
};

/** Merge a partial/unknown parsed blob into a complete, valid DurableState. */
function normalize(parsed: unknown): DurableState {
  if (!parsed || typeof parsed !== 'object') return { ...emptyDurableState };
  const p = parsed as Partial<DurableState>;
  return {
    items: Array.isArray(p.items) ? p.items : [],
    stores: Array.isArray(p.stores) ? p.stores : [],
    priceHistory: Array.isArray(p.priceHistory) ? p.priceHistory : [],
    receipts: Array.isArray(p.receipts) ? p.receipts : [],
    trips: Array.isArray(p.trips) ? p.trips : [],
    activity: Array.isArray(p.activity) ? p.activity : [],
    prefs: { ...defaultPrefs, ...(p.prefs ?? {}) },
    activeSession: p.activeSession ?? null,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
  };
}

/** Returns null only when there is genuinely no saved state yet. */
export async function loadDurable(): Promise<DurableState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    return normalize(JSON.parse(raw));
  } catch (err) {
    // Corrupt / unreadable storage must never wipe the user's data. We return
    // null so the caller keeps whatever it already has in memory.
    if (__DEV__) console.warn('[durableRepository] load failed; keeping in-memory state', err);
    return null;
  }
}

export async function saveDurable(state: DurableState): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[durableRepository] save failed; data kept in memory', err);
    return false;
  }
}

export async function clearDurable(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    if (__DEV__) console.warn('[durableRepository] clear failed', err);
  }
}
