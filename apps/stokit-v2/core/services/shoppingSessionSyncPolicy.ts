type RemoteShoppingSession = { status: string } | null;

export function remoteShoppingSessionAction(
  remoteSession: RemoteShoppingSession,
): 'clear' | 'apply' {
  return !remoteSession || remoteSession.status === 'idle' || remoteSession.status === 'trip_summary'
    ? 'clear'
    : 'apply';
}
