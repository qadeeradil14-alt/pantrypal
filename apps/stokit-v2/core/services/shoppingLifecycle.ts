import { currentStoreId, initialSession, type ShoppingSession } from '../shopping-machine';
import type { DurableState, SharedShoppingSession } from '../../types';

export function resolveHydratedShoppingSession(
  _savedSession: ShoppingSession,
  durableSession: SharedShoppingSession | null,
): ShoppingSession {
  return durableSession ? durableSession as ShoppingSession : initialSession;
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
): string {
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
  ].join(' ');
}
