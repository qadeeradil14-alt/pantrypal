import type {
  SharedShoppingSession,
  ShoppingEntry,
  ShoppingEntryDraft,
} from '../../types';

export function stopIdForStoreOccurrence(
  tripId: string | null,
  storeQueue: string[],
  index: number,
): string {
  const storeId = storeQueue[index] ?? 'unknown';
  let occurrence = 0;
  for (let i = 0; i <= index; i += 1) {
    if (storeQueue[i] === storeId) occurrence += 1;
  }
  return `stop:${tripId ?? 'legacy'}:${storeId}:${Math.max(occurrence, 1)}`;
}

export function stopIndexForEntry(
  session: Pick<SharedShoppingSession, 'storeQueue' | 'currentIndex'>,
  storeId: string,
): number {
  if (session.storeQueue[session.currentIndex] === storeId) return session.currentIndex;
  const pending = session.storeQueue.findIndex(
    (candidate, index) => index >= session.currentIndex && candidate === storeId,
  );
  if (pending >= 0) return pending;
  return session.storeQueue.lastIndexOf(storeId);
}

export function occurrenceId(
  tripId: string | null,
  stopId: string,
  pantryItemId: string,
): string {
  return `occ:${tripId ?? 'legacy'}:${stopId}:${pantryItemId}`;
}

export function entryDraft(
  pantryItemId: string,
  name: string,
  quantity: number,
  unit: ShoppingEntry['unit'],
  storeId: string,
): ShoppingEntryDraft {
  return { pantryItemId, name, quantity, unit, storeId, picked: false };
}

export function newestRemainingOccurrenceStoreId(
  entries: ShoppingEntry[],
  pantryItemId: string,
): string | null {
  const remaining = entries
    .filter((entry) => entry.pantryItemId === pantryItemId)
    .sort((a, b) => {
      const byAddedAt = (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity);
      return byAddedAt || b.entryId.localeCompare(a.entryId);
    });
  return remaining[0]?.storeId ?? null;
}
