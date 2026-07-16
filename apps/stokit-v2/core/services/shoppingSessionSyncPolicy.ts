import type { SyncStamp } from '../../types';

type RemoteShoppingSession = { status: string } | null;

export type RemoteShoppingSessionContext = {
  activeTripId: string | null;
  activeSessionStamp?: SyncStamp;
  sessionTombstones?: Record<string, SyncStamp>;
};

function compareStamp(a: SyncStamp | undefined, b: SyncStamp | undefined): number {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  if (a.clock !== b.clock) return a.clock - b.clock;
  return a.replicaId.localeCompare(b.replicaId);
}

export function createRemoteShoppingSessionProjection<T>() {
  let latestSequence = 0;
  return {
    issue: () => {
      latestSequence += 1;
      return latestSequence;
    },
    resolve: (sequence: number, currentSession: T): T | undefined =>
      sequence === latestSequence ? currentSession : undefined,
  };
}

export function remoteShoppingSessionAction(
  remoteSession: RemoteShoppingSession,
  context?: RemoteShoppingSessionContext,
): 'clear' | 'apply' | 'ignore' {
  if (remoteSession && remoteSession.status !== 'idle' && remoteSession.status !== 'trip_summary') {
    return 'apply';
  }
  if (!context?.activeTripId) return 'clear';
  const tombstone = context.sessionTombstones?.[context.activeTripId];
  return compareStamp(tombstone, context.activeSessionStamp) >= 0 && Boolean(tombstone)
    ? 'clear'
    : 'ignore';
}
