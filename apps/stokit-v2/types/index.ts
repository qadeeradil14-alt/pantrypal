/**
 * Stokit V2 — core data model.
 *
 * These types are pure (no React Native / Expo imports) so the shopping state
 * machine and repositories can be unit-tested with `tsx --test`.
 */

export type PantryStatus = 'stocked' | 'low' | 'expiring' | 'purchased';

export type Unit =
  | 'unit'
  | 'gal'
  | 'qt'
  | 'L'
  | 'ml'
  | 'lb'
  | 'oz'
  | 'g'
  | 'kg'
  | 'pack'
  | 'box'
  | 'can'
  | 'dozen';

export type StorageLocation = 'fridge' | 'freezer' | 'beverages' | 'pantry';

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: Unit;
  status: PantryStatus;
  /** Where the item is stored at home. Auto-derived from name; user can override. */
  storageLocation: StorageLocation;
  /** Store this item should be bought at. May be null until assigned. */
  storeId: string | null;
  /** ISO date string. Optional. */
  expiryDate: string | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Timestamp of the last intentional `status`/`storeId` transition (marking
   * low, stocking, purchasing, reassigning a store). Merged independently of
   * `updatedAt` so an unrelated field edit (e.g. quantity) on a stale copy can
   * never overwrite a newer purchase/stock transition. Optional/absent on
   * items from before this field existed — see mergePantryItems for the
   * legacy fallback.
   */
  statusUpdatedAt?: number;
}

export interface Store {
  id: string;
  name: string;
  /** Visual only. Must never control business logic. */
  logoColor?: string;
  logoEmoji?: string;
  logoUrl?: string;
  /** Populated when the store was discovered via Google Places. */
  placeId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  openingHours?: string;
  isOpen?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A single item being shopped within an active trip. */
export interface ShoppingEntry {
  /** Stable identity of this one shopping request. */
  entryId: string;
  /** References the canonical PantryItem.id. Multiple entries may share it. */
  pantryItemId: string;
  /** Stable identity of the store visit, including repeat visits to one store. */
  stopId: string;
  name: string;
  quantity: number;
  unit: Unit;
  storeId: string;
  picked: boolean;
  /** Wall-clock ms of the last `picked` change. Enables last-tap-wins merge across
   *  devices. Absent on legacy snapshots — the merge falls back to sticky-OR then. */
  pickedAt?: number;
  /** User confirmed store didn't have this item. Counts neither as bought nor remaining. */
  outOfStock?: boolean;
  /** Wall-clock ms of the last `outOfStock` change. Same last-tap-wins role as pickedAt. */
  outOfStockAt?: number;
  /**
   * Wall-clock version of occurrence metadata. It orders two snapshots of the
   * same entryId; it never identifies or replaces a sibling occurrence.
   */
  addedAt?: number;
}

export interface ShoppingStoreAssignment {
  /** Stable identity of one pantry-item/store shopping request. */
  id: string;
  pantryItemId: string;
  storeId: string;
  active: boolean;
  updatedAt: number;
}

export type ShoppingEntryDraft = Omit<
  ShoppingEntry,
  'entryId' | 'stopId' | 'pickedAt' | 'outOfStock' | 'outOfStockAt' | 'addedAt'
>;

export interface PriceEntry {
  id: string;
  itemId: string;
  itemName: string;
  storeId: string;
  price: number;
  paidAt: number;
}

export type ReceiptStatus = 'logged' | 'photo_pending' | 'skipped';

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  price: number | null;
}

export interface Receipt {
  id: string;
  tripId: string;
  storeId: string;
  amount: number;
  status: ReceiptStatus;
  imageUri?: string | null;
  imagePath?: string | null;
  items?: ReceiptLineItem[];
  createdAt: number;
  /** Last local edit; absent on legacy receipts, which fall back to createdAt. */
  updatedAt?: number;
}

export interface TripStoreBreakdown {
  storeId: string;
  itemsBought: number;
  amount: number;
  receiptId: string | null;
  /** True when the user explicitly skipped this store. */
  skipped: boolean;
}

export interface TripPurchasedItem {
  itemId: string;
  name: string;
  storeId: string;
  /** 0 when the user didn't separately log a per-item price for this trip. */
  price: number;
}

export interface Trip {
  id: string;
  storeIdsVisited: string[];
  /** Store IDs the user explicitly skipped. */
  skippedStoreIds: string[];
  itemsBought: number;
  itemsRemaining: number;
  itemsOutOfStock: number;
  receiptIds: string[];
  totalSpent: number;
  breakdown: TripStoreBreakdown[];
  /** Every item the user checked off as picked during this trip, regardless of whether a price was logged. */
  purchasedItems: TripPurchasedItem[];
  startedAt: number;
  completedAt: number;
  /** Trip duration in milliseconds. */
  duration: number;
}

export interface SharedShoppingSession {
  /** Household member operating this trip. Absent on sessions from older clients. */
  shopperId?: string | null;
  status:
    | 'idle'
    | 'shopping_store'
    | 'receipt_prompt'
    | 'store_summary'
    | 'continue_prompt'
    | 'next_store_ready'
    | 'trip_summary';
  tripId: string | null;
  startedAt: number | null;
  storeQueue: string[];
  currentIndex: number;
  skippedStoreIds: string[];
  /** Last explicit skip/unskip actions, used to make unskip win over a stale peer. */
  skippedAt?: Record<string, number>;
  unskippedAt?: Record<string, number>;
  /**
   * Stop ids whose visit has been completed (receipt saved or skipped).
   * Explicit reopen/completion timestamps resolve the supported reversal
   * across peers. A completed stop is never silently re-queued by item sync.
   * Absent on pre-OTA-431 payloads — treated as an empty list.
   */
  completedStopIds?: string[];
  completedStopAt?: Record<string, number>;
  reopenedStopAt?: Record<string, number>;
  entries: ShoppingEntry[];
  /** Legacy wire field. Decoded immediately into removedEntryIds. */
  removedItemIds?: string[];
  /** Shopping occurrence ids removed mid-trip. */
  removedEntryIds?: string[];
  /**
   * Wall-clock ms each occurrence tombstone was written. Lets a later re-add
   * (ShoppingEntry.addedAt) win over an older removal instead of the tombstone
   * being permanently re-unioned by every merge. Absent on legacy payloads.
   */
  removedAt?: Record<string, number>;
  receipts: Receipt[];
  completedTrip: Trip | null;
}

export type ActivityType =
  | 'item_added'
  | 'marked_low'
  | 'picked_up'
  | 'receipt_logged'
  | 'store_added'
  | 'trip_completed';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  /** Human-readable summary line. */
  message: string;
  /** Optional references for navigation / detail. */
  itemId?: string;
  storeId?: string;
  tripId?: string;
  createdAt: number;
}

// ─── Household sharing ───────────────────────────────────────────────────────

/** Persisted identity for this device's household. */
export interface HouseholdIdentity {
  /** UUID generated locally on creation. */
  id: string;
  name: string;
  /** Server-generated invite code. Null while this is a private pantry. */
  inviteCode: string | null;
  isPersonal: boolean;
  role: 'owner' | 'member';
  createdAt: number;
}

const MEMBER_COLORS = [
  '#D4874E', '#5A9E70', '#2E86C1', '#7D3C98',
  '#C05050', '#D4AC0D', '#27AE60', '#A04000',
] as const;
export type MemberColor = typeof MEMBER_COLORS[number];

export interface HouseholdMember {
  id: string;
  displayName: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  /** Derived from displayName. */
  initials: string;
  avatarColor: string;
  role: 'owner' | 'member';
  joinedAt: number;
  /** True for the local user — never synced. */
  isMe: boolean;
}

// ─── Legacy preferences (unchanged) ─────────────────────────────────────────

export interface HouseholdPrefs {
  householdName: string;
  defaultUnit: Unit;
  expiringWindowDays: number;
  weeklyBudget: number;
  dismissedBudgetWarningWeekOf?: number;
}

/**
 * Tombstone for a deleted pantry item. Kept in the synced snapshot so a
 * per-item cross-device merge can distinguish "deleted here" from "not yet
 * synced there" — without it, a union merge would resurrect deleted items.
 */
export interface ItemTombstone {
  id: string;
  deletedAt: number;
}

/** Everything persisted to disk. */
export interface DurableState {
  items: PantryItem[];
  stores: Store[];
  priceHistory: PriceEntry[];
  receipts: Receipt[];
  trips: Trip[];
  activity: ActivityEvent[];
  prefs: HouseholdPrefs;
  activeSession: SharedShoppingSession | null;
  /** Multi-store shopping requests kept separately from PantryItem.storeId. */
  shoppingStoreAssignments?: ShoppingStoreAssignment[];
  updatedAt: number;
  /** Tombstones for deleted items (optional: absent in pre-OTA-340 snapshots). */
  deletedItems?: ItemTombstone[];
  /** Entity tombstones prevent stale whole-device snapshots resurrecting deletions. */
  deletedStores?: ItemTombstone[];
  deletedTrips?: ItemTombstone[];
  deletedReceipts?: ItemTombstone[];
  /** Per-field preference versions prevent unrelated preference edits clobbering each other. */
  prefsUpdatedAt?: Partial<Record<keyof HouseholdPrefs, number>>;
  /**
   * Tombstones for explicitly-closed (canceled or finished) trip ids —
   * `id` is the tripId, `deletedAt` is when it was closed. Prevents a device
   * that still holds a stale, not-yet-cancelled copy of the session in
   * memory from resurrecting it by pushing with a fresh timestamp after
   * another device has already ended that trip. Optional: absent on
   * snapshots from before this field existed.
   */
  closedTripIds?: ItemTombstone[];
}
