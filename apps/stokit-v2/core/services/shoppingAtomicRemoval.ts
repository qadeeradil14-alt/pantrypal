import type { DurableState, SharedShoppingSession, ShoppingEntry } from '../../types';
import { nextTimestamp } from './id';
import {
  nextShoppingStatusRevision,
  normalizeShoppingEpoch,
  observeActiveTripAssignments,
} from './shoppingEpoch';

export type AtomicShoppingRemovalInput = {
  nextSession: SharedShoppingSession;
  removedEntry: ShoppingEntry;
  persistDeletion: boolean;
  tombstoneEntryIds: string[];
  legacyStoreId?: string | null;
};

export function atomicShoppingRemovalPatch(
  state: DurableState,
  input: AtomicShoppingRemovalInput,
  at = Date.now(),
): Partial<DurableState> {
  const {
    nextSession,
    removedEntry,
    persistDeletion,
    tombstoneEntryIds,
    legacyStoreId,
  } = input;
  const pantryItem = state.items.find((item) => item.id === removedEntry.pantryItemId);
  const deletesPantryItem = persistDeletion && removedEntry.entryId === removedEntry.pantryItemId;
  const previousDeletedAt = Math.max(
    0,
    ...tombstoneEntryIds.map((entryId) =>
      state.deletedItems?.find((tombstone) => tombstone.id === entryId)?.deletedAt ?? 0),
  );
  const removedAt = persistDeletion
    ? Math.max(
        nextSession.removedAt?.[removedEntry.entryId] ?? at,
        previousDeletedAt + 1,
        deletesPantryItem ? (pantryItem?.updatedAt ?? 0) + 1 : 0,
      )
    : nextSession.removedAt?.[removedEntry.entryId];
  const session = removedAt === undefined
    ? nextSession
    : {
        ...nextSession,
        removedAt: {
          ...(nextSession.removedAt ?? {}),
          [removedEntry.entryId]: removedAt,
        },
      };
  const currentEpoch = normalizeShoppingEpoch(state.shoppingEpoch);
  const shoppingEpoch = !state.activeTripId && currentEpoch === 0
    ? currentEpoch + 1
    : currentEpoch;
  const items = deletesPantryItem
    ? state.items.filter((item) => item.id !== removedEntry.pantryItemId)
    : legacyStoreId !== undefined
      ? state.items.map((item) => item.id === removedEntry.pantryItemId
        ? {
            ...item,
            storeId: legacyStoreId,
            updatedAt: nextTimestamp(item.updatedAt),
            statusUpdatedAt: nextTimestamp(item.statusUpdatedAt),
            ...nextShoppingStatusRevision(item, state),
          }
        : item)
      : state.items;
  return {
    items,
    deletedItems: persistDeletion
      ? [
          ...(state.deletedItems ?? []).filter(
            (tombstone) => !tombstoneEntryIds.includes(tombstone.id),
          ),
          ...tombstoneEntryIds.map((id) => ({ id, deletedAt: removedAt! })),
        ]
      : state.deletedItems,
    activeSession: session,
    shoppingEpoch,
    activeTripId: session.tripId,
    shoppingStoreAssignments: observeActiveTripAssignments(
      state.shoppingStoreAssignments,
      session,
      shoppingEpoch,
      at,
    ),
  };
}

export function commitAtomicShoppingRemoval<T extends DurableState>(
  setState: (update: (state: T) => Partial<T>) => void,
  persist: () => void,
  input: AtomicShoppingRemovalInput,
  at = Date.now(),
): void {
  setState((state) => atomicShoppingRemovalPatch(state, input, at) as Partial<T>);
  persist();
}
