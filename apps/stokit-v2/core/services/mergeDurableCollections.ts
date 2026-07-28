import type {
  ActivityEvent,
  DurableState,
  HouseholdPrefs,
  ItemTombstone,
  PriceEntry,
  Receipt,
  Store,
  Trip,
} from '../../types';

function deterministicWinner<T>(a: T, b: T): T {
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export function mergeRecordsById<T extends { id: string }>(
  a: T[] = [],
  b: T[] = [],
  versionOf: (record: T) => number,
  tombstones: ItemTombstone[] = [],
  limit?: number,
): T[] {
  const version = (record: T): number => {
    const value = versionOf(record);
    return Number.isFinite(value) ? value : 0;
  };
  const byId = new Map<string, T>();
  for (const record of [...a, ...b]) {
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, record);
      continue;
    }
    const existingVersion = version(existing);
    const incomingVersion = version(record);
    byId.set(
      record.id,
      incomingVersion > existingVersion
        ? record
        : incomingVersion < existingVersion
          ? existing
          : deterministicWinner(existing, record),
    );
  }
  const deletedAt = new Map(tombstones.map((entry) => [entry.id, entry.deletedAt]));
  const merged = Array.from(byId.values())
    .filter((record) => version(record) > (deletedAt.get(record.id) ?? -Infinity))
    .sort((left, right) => version(right) - version(left) || left.id.localeCompare(right.id));
  return limit === undefined ? merged : merged.slice(0, limit);
}

export function mergeStores(
  a: Store[],
  b: Store[],
  tombstones: ItemTombstone[],
): Store[] {
  return mergeRecordsById(a, b, (store) => store.updatedAt, tombstones);
}

export function mergeTrips(
  a: Trip[],
  b: Trip[],
  tombstones: ItemTombstone[],
): Trip[] {
  return mergeRecordsById(a, b, (trip) => trip.completedAt, tombstones);
}

export function mergeReceipts(
  a: Receipt[],
  b: Receipt[],
  tombstones: ItemTombstone[],
): Receipt[] {
  return mergeRecordsById(a, b, (receipt) => receipt.updatedAt ?? receipt.createdAt, tombstones);
}

export function mergePriceHistory(a: PriceEntry[], b: PriceEntry[]): PriceEntry[] {
  return mergeRecordsById(a, b, (entry) => entry.paidAt, [], 1000);
}

export function mergeActivity(a: ActivityEvent[], b: ActivityEvent[]): ActivityEvent[] {
  return mergeRecordsById(a, b, (entry) => entry.createdAt, [], 200);
}

export function mergePrefs(
  remote: DurableState,
  local: DurableState,
  preferLocal: boolean,
): Pick<DurableState, 'prefs' | 'prefsUpdatedAt'> {
  const preferred = preferLocal ? local : remote;
  const keys = new Set([
    ...Object.keys(remote.prefs),
    ...Object.keys(local.prefs),
  ] as (keyof HouseholdPrefs)[]);
  const prefs = { ...preferred.prefs };
  const prefsUpdatedAt: Partial<Record<keyof HouseholdPrefs, number>> = {};
  for (const key of keys) {
    const remoteAt = remote.prefsUpdatedAt?.[key];
    const localAt = local.prefsUpdatedAt?.[key];
    if (remoteAt !== undefined || localAt !== undefined) {
      const remoteVersion = remoteAt ?? -Infinity;
      const localVersion = localAt ?? -Infinity;
      prefs[key] = (
        localVersion > remoteVersion
          ? local.prefs[key]
          : remoteVersion > localVersion
            ? remote.prefs[key]
            : deterministicWinner(remote.prefs[key], local.prefs[key])
      ) as never;
      prefsUpdatedAt[key] = Math.max(remoteVersion, localVersion);
    }
  }
  return { prefs, prefsUpdatedAt };
}
