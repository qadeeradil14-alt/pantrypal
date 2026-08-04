import type { ItemTombstone, PantryItem } from '../../types';
import { syncDiag } from './syncDiag'; // DIAG: temporary — remove after OTA 389 investigation

// Deleted-item tombstones are retained for this long so a device that has been
// offline past this window can still learn about the deletion. After that they
// are pruned to keep the synced snapshot from growing without bound.
export const TOMBSTONE_RETENTION_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

/**
 * Union two tombstone lists by id (keeping the latest deletedAt), then prune
 * anything older than the retention window.
 */
export function mergeTombstones(
  a: ItemTombstone[] = [],
  b: ItemTombstone[] = [],
  now: number = Date.now(),
  retentionMs: number = TOMBSTONE_RETENTION_MS,
): ItemTombstone[] {
  const latest = new Map<string, number>();
  for (const t of [...(a ?? []), ...(b ?? [])]) {
    if (!t || typeof t.id !== 'string' || typeof t.deletedAt !== 'number') continue;
    const prev = latest.get(t.id);
    if (prev === undefined || t.deletedAt > prev) latest.set(t.id, t.deletedAt);
  }
  const cutoff = now - retentionMs;
  const out: ItemTombstone[] = [];
  for (const [id, deletedAt] of latest) {
    if (deletedAt >= cutoff) out.push({ id, deletedAt });
  }
  return out;
}

/**
 * Resolve `status`/`storeId` across two copies of the same item independently
 * of every other field, using a dedicated `statusUpdatedAt` timestamp instead
 * of the item's whole-object `updatedAt`.
 *
 * Root cause this fixes: `updatedAt` is bumped by ANY field edit (quantity,
 * name, unit, ...). Whole-object last-write-wins meant an unrelated edit on a
 * stale copy (still showing `status: 'low'`) could out-race — and silently
 * overwrite — a newer, more important `status: 'stocked'` transition made on
 * another device, resurrecting a just-purchased item back onto the shopping
 * list. Comparing `statusUpdatedAt` instead means only an intentional
 * status/store transition (see durable-store.ts's addItem/updateItem/
 * setItemStatus/clearShoppingEntries/assignItemsToStore/resetShoppingList/
 * deleteStore, all of which stamp it) can move these two fields.
 *
 * Legacy compatibility: items written before this field existed have
 * `statusUpdatedAt === undefined` on both sides — in that case this falls
 * back to the original whole-object `updatedAt` comparison, so old data
 * merges exactly as it always did. If only one side has a stamp, that side
 * wins — an explicit, tracked transition is more trustworthy than an
 * untracked legacy status that could be arbitrarily old.
 */
function resolveStatusFields(
  existing: PantryItem,
  incoming: PantryItem,
): Pick<PantryItem, 'status' | 'storeId' | 'statusUpdatedAt' | 'statusRevision' | 'statusClosedTripId' | 'statusBasedOnClosedTripId'> {
  const existingRevision = existing.statusRevision;
  const incomingRevision = incoming.statusRevision;
  if (Boolean(existing.statusClosedTripId) !== Boolean(incoming.statusClosedTripId)) {
    const terminal = incoming.statusClosedTripId ? incoming : existing;
    const nonTerminal = incoming.statusClosedTripId ? existing : incoming;
    const winner = nonTerminal.statusBasedOnClosedTripId === terminal.statusClosedTripId
      ? nonTerminal
      : terminal;
    return {
      status: winner.status,
      storeId: winner.storeId,
      statusUpdatedAt: winner.statusUpdatedAt,
      statusRevision: winner.statusRevision,
      statusClosedTripId: winner.statusClosedTripId,
      statusBasedOnClosedTripId: winner.statusBasedOnClosedTripId,
    };
  }
  if (existingRevision !== undefined || incomingRevision !== undefined) {
    const a = existingRevision ?? 0;
    const b = incomingRevision ?? 0;
    if (a !== b) {
      const winner = b > a ? incoming : existing;
      return {
        status: winner.status,
        storeId: winner.storeId,
        statusUpdatedAt: winner.statusUpdatedAt,
        statusRevision: winner.statusRevision,
        statusClosedTripId: winner.statusClosedTripId,
        statusBasedOnClosedTripId: winner.statusBasedOnClosedTripId,
      };
    }
  }
  const existingAt = existing.statusUpdatedAt;
  const incomingAt = incoming.statusUpdatedAt;

  if (existingAt === undefined && incomingAt === undefined) {
    const incomingWins = (incoming.updatedAt ?? 0) > (existing.updatedAt ?? 0);
    const winner = incomingWins ? incoming : existing;
    return {
      status: winner.status,
      storeId: winner.storeId,
      statusUpdatedAt: undefined,
      statusRevision: winner.statusRevision,
      statusClosedTripId: winner.statusClosedTripId,
      statusBasedOnClosedTripId: winner.statusBasedOnClosedTripId,
    };
  }

  const a = existingAt ?? -Infinity;
  const b = incomingAt ?? -Infinity;
  if (a === b) {
    // Tie (including the case both are defined and equal) — fall back to the
    // regular updatedAt comparison, same tie-break as the rest of the item.
    const incomingWins = (incoming.updatedAt ?? 0) > (existing.updatedAt ?? 0);
    const winner = incomingWins ? incoming : existing;
    return {
      status: winner.status,
      storeId: winner.storeId,
      statusUpdatedAt: winner.statusUpdatedAt,
      statusRevision: winner.statusRevision,
      statusClosedTripId: winner.statusClosedTripId,
      statusBasedOnClosedTripId: winner.statusBasedOnClosedTripId,
    };
  }
  const winner = b > a ? incoming : existing;
  return {
    status: winner.status,
    storeId: winner.storeId,
    statusUpdatedAt: winner.statusUpdatedAt,
    statusRevision: winner.statusRevision,
    statusClosedTripId: winner.statusClosedTripId,
    statusBasedOnClosedTripId: winner.statusBasedOnClosedTripId,
  };
}

/**
 * Merge pantry items from two independently-edited devices without losing data:
 *
 *  - Union by id (an item present on only one side is kept).
 *  - For an id on both sides, keep the version with the higher updatedAt
 *    (per-item last-writer-wins — robust to which device's whole-snapshot
 *    happens to have the higher top-level timestamp) for most fields —
 *    except `status`/`storeId`, which are resolved independently via
 *    `statusUpdatedAt` (see resolveStatusFields) so an unrelated field edit
 *    can never clobber a newer purchase/stock transition.
 *  - Honor deletion tombstones: an item stays deleted unless it was updated
 *    strictly after the deletion (a re-add wins over an older delete).
 *
 * Local items keep their original order; new remote-only items are appended.
 */
export function mergePantryItems(
  local: PantryItem[] = [],
  remote: PantryItem[] = [],
  tombstones: ItemTombstone[] = [],
): PantryItem[] {
  const deletedAtById = new Map<string, number>();
  for (const t of tombstones ?? []) {
    if (!t || typeof t.id !== 'string' || typeof t.deletedAt !== 'number') continue;
    const prev = deletedAtById.get(t.id);
    if (prev === undefined || t.deletedAt > prev) deletedAtById.set(t.id, t.deletedAt);
  }

  const byId = new Map<string, PantryItem>();
  const order: string[] = [];
  for (const item of [...(local ?? []), ...(remote ?? [])]) {
    if (!item || typeof item.id !== 'string') continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      order.push(item.id);
    } else {
      // `existing` is the local copy (spread first), `item` is the incoming
      // remote copy (spread second). Behavior below is unchanged.
      const accepted = (item.updatedAt ?? 0) > (existing.updatedAt ?? 0);
      if ((item.updatedAt ?? 0) !== (existing.updatedAt ?? 0)) {
        syncDiag('item_merge', { // DIAG: temporary — remove after OTA 389 investigation
          itemId: item.id,
          incomingUpdatedAt: item.updatedAt,
          localUpdatedAt: existing.updatedAt,
          decision: accepted ? 'accepted' : 'rejected',
        });
      }
      const base = accepted ? item : existing;
      byId.set(item.id, { ...base, ...resolveStatusFields(existing, item) });
    }
  }

  const result: PantryItem[] = [];
  for (const id of order) {
    const item = byId.get(id)!;
    const deletedAt = deletedAtById.get(id);
    // Tie goes to the deletion; a strictly-newer update resurrects the item.
    if (deletedAt !== undefined && (item.updatedAt ?? 0) <= deletedAt) continue;
    result.push(item);
  }
  return result;
}
