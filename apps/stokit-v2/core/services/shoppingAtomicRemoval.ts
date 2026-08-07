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
  // Defensive, second-layer guard: a picked entry is a completed purchase.
  // The caller (session-store.ts REMOVE_ENTRY handling) is expected to have
  // already excluded a merely-picked entry before ever reaching here — this
  // protects the data layer itself in case a future/other caller doesn't.
  // Deleting the pantry item outright is a stronger, deliberate action and
  // still wins (matches the deletesPantryItem condition exactly).
  const blockedPickedRemoval = removedEntry.picked && !deletesPantryItem;
  const effectiveTombstoneEntryIds = blockedPickedRemoval
    ? tombstoneEntryIds.filter((id) => id !== removedEntry.entryId)
    : tombstoneEntryIds;
  const previousDeletedAt = Math.max(
    0,
    ...effectiveTombstoneEntryIds.map((entryId) =>
      state.deletedItems?.find((tombstone) => tombstone.id === entryId)?.deletedAt ?? 0),
  );
  // Computed the same way regardless of blockedPickedRemoval — sibling
  // tombstones (non-picked, still in effectiveTombstoneEntryIds) need a
  // correct shared deletedAt. What blockedPickedRemoval controls is only
  // whether THIS entryId gets recorded below.
  const removedAt = persistDeletion
    ? Math.max(
        nextSession.removedAt?.[removedEntry.entryId] ?? at,
        previousDeletedAt + 1,
        deletesPantryItem ? (pantryItem?.updatedAt ?? 0) + 1 : 0,
      )
    : nextSession.removedAt?.[removedEntry.entryId];
  const session = removedAt === undefined || blockedPickedRemoval
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
    : legacyStoreId !== undefined && !blockedPickedRemoval
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
            (tombstone) => !effectiveTombstoneEntryIds.includes(tombstone.id),
          ),
          ...effectiveTombstoneEntryIds.map((id) => ({ id, deletedAt: removedAt! })),
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
