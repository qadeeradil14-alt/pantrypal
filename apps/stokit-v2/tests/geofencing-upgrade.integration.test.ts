import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSingleFlight,
  decideStoreArrival,
  evaluateArrivalSample,
  regionFingerprint,
  seedExitStateFromDiagnostics,
} from '../core/services/geofencingLogic';
import type { PantryItem, Store } from '../types';

const LAST_ENTER_KEY = 'stokit:v2:geofence:last-enter';
const LAST_EXIT_KEY = 'stokit:v2:geofence:last-exit';
const EXIT_GATE_MIGRATED_KEY = 'stokit:v2:geofence:exit-gate-migrated';
const DIAGNOSTICS_KEY = 'stokit:v2:geofence:diagnostics';

const STORE: Store = { id: 'walmart', name: 'Walmart', lat: 40.7128, lng: -74.006, createdAt: 0, updatedAt: 0 };
const OTHER_STORE: Store = { id: 'aldi', name: 'Aldi', lat: 40.713, lng: -74.007, createdAt: 0, updatedAt: 0 };
const ITEMS: PantryItem[] = [{
  id: 'milk',
  name: 'Milk',
  status: 'low',
  storeId: STORE.id,
} as PantryItem];

class MemoryAsyncStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

type SuppressionReason = 'rejected_speed' | 'rejected_accuracy' | 'no_exit_since_last_arrival' | 'cooldown' | null;

class UpgradeArrivalHarness {
  notifications = 0;
  lastSuppressionReason: SuppressionReason = null;

  constructor(private readonly storage: MemoryAsyncStorage) {}

  private async readMap(key: string): Promise<Record<string, number>> {
    const raw = await this.storage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  }

  private async readMarkers(): Promise<Record<string, boolean>> {
    const raw = await this.storage.getItem(EXIT_GATE_MIGRATED_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  private async writeMap(key: string, value: Record<string, number>): Promise<void> {
    await this.storage.setItem(key, JSON.stringify(value));
  }

  private async persistAcceptedArrival(storeId: string, at: number): Promise<void> {
    const arrivals = await this.readMap(LAST_ENTER_KEY);
    arrivals[storeId] = at;
    await this.writeMap(LAST_ENTER_KEY, arrivals);
    const markers = await this.readMarkers();
    markers[storeId] = true;
    await this.storage.setItem(EXIT_GATE_MIGRATED_KEY, JSON.stringify(markers));
  }

  async recordExit(storeId: string, at: number): Promise<void> {
    const exits = await this.readMap(LAST_EXIT_KEY);
    exits[storeId] = at;
    await this.writeMap(LAST_EXIT_KEY, exits);
  }

  async arrive(at: number, sample = { speedMps: 0, accuracyM: 10 }): Promise<boolean> {
    const lastArrivalAt = await this.readMap(LAST_ENTER_KEY);
    const persistedExitAt = await this.readMap(LAST_EXIT_KEY);
    const diagnostics = JSON.parse(await this.storage.getItem(DIAGNOSTICS_KEY) ?? '{"stores":[]}') as {
      stores: Array<{ id: string; lastExitAt: number | null }>;
    };
    const lastExitAt = seedExitStateFromDiagnostics(persistedExitAt, diagnostics.stores);
    if (Object.keys(lastExitAt).length !== Object.keys(persistedExitAt).length) {
      await this.writeMap(LAST_EXIT_KEY, lastExitAt);
    }
    const decision = decideStoreArrival({
      lat: STORE.lat!,
      lng: STORE.lng!,
      stores: [STORE],
      items: ITEMS,
      radiusMetres: 150,
      cooldownMs: 60_000,
      lastArrivalAt,
      lastExitAt,
      exitGateMigrated: await this.readMarkers(),
      now: at,
    });
    if (!decision.accepted) {
      this.lastSuppressionReason = decision.reason === 'cooldown' ? 'cooldown' : 'no_exit_since_last_arrival';
      return false;
    }

    const confidence = evaluateArrivalSample(
      { ...sample, distanceM: decision.distanceMetres ?? Infinity },
      { maxAccuracyM: 60, speedThresholdMps: 5, arrivalRadiusM: 150, isFirstSample: true, budgetExpired: false },
    );
    if (confidence.decision !== 'accept') {
      this.lastSuppressionReason = confidence.reason === 'rejected_accuracy' ? 'rejected_accuracy' : 'rejected_speed';
      return false;
    }

    await this.persistAcceptedArrival(STORE.id, at);
    this.notifications += 1;
    this.lastSuppressionReason = null;
    return true;
  }
}

test('upgrade path A preserves old state, grandfathers one valid arrival, then requires EXIT across restarts', async () => {
  const storage = new MemoryAsyncStorage();
  const oldArrival = 1_700_000_000_000;
  await storage.setItem(LAST_ENTER_KEY, JSON.stringify({ walmart: oldArrival }));
  await storage.setItem(DIAGNOSTICS_KEY, JSON.stringify({ stores: [{ id: 'walmart', lastExitAt: null }] }));
  const upgraded = new UpgradeArrivalHarness(storage);

  assert.equal(await upgraded.arrive(oldArrival + 61_000, { speedMps: 8, accuracyM: 10 }), false);
  assert.equal(upgraded.lastSuppressionReason, 'rejected_speed');
  assert.equal(await upgraded.arrive(oldArrival + 62_000, { speedMps: 0, accuracyM: 61 }), false);
  assert.equal(upgraded.lastSuppressionReason, 'rejected_accuracy');
  assert.equal(await upgraded.arrive(oldArrival + 63_000), true, 'the valid post-upgrade arrival is grandfathered once');
  assert.equal(upgraded.notifications, 1);
  assert.deepEqual(JSON.parse(await storage.getItem(LAST_ENTER_KEY) ?? '{}'), { walmart: oldArrival + 63_000 }, 'no broad reset');
  assert.deepEqual(JSON.parse(await storage.getItem(EXIT_GATE_MIGRATED_KEY) ?? '{}'), { walmart: true });

  const afterRestart = new UpgradeArrivalHarness(storage);
  assert.equal(await afterRestart.arrive(oldArrival + 130_000), false);
  assert.equal(afterRestart.lastSuppressionReason, 'no_exit_since_last_arrival');
  assert.equal(afterRestart.notifications, 0, 'a suppressed duplicate never reaches notification');

  await afterRestart.recordExit(STORE.id, oldArrival + 150_000);
  const afterExitRestart = new UpgradeArrivalHarness(storage);
  assert.equal(await afterExitRestart.arrive(oldArrival + 220_000), true);
  await afterExitRestart.recordExit(STORE.id, oldArrival + 221_000);
  assert.equal(await afterExitRestart.arrive(oldArrival + 222_000), false, 'cooldown still applies after a real EXIT');
  assert.equal(afterExitRestart.lastSuppressionReason, 'cooldown');
});

test('upgrade path B seeds valid legacy exit evidence without overwriting dedicated state or crossing stores', async () => {
  const storage = new MemoryAsyncStorage();
  const priorArrival = 1_700_100_000_000;
  await storage.setItem(LAST_ENTER_KEY, JSON.stringify({ walmart: priorArrival, aldi: priorArrival }));
  await storage.setItem(DIAGNOSTICS_KEY, JSON.stringify({
    stores: [
      { id: 'walmart', lastExitAt: priorArrival + 10_000 },
      { id: 'aldi', lastExitAt: null },
    ],
  }));
  const upgraded = new UpgradeArrivalHarness(storage);

  assert.equal(await upgraded.arrive(priorArrival + 70_000), true, 'legacy exit evidence opens the gate');
  assert.equal(upgraded.notifications, 1);
  assert.deepEqual(JSON.parse(await storage.getItem(LAST_EXIT_KEY) ?? '{}'), { walmart: priorArrival + 10_000 }, 'legacy exit evidence is migrated into dedicated storage');

  await storage.setItem(LAST_EXIT_KEY, JSON.stringify({ walmart: priorArrival + 5_000 }));
  const dedicatedWins = seedExitStateFromDiagnostics(
    JSON.parse(await storage.getItem(LAST_EXIT_KEY) ?? '{}'),
    [{ id: 'walmart', lastExitAt: priorArrival + 10_000 }],
  );
  assert.equal(dedicatedWins.walmart, priorArrival + 5_000, 'dedicated exit state remains authoritative');

  const otherStore = decideStoreArrival({
    lat: OTHER_STORE.lat!, lng: OTHER_STORE.lng!, stores: [OTHER_STORE],
    items: [{ ...ITEMS[0], storeId: OTHER_STORE.id }], radiusMetres: 150, cooldownMs: 60_000,
    lastArrivalAt: { aldi: priorArrival }, lastExitAt: {}, exitGateMigrated: { walmart: true }, now: priorArrival + 70_000,
  });
  assert.equal(otherStore.accepted, true, 'migration remains per-store');
});

test('refresh controls keep native work deterministic through unchanged, changed, failure, and zero-store paths', async () => {
  const regionA = { identifier: 'walmart', latitude: 1, longitude: 2, radius: 100, notifyOnEnter: true, notifyOnExit: true };
  const regionB = { identifier: 'aldi', latitude: 3, longitude: 4, radius: 100, notifyOnEnter: true, notifyOnExit: true };
  let nativeCycles = 0;
  let activeFingerprint: string | null = null;
  const singleFlight = createSingleFlight<void>();
  const refresh = (regions: typeof regionA[], fail = false) => singleFlight(async () => {
    const fingerprint = regionFingerprint(regions);
    if (fingerprint === activeFingerprint) return;
    nativeCycles += 1;
    if (fail) throw new Error('native failure');
    activeFingerprint = regions.length === 0 ? null : fingerprint;
  });

  await Promise.all([refresh([regionA]), refresh([regionA])]);
  await refresh([regionA]);
  await refresh([{ ...regionA, latitude: 9 }]);
  await assert.rejects(() => refresh([regionB], true), /native failure/);
  await refresh([regionB]);
  await refresh([]);
  assert.equal(nativeCycles, 5, 'one concurrent cycle; unchanged skip; changed, recovered failure, and teardown cycles run');
  assert.equal(activeFingerprint, null, 'zero-store teardown clears the native-registration fingerprint');
});
