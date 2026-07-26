type RemoteShoppingSession = { status: string; tripId?: string | null } | null;
type CompletedTrip = { id: string };

export function remoteShoppingSessionAction(
  remoteSession: RemoteShoppingSession,
): 'clear' | 'apply' {
  return !remoteSession || remoteSession.status === 'idle' || remoteSession.status === 'trip_summary'
    ? 'clear'
    : 'apply';
}

export function shouldPreserveCompletedTripSummary(
  localSession: RemoteShoppingSession,
): boolean {
  return localSession?.status === 'trip_summary';
}

export function isCompletedShoppingSession(
  session: RemoteShoppingSession,
  completedTrips: CompletedTrip[],
): boolean {
  return Boolean(session?.tripId && completedTrips.some((trip) => trip.id === session.tripId));
}
