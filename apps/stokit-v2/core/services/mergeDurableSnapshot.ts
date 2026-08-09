import type { DurableState, SharedShoppingSession, Trip } from '../../types';
import { mergePantryItems, mergeTombstones } from './mergePantryState';
import {
  mergeActivity,
  mergePrefs,
  mergePriceHistory,
  mergeReceipts,
  mergeStores,
  mergeTrips,
} from './mergeDurableCollections';
import { canFoldActiveSessions, foldRemoteActiveSession, reconcileShoppingSession } from './shoppingEntrySync';
import { isCompletedShoppingSession } from './shoppingSessionSyncPolicy';
import { mergeShoppingStoreAssignments } from './shoppingStoreAssignments';

function mergeActiveSession(
  remote: SharedShoppingSession | null,
  local: SharedShoppingSession | null,
  mergedItems: DurableState['items'],
  knownTrips: Trip[],
  preferLocal: boolean,
  closedTripIds: { id: string }[],
): SharedShoppingSession | null {
  if (
    (isCompletedShoppingSession(remote, knownTrips, closedTripIds) ||
      isCompletedShoppingSession(local, knownTrips, closedTripIds))
  ) return null;

  const preferred = preferLocal ? local : remote;
  const other = preferLocal ? remote : local;
  if (!preferred || !other) return preferred ?? other;
  // Same policy as the pull path — see canFoldActiveSessions. Notably this does
  // NOT require both sides to be `shopping_store`: the shopper walks through
  // receipt_prompt / store_summary / next_store_ready while moving from one
  // store to the next, and requiring status equality here made the push discard
  // everything a collaborator had added to the upcoming store during that
  // window.
  if (!canFoldActiveSessions(other, preferred)) return preferred;

  // foldRemoteActiveSession produces the entry / storeQueue / occurrence tombstone
  // union with `preferred` as the authoritative base (it keeps the second
  // argument's scalars). Receipts, skipped stores and completedTrip are the
  // push-path-only extras layered on top.
  const folded = foldRemoteActiveSession(other, preferred);
  return reconcileShoppingSession({
    ...folded,
    receipts: mergeReceipts(other.receipts, preferred.receipts, []),
    completedTrip: preferred.completedTrip ?? other.completedTrip,
  }, mergedItems);
}

export function mergeDurableSnapshotForPush(remote: DurableState, local: DurableState): DurableState {
  const preferLocal = local.updatedAt > remote.updatedAt;
  const preferred = preferLocal ? local : remote;
  const mergedTombstones = mergeTombstones(remote.deletedItems, local.deletedItems);
  const mergedStoreTombstones = mergeTombstones(remote.deletedStores, local.deletedStores);
  const mergedTripTombstones = mergeTombstones(remote.deletedTrips, local.deletedTrips);
  const mergedReceiptTombstones = mergeTombstones(remote.deletedReceipts, local.deletedReceipts);
  // mergePantryItems is (local, remote, tombstones) — local first, so its
  // documented "local keeps its order, remote-only items append" contract
  // and its tie-break-on-equal-updatedAt (first-seen wins) both resolve the
  // way the rest of this merge assumes.
  const mergedItems = mergePantryItems(local.items, remote.items, mergedTombstones);
  const mergedTrips = mergeTrips(remote.trips, local.trips, mergedTripTombstones);
  const mergedReceipts = mergeReceipts(remote.receipts, local.receipts, mergedReceiptTombstones);
  const knownTrips = mergedTrips;
  const mergedClosedTripIds = mergeTombstones(remote.closedTripIds, local.closedTripIds);
  const mergedPrefs = mergePrefs(remote, local, preferLocal);

  return {
    ...preferred,
    items: mergedItems,
    stores: mergeStores(remote.stores, local.stores, mergedStoreTombstones),
    priceHistory: mergePriceHistory(remote.priceHistory, local.priceHistory),
    receipts: mergedReceipts,
    trips: mergedTrips,
    activity: mergeActivity(remote.activity, local.activity),
    ...mergedPrefs,
    activeSession: mergeActiveSession(
      remote.activeSession, local.activeSession, mergedItems, knownTrips,
      preferLocal, mergedClosedTripIds,
    ),
    shoppingStoreAssignments: mergeShoppingStoreAssignments(
      remote.shoppingStoreAssignments,
      local.shoppingStoreAssignments,
    ),
    updatedAt: Math.max(remote.updatedAt, local.updatedAt),
    deletedItems: mergedTombstones,
    deletedStores: mergedStoreTombstones,
    deletedTrips: mergedTripTombstones,
    deletedReceipts: mergedReceiptTombstones,
    closedTripIds: mergedClosedTripIds,
  };
}

function byId<T extends { id: string }>(records: T[] | undefined): T[] {
  return [...(records ?? [])].sort((a, b) => a.id.localeCompare(b.id));
}

function tombstones(entries: DurableState['deletedItems']): DurableState['deletedItems'] {
  return byId(entries);
}

/**
 * JSON.stringify with every object's keys sorted, recursively.
 *
 * Root cause this exists for: Postgres `jsonb` (unlike the `json` type) does
 * NOT preserve object key insertion order. A record round-tripped through
 * `household_snapshots` comes back with its keys in Postgres's own order,
 * which differs from the order the same record has in local memory — even
 * when every value is byte-for-byte identical. Plain JSON.stringify is
 * order-sensitive, so two semantically-equal snapshots produced different
 * fingerprint strings on every single cycle, permanently defeating
 * runDrain's no-op guard (`lastAcknowledgedFingerprint === submittedFingerprint`
 * in householdPushCoordinator.ts) and forcing a real push every drain
 * iteration — proven to sustain an indefinite ~800ms-cadence push loop with
 * zero real content changes, which both wastes bandwidth/battery and starves
 * genuine edits behind constant CAS contention.
 *
 * Sorting arrays (byId, above) was already order-independent; this closes
 * the remaining gap for the objects INSIDE those arrays (and every other
 * nested object) without changing any value, array order, or merge outcome —
 * it only changes what the fingerprint STRING looks like.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    // Match native JSON.stringify: an undefined array element serializes as
    // null (never omitted — omitting would shift every later index).
    return `[${value.map((entry) => (entry === undefined ? 'null' : stableStringify(entry))).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    // Match native JSON.stringify: a key whose value is undefined is omitted
    // entirely, not written as "undefined" or null.
    const keys = Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

export function durableStateSemanticFingerprint(state: DurableState): string {
  const items = byId(state.items);
  const activeSession = state.activeSession ? {
    ...state.activeSession,
    entries: [...state.activeSession.entries].sort((a, b) => a.entryId.localeCompare(b.entryId)),
    removedEntryIds: [...(state.activeSession.removedEntryIds ?? [])].sort(),
    skippedStoreIds: [...state.activeSession.skippedStoreIds].sort(),
    receipts: byId(state.activeSession.receipts),
  } : null;
  return stableStringify({
    items,
    stores: byId(state.stores),
    priceHistory: byId(state.priceHistory),
    receipts: byId(state.receipts),
    trips: byId(state.trips),
    activity: byId(state.activity),
    prefs: state.prefs,
    prefsUpdatedAt: state.prefsUpdatedAt ?? {},
    activeSession,
    shoppingStoreAssignments: byId(state.shoppingStoreAssignments),
    deletedItems: tombstones(state.deletedItems),
    deletedStores: tombstones(state.deletedStores),
    deletedTrips: tombstones(state.deletedTrips),
    deletedReceipts: tombstones(state.deletedReceipts),
    closedTripIds: tombstones(state.closedTripIds),
  });
}

export function hasLocalSyncContribution(remote: DurableState, local: DurableState): boolean {
  return durableStateSemanticFingerprint(mergeDurableSnapshotForPush(remote, local)) !== durableStateSemanticFingerprint(remote);
}
