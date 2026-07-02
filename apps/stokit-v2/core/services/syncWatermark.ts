// Tracks the highest remote snapshot updatedAt this device has successfully applied.
// Only advances on true remote-apply — never on local writes, local pushes, or self-echoes.
// Enables multi-member sync: a member's own write activity cannot raise the floor
// against another member's later snapshot.
let lastAppliedRemoteAt = 0;

// Tracks the updatedAt of the last snapshot this device pushed to Supabase.
// Used to detect self-echoes: when Supabase reflects our own push back through
// the realtime channel, remoteUpdatedAt === lastPushedAt.
let lastPushedAt = 0;

export function shouldApplyRemote(remoteUpdatedAt: number): boolean {
  return !isSelfEcho(remoteUpdatedAt) && remoteUpdatedAt > lastAppliedRemoteAt;
}

export function markRemoteApplied(remoteUpdatedAt: number): void {
  lastAppliedRemoteAt = remoteUpdatedAt;
}

export function markPushed(ts: number): void {
  lastPushedAt = ts;
}

export function isSelfEcho(remoteUpdatedAt: number): boolean {
  return remoteUpdatedAt === lastPushedAt;
}

export function resetSyncWatermark(): void {
  lastAppliedRemoteAt = 0;
  lastPushedAt = 0;
}

// ── Restart-safe snapshot gate (WO-002) ──────────────────────────────────────
//
// The in-memory watermark above resets to 0 on every app launch, so on its own
// it cannot stop a stale cloud snapshot from overwriting edits made in a
// previous (offline) session. The durable snapshot's own updatedAt, however,
// IS persisted (AsyncStorage via durableRepository) and survives restarts.
// The engine-level gate therefore additionally requires the remote snapshot to
// be strictly newer than the local durable state.

export type RemoteSkipReason = 'local_origin' | 'older' | 'not_newer_than_local';

/**
 * Composite gate used by pullFromSupabase. A remote snapshot may be applied
 * only when it is (1) not this device's own echo, (2) newer than the last
 * remote snapshot applied this session, and (3) strictly newer than the local
 * durable snapshot. (3) is the restart-safe protection.
 */
export function shouldApplyRemoteSnapshot(
  remoteUpdatedAt: number,
  localUpdatedAt: number,
): boolean {
  return shouldApplyRemote(remoteUpdatedAt) && remoteUpdatedAt > localUpdatedAt;
}

/** Why a remote snapshot was skipped — null when it should be applied. */
export function remoteSkipReason(
  remoteUpdatedAt: number,
  localUpdatedAt: number,
): RemoteSkipReason | null {
  if (isSelfEcho(remoteUpdatedAt)) return 'local_origin';
  if (remoteUpdatedAt <= lastAppliedRemoteAt) return 'older';
  if (remoteUpdatedAt <= localUpdatedAt) return 'not_newer_than_local';
  return null;
}
