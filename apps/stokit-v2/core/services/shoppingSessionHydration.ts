import { initialSession, type ShoppingSession } from '../shopping-machine';
import type { SharedShoppingSession } from '../../types';
import {
  decodeShoppingSession,
  foldRemoteActiveSession,
} from './shoppingEntrySync';

function activeSession(
  session: SharedShoppingSession | null,
  isClosedTripId: (tripId: string) => boolean,
): ShoppingSession | null {
  if (!session || session.status === 'idle' || session.status === 'trip_summary') return null;
  const decoded = decodeShoppingSession(session) as ShoppingSession;
  return decoded.tripId && isClosedTripId(decoded.tripId) ? null : decoded;
}

export function resolveHydratedShoppingSession(
  savedSession: SharedShoppingSession | null,
  durableSession: SharedShoppingSession | null,
  isClosedTripId: (tripId: string) => boolean,
): ShoppingSession {
  const saved = activeSession(savedSession, isClosedTripId);
  const durable = activeSession(durableSession, isClosedTripId);

  if (saved && durable && saved.tripId === durable.tripId) {
    return foldRemoteActiveSession(saved, durable, isClosedTripId) as ShoppingSession;
  }
  if (saved && durable) {
    return (durable.startedAt ?? 0) >= (saved.startedAt ?? 0) ? durable : saved;
  }
  return durable ?? saved ?? initialSession;
}

export function sameActiveShoppingSession(
  left: SharedShoppingSession | null,
  right: SharedShoppingSession | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(decodeShoppingSession(left)) === JSON.stringify(decodeShoppingSession(right));
}
