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
