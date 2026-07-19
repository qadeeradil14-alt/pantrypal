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
  /** References a PantryItem.id — unique within a session (no duplicates). */
  itemId: string;
  name: string;
  quantity: number;
  unit: Unit;
  storeId: string;
  picked: boolean;
  /** User confirmed store didn't have this item. Counts neither as bought nor remaining. */
  outOfStock?: boolean;
}

export interface PriceEntry {
  id: string;
  itemId: string;
  itemName: string;
  storeId: string;
  price: number;
  paidAt: number;
}

export type ReceiptStatus = 'logged' | 'photo_pending' | 'skipped';

export interface Receipt {
  id: string;
  tripId: string;
  storeId: string;
  amount: number;
  status: ReceiptStatus;
  imageUri?: string | null;
  imagePath?: string | null;
  createdAt: number;
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
  entries: ShoppingEntry[];
  /** Item ids removed mid-trip. Optional: absent on payloads from pre-fix clients. */
  removedItemIds?: string[];
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
  updatedAt: number;
  /** Tombstones for deleted items (optional: absent in pre-OTA-340 snapshots). */
  deletedItems?: ItemTombstone[];
}
