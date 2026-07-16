import type {
  DurableState,
  SyncEntityCollection,
  SyncStamp,
  Trip,
} from '../../types';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
  syncStateDigest,
} from './replicaSync';

const RECOVERY_REPLICA_ID = 'canonical-legacy-recovery';
const RECOVERY_COLLECTIONS: SyncEntityCollection[] = [
  'items',
  'stores',
  'priceHistory',
  'trips',
  'receipts',
  'activity',
];

type RecoveryEntity = { id: string };

export type LegacyRecoveryDecision = {
  collection: SyncEntityCollection;
  entityId: string;
  winner: 'legacy' | 'replica' | 'tombstone';
  reason: 'explicit_tombstone' | 'legacy_only' | 'newer_mutation_evidence' | 'receipt_trip_consistency' | 'stamped_source_precedence';
  legacyEvidence: number;
  replicaEvidence: number | null;
};

export function isCanonicalState(state: DurableState | null | undefined): state is DurableState {
  return state?.syncMeta?.schema === 1;
}

export function mergeCanonicalSources(
  local: DurableState,
  canonical: DurableState | null | undefined,
  migrationReplicas: DurableState[],
  localReplicaId: string,
  onLegacyDecision?: (decision: LegacyRecoveryDecision) => void,
): DurableState {
  if (isCanonicalState(canonical)) return mergeReplicaStates([canonical, local], localReplicaId);
  if (!canonical) {
    const sources = [...migrationReplicas, local];
    return mergeReplicaStates(
      sources.length > 0 ? sources : [initializeReplicaState(local, localReplicaId)],
      localReplicaId,
    );
  }
  return mergeLegacyRecoverySources(local, canonical, migrationReplicas, onLegacyDecision);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function stableValue(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function compareStamp(a: SyncStamp | undefined, b: SyncStamp | undefined): number {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  if (a.clock !== b.clock) return a.clock - b.clock;
  return a.replicaId.localeCompare(b.replicaId);
}

function evidenceNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function entityEvidence(collection: SyncEntityCollection, entity: RecoveryEntity): number {
  const value = entity as unknown as Record<string, unknown>;
  if (collection === 'items') return evidenceNumber(value.updatedAt ?? value.createdAt);
  if (collection === 'stores') return evidenceNumber(value.updatedAt ?? value.createdAt);
  if (collection === 'priceHistory') return evidenceNumber(value.paidAt);
  if (collection === 'trips') return evidenceNumber(value.completedAt ?? value.startedAt);
  return evidenceNumber(value.createdAt);
}

function receiptTripConsistency(receipt: RecoveryEntity, trips: Trip[]): number {
  const value = receipt as unknown as Record<string, unknown>;
  const tripId = String(value.tripId ?? '');
  const trip = trips.find((candidate) => candidate.id === tripId);
  if (!trip) return 0;
  const included = trip.receiptIds.includes(receipt.id);
  const breakdown = trip.breakdown.find((entry) => entry.receiptId === receipt.id);
  if (value.status === 'logged') {
    return (included ? 4 : 0)
      + (breakdown && !breakdown.skipped ? 2 : 0)
      + (breakdown && Number(breakdown.amount) === Number(value.amount) ? 1 : 0);
  }
  if (value.status === 'skipped') {
    return (!included ? 4 : 0) + (breakdown?.skipped ? 2 : 0);
  }
  return 0;
}

function preferLegacyValue(
  collection: SyncEntityCollection,
  legacy: RecoveryEntity,
  replica: RecoveryEntity,
  trips: Trip[],
): { legacyWins: boolean; reason: LegacyRecoveryDecision['reason'] } {
  if (collection === 'receipts') {
    const legacyConsistency = receiptTripConsistency(legacy, trips);
    const replicaConsistency = receiptTripConsistency(replica, trips);
    if (legacyConsistency !== replicaConsistency) {
      return { legacyWins: legacyConsistency > replicaConsistency, reason: 'receipt_trip_consistency' };
    }
  }
  const legacyEvidence = entityEvidence(collection, legacy);
  const replicaEvidence = entityEvidence(collection, replica);
  if (legacyEvidence !== replicaEvidence) {
    return { legacyWins: legacyEvidence > replicaEvidence, reason: 'newer_mutation_evidence' };
  }
  return { legacyWins: false, reason: 'stamped_source_precedence' };
}

function dedupeLegacyCollection(
  collection: SyncEntityCollection,
  values: RecoveryEntity[],
  trips: Trip[],
): Map<string, RecoveryEntity> {
  const deduped = new Map<string, RecoveryEntity>();
  for (const value of values) {
    const current = deduped.get(value.id);
    if (!current) {
      deduped.set(value.id, value);
      continue;
    }
    const preference = preferLegacyValue(collection, value, current, trips);
    if (preference.legacyWins || (
      entityEvidence(collection, value) === entityEvidence(collection, current)
      && stableValue(value).localeCompare(stableValue(current)) > 0
    )) deduped.set(value.id, value);
  }
  return deduped;
}

function sortRecoveryCollection(collection: SyncEntityCollection, values: RecoveryEntity[]): RecoveryEntity[] {
  return [...values].sort((a, b) => {
    const delta = entityEvidence(collection, b) - entityEvidence(collection, a);
    return delta || a.id.localeCompare(b.id);
  });
}

function mergeLegacyRecoverySources(
  local: DurableState,
  legacy: DurableState,
  migrationReplicas: DurableState[],
  onDecision?: (decision: LegacyRecoveryDecision) => void,
): DurableState {
  const stampedSources = [...migrationReplicas, local]
    .sort((a, b) => (a.syncMeta?.replicaId ?? '').localeCompare(b.syncMeta?.replicaId ?? ''));
  const baseline = mergeReplicaStates(stampedSources, RECOVERY_REPLICA_ID);
  const combinedTrips = dedupeLegacyCollection(
    'trips',
    [...legacy.trips, ...baseline.trips] as RecoveryEntity[],
    [...legacy.trips, ...baseline.trips],
  );
  const tripEvidence = Array.from(combinedTrips.values()) as Trip[];
  const recoveredCollections = {} as Record<SyncEntityCollection, RecoveryEntity[]>;

  for (const collection of RECOVERY_COLLECTIONS) {
    const replicaValues = new Map(
      (baseline[collection] as RecoveryEntity[]).map((value) => [value.id, value]),
    );
    const legacyValues = dedupeLegacyCollection(
      collection,
      legacy[collection] as RecoveryEntity[],
      tripEvidence,
    );
    for (const [id, legacyValue] of legacyValues) {
      const valueStamp = baseline.syncMeta?.entities[collection][id];
      const tombstoneStamp = baseline.syncMeta?.tombstones[collection][id];
      if (tombstoneStamp && compareStamp(tombstoneStamp, valueStamp) >= 0) {
        onDecision?.({
          collection,
          entityId: id,
          winner: 'tombstone',
          reason: 'explicit_tombstone',
          legacyEvidence: entityEvidence(collection, legacyValue),
          replicaEvidence: null,
        });
        continue;
      }
      const replicaValue = replicaValues.get(id);
      if (!replicaValue) {
        replicaValues.set(id, legacyValue);
        onDecision?.({
          collection,
          entityId: id,
          winner: 'legacy',
          reason: 'legacy_only',
          legacyEvidence: entityEvidence(collection, legacyValue),
          replicaEvidence: null,
        });
        continue;
      }
      if (stableValue(legacyValue) === stableValue(replicaValue)) continue;
      const preference = preferLegacyValue(collection, legacyValue, replicaValue, tripEvidence);
      if (preference.legacyWins) replicaValues.set(id, legacyValue);
      onDecision?.({
        collection,
        entityId: id,
        winner: preference.legacyWins ? 'legacy' : 'replica',
        reason: preference.reason,
        legacyEvidence: entityEvidence(collection, legacyValue),
        replicaEvidence: entityEvidence(collection, replicaValue),
      });
    }
    recoveredCollections[collection] = sortRecoveryCollection(collection, Array.from(replicaValues.values()));
  }

  const recoveredData: DurableState = {
    ...baseline,
    items: recoveredCollections.items as DurableState['items'],
    stores: recoveredCollections.stores as DurableState['stores'],
    priceHistory: recoveredCollections.priceHistory as DurableState['priceHistory'],
    trips: recoveredCollections.trips as DurableState['trips'],
    receipts: recoveredCollections.receipts as DurableState['receipts'],
    activity: recoveredCollections.activity as DurableState['activity'],
    updatedAt: Math.max(legacy.updatedAt, baseline.updatedAt),
  };
  if (syncStateDigest(recoveredData) === syncStateDigest(baseline)) return baseline;
  const recovered = recordLocalMutation(
    baseline,
    recoveredData,
    RECOVERY_REPLICA_ID,
    'legacy.recovery',
  );
  if (recovered.syncMeta?.lastOperation) recovered.syncMeta.lastOperation.at = recovered.updatedAt;
  return recovered;
}

export function canonicalHomeCounts(state: DurableState): {
  pantry: number;
  shopping: number;
  expiring: number;
} {
  let pantry = 0;
  let shopping = 0;
  let expiring = 0;
  for (const item of state.items) {
    if (item.status === 'stocked') pantry += 1;
    if (item.status === 'low' || item.status === 'expiring') shopping += 1;
    if (item.status === 'expiring') expiring += 1;
  }
  return { pantry, shopping, expiring };
}

export function shouldProcessRealtimeRevision(remoteRevision: number, lastAppliedRevision: number): boolean {
  return Number.isFinite(remoteRevision) && remoteRevision > lastAppliedRevision;
}
