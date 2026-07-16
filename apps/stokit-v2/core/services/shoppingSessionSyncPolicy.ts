type RemoteShoppingSession = { status: string } | null;

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
): 'clear' | 'apply' {
  return !remoteSession || remoteSession.status === 'idle' || remoteSession.status === 'trip_summary'
    ? 'clear'
    : 'apply';
}
