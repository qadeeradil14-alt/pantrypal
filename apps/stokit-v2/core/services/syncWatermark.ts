// Tracks the highest remote snapshot updatedAt this device has successfully applied.
// Only advances on confirmed remote-apply — never on local writes or local pushes.
// Enables multi-member sync: a member's own write activity cannot raise the floor
// against another member's later snapshot.
let lastAppliedRemoteAt = 0;

export function shouldApplyRemote(remoteUpdatedAt: number): boolean {
  return remoteUpdatedAt > lastAppliedRemoteAt;
}

export function markRemoteApplied(remoteUpdatedAt: number): void {
  lastAppliedRemoteAt = remoteUpdatedAt;
}

export function resetSyncWatermark(): void {
  lastAppliedRemoteAt = 0;
}
