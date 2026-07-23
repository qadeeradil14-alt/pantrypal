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
 * Merge pantry items from two independently-edited devices without losing data:
 *
 *  - Union by id (an item present on only one side is kept).
 *  - For an id on both sides, keep the version with the higher updatedAt
 *    (per-item last-writer-wins — robust to which device's whole-snapshot
 *    happens to have the higher top-level timestamp).
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
      if (accepted) byId.set(item.id, item);
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
