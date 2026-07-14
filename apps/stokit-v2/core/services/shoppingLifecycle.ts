import { currentStoreId, initialSession, type ShoppingSession } from '../shopping-machine';
import type { DurableState, SharedShoppingSession } from '../../types';

let lifecycleRoute = 'unknown';

export function setShoppingLifecycleRoute(route: string): void {
  lifecycleRoute = route || 'unknown';
}

export type ShoppingTraceContext = {
  replicaId?: string | null;
  sequence?: number;
  version?: number;
  error?: unknown;
};

const SESSION_STATUSES = new Set<SharedShoppingSession['status']>([
  'idle',
  'shopping_store',
  'receipt_prompt',
  'store_summary',
  'continue_prompt',
  'next_store_ready',
  'trip_summary',
]);

export function normalizeShoppingSession(value: unknown): SharedShoppingSession | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<SharedShoppingSession>;
  if (
    !SESSION_STATUSES.has(session.status as SharedShoppingSession['status'])
    || (session.tripId !== null && typeof session.tripId !== 'string')
    || (session.startedAt !== null && typeof session.startedAt !== 'number')
    || !Array.isArray(session.storeQueue)
    || !Number.isInteger(session.currentIndex)
    || !Array.isArray(session.skippedStoreIds)
    || !Array.isArray(session.entries)
    || !Array.isArray(session.receipts)
  ) return null;
  if (session.status !== 'idle' && (!session.tripId || session.storeQueue.length === 0)) return null;
  return {
    ...session,
    removedItemIds: Array.isArray(session.removedItemIds) ? session.removedItemIds : [],
    completedTrip: session.completedTrip ?? null,
  } as SharedShoppingSession;
}

export function resolveHydratedShoppingSession(
  _savedSession: ShoppingSession,
  durableSession: SharedShoppingSession | null,
): ShoppingSession {
  return normalizeShoppingSession(durableSession) as ShoppingSession | null ?? initialSession;
}

export function resetShoppingLifecycleState<T extends DurableState>(state: T, now: number): T {
  return {
    ...state,
    items: state.items.map((item) =>
      item.status === 'low' || item.status === 'expiring'
        ? { ...item, status: 'stocked' as const, storeId: null, updatedAt: now }
        : item
    ),
    activeSession: null,
  };
}

export function shoppingTransitionTrace(
  source: 'hydrate' | 'local' | 'remote',
  event: string,
  previous: ShoppingSession,
  next: ShoppingSession,
  context: ShoppingTraceContext = {},
): string {
  const entityIds = Array.from(new Set([
    next.tripId ?? previous.tripId,
    ...next.entries.map((entry) => entry.itemId),
    ...previous.entries.map((entry) => entry.itemId),
    ...next.storeQueue,
    ...previous.storeQueue,
  ].filter((value): value is string => Boolean(value))));
  const error = context.error instanceof Error ? context.error.message : context.error;
  return [
    '[Shopping Lifecycle]',
    `source=${source}`,
    `event=${event}`,
    `from=${previous.status}`,
    `to=${next.status}`,
    `tripId=${next.tripId ?? previous.tripId ?? 'none'}`,
    `storeId=${currentStoreId(next) ?? 'none'}`,
    `itemCount=${next.entries.length}`,
    `pickedCount=${next.entries.filter((entry) => entry.picked).length}`,
    `route=${lifecycleRoute}`,
    `device=${context.replicaId ?? 'unknown'}`,
    `sequence=${context.sequence ?? 0}`,
    `version=${context.version ?? 0}`,
    `entityIds=${entityIds.join(',') || 'none'}`,
    `error=${error == null ? 'none' : encodeURIComponent(String(error))}`,
  ].join(' ');
}
