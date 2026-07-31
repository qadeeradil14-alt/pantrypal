/**
 * Item-level duplicate protection for shopping adds.
 *
 * The defect this exists for: completing a stop deactivates that stop's
 * purchased assignments (durable-store.clearShoppingEntries), but
 * assignShoppingItemToStore reactivates a deactivated assignment
 * unconditionally. So re-adding an item that was already bought at a store
 * silently resurrected that store's planning list, and the finished store
 * reappeared once the rest of the trip completed.
 *
 * Nothing here mutates. It answers one question — "was this item already
 * bought at this store on the trip that is running right now?" — so callers
 * can refuse the silent resurrection and offer an explicit choice instead.
 *
 * Deliberately scoped to the ACTIVE trip. A store bought at at any point in
 * history is not a duplicate; only re-adding within the same trip is.
 */

import type { SharedShoppingSession, ShoppingEntry } from '../../types';
import { normalizeItemName } from './pantryItems';

/**
 * Receipt-scanned rows share one sentinel pantryItemId because they have no
 * pantry item behind them. Keying those on the id would make every scanned
 * product look like the same product, so they fall back to their name.
 */
export const UNLINKED_PANTRY_ITEM_ID = '__quick_scan__';

/**
 * Stable identity for "the same thing at the same store".
 *
 * Prefers pantryItemId, which survives renames and is already what the
 * assignment ledger keys on. Falls back to the normalized name only when
 * there is no usable id, so two genuinely different products never collapse
 * into one just because neither is linked to the pantry.
 */
export function shoppingDuplicateKey(
  pantryItemId: string | null | undefined,
  name: string,
  storeId: string,
): string {
  const identity = pantryItemId && pantryItemId !== UNLINKED_PANTRY_ITEM_ID
    ? `id:${pantryItemId}`
    : `name:${normalizeItemName(name)}`;
  return `${storeId} ${identity}`;
}

export interface PurchasedOccurrence {
  pantryItemId: string;
  name: string;
  storeId: string;
  /** The completed stop the purchase belongs to. Never mutated by callers. */
  stopId: string;
}

function isSameThing(entry: ShoppingEntry, pantryItemId: string, name: string): boolean {
  return shoppingDuplicateKey(entry.pantryItemId, entry.name, entry.storeId)
    === shoppingDuplicateKey(pantryItemId, name, entry.storeId);
}

/**
 * Identity only — "the same thing", regardless of which store. Store-scoped
 * `isSameThing` can't answer "was this bought ANYWHERE this trip" because its
 * key folds storeId in; this strips that down to just pantryItemId (or name).
 */
function isSameItem(entry: ShoppingEntry, pantryItemId: string, name: string): boolean {
  const usableId = pantryItemId && pantryItemId !== UNLINKED_PANTRY_ITEM_ID;
  const entryUsableId = entry.pantryItemId && entry.pantryItemId !== UNLINKED_PANTRY_ITEM_ID;
  if (usableId && entryUsableId) return entry.pantryItemId === pantryItemId;
  return normalizeItemName(entry.name) === normalizeItemName(name);
}

/**
 * The completed occurrence proving this item was already bought at this store
 * on the running trip, or null.
 *
 * Requires `picked`: an item that was left unbought (or went out of stock) at
 * a completed stop keeps its assignment and legitimately stays on the list, so
 * re-adding it is not a duplicate and must not be challenged.
 */
export function purchasedAtStoreThisTrip(
  session: SharedShoppingSession | null | undefined,
  pantryItemId: string,
  name: string,
  storeId: string,
): PurchasedOccurrence | null {
  if (!session || session.status === 'idle' || session.status === 'trip_summary') return null;
  const completed = new Set(session.completedStopIds ?? []);
  if (completed.size === 0) return null;
  const match = (session.entries ?? []).find(
    (entry) =>
      entry.storeId === storeId &&
      entry.picked &&
      completed.has(entry.stopId) &&
      isSameThing(entry, pantryItemId, name),
  );
  return match
    ? { pantryItemId: match.pantryItemId, name: match.name, storeId, stopId: match.stopId }
    : null;
}

/**
 * The completed occurrence proving this item was already bought SOMEWHERE on
 * the running trip, at whatever store that turns out to be, or null.
 *
 * Store-agnostic counterpart to `purchasedAtStoreThisTrip`. A caller assigning
 * to store B needs to know about a purchase already made at store A — that
 * pairing can never itself equal (B, B), so the store-scoped check alone is
 * blind to it and silently reassigns the item to B instead of asking first.
 */
export function purchasedThisTrip(
  session: SharedShoppingSession | null | undefined,
  pantryItemId: string,
  name: string,
): PurchasedOccurrence | null {
  if (!session || session.status === 'idle' || session.status === 'trip_summary') return null;
  const completed = new Set(session.completedStopIds ?? []);
  if (completed.size === 0) return null;
  const match = (session.entries ?? []).find(
    (entry) =>
      entry.picked &&
      completed.has(entry.stopId) &&
      isSameItem(entry, pantryItemId, name),
  );
  return match
    ? { pantryItemId: match.pantryItemId, name: match.name, storeId: match.storeId, stopId: match.stopId }
    : null;
}

/**
 * Whether the running trip's purchase history can be read at all.
 *
 * 'unresolved' means a trip IS running and has closed out at least one stop,
 * but this device cannot see the entries that would say what was bought there
 * — a partially hydrated or partially merged session. Answering "not a
 * duplicate" there is how a silent duplicate gets created, so callers must
 * treat it as blocking and require an explicit choice instead.
 */
export type DuplicateResolution = 'purchased' | 'clear' | 'unresolved';

export function resolveDuplicateState(
  session: SharedShoppingSession | null | undefined,
  pantryItemId: string,
  name: string,
  storeId: string,
): DuplicateResolution {
  // No trip running — nothing can be a same-trip duplicate.
  if (!session || session.status === 'idle' || session.status === 'trip_summary') return 'clear';
  const completed = session.completedStopIds ?? [];
  if (completed.length === 0) return 'clear';
  if (purchasedAtStoreThisTrip(session, pantryItemId, name, storeId)) return 'purchased';
  // Stops are known to be completed but their entries are missing: we cannot
  // prove this item was NOT bought at one of them.
  if (!session.entries || session.entries.length === 0) return 'unresolved';
  // Deliberately store-scoped only: wanting the same product from a second,
  // different store this trip (e.g. milk at both Lidl and Aldi) is a
  // legitimate independent need, not a duplicate — see
  // "a purchase at one store does not mask the same item pending at
  // another". `purchasedThisTrip` (any store) exists for callers that force
  // a storeId onto an item with no explicit user choice of store (e.g. the
  // in-trip "Add to {current store}" sheet); it is deliberately NOT folded
  // in here, since every caller of this function — including deliberate
  // reassignment via the store picker — must keep treating that as valid.
  return 'clear';
}

/**
 * Convenience predicate for call sites that only need the yes/no.
 *
 * Deliberately fails closed: 'unresolved' counts as already-purchased so an
 * incompletely-synced device refuses the silent write rather than guessing.
 */
export function isAlreadyPurchasedThisTrip(
  session: SharedShoppingSession | null | undefined,
  pantryItemId: string,
  name: string,
  storeId: string,
): boolean {
  return resolveDuplicateState(session, pantryItemId, name, storeId) !== 'clear';
}

/** "Milk was already bought at Lidl." */
export function duplicatePurchaseMessage(
  itemNames: string[],
  storeName: string,
): string {
  if (itemNames.length === 1) return `${itemNames[0]} was already bought at ${storeName}.`;
  const head = itemNames.slice(0, -1).join(', ');
  const tail = itemNames[itemNames.length - 1];
  return `${head} and ${tail} were already bought at ${storeName}.`;
}
