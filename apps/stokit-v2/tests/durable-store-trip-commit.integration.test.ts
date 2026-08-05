import assert from 'node:assert/strict';
import { Module } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

import { homeShoppingItems } from '../core/services/homeShoppingItems';
import { mergeDurableSnapshotForPush, reconcileServerSnapshotAfterPush } from '../core/services/mergeDurableSnapshot';
import { shoppingEntryDraftsFromAssignments } from '../core/services/shoppingStoreAssignments';
import { normalizeDurableState } from '../core/repositories/durableRepository';
import type {
  DurableState,
  PantryItem,
  Receipt,
  SharedShoppingSession,
  ShoppingStoreAssignment,
  Trip,
} from '../types';

const COSTCO = 'costco';
const SAFEWAY = 'safeway';
const TARGET = 'target';
const TRIP_ID = 'trip-commit-integration';
const EPOCH = 10;

function runtimeStub(source: string): string {
  if (source === '@react-native-async-storage/async-storage') {
    return `const values = new Map();
      export default { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value), removeItem: async (key) => values.delete(key) };`;
  }
  if (source === '@supabase/supabase-js') {
    return `const chain = () => { const value = { then: (resolve) => Promise.resolve(resolve({ data: null, error: null })), select: () => value, eq: () => value, maybeSingle: () => value, single: () => value, insert: () => value, update: () => value, delete: () => value, order: () => value, limit: () => value, channel: () => value, on: () => value, subscribe: () => value }; return value; };
      export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) }, from: () => chain(), channel: () => chain(), storage: { from: () => chain() } });
      export const processLock = async (_name, fn) => fn();
      export class FunctionsHttpError extends Error {}`;
  }
  if (source === 'react-native') {
    return `export const Platform = { OS: 'android', select: (value) => value.android ?? value.default };
      export const NativeModules = {};
      export const AppState = { addEventListener: () => ({ remove: () => {} }) };
      export const InteractionManager = { runAfterInteractions: (fn) => fn() };
      export const Alert = { alert: () => {} };
      export const Linking = {};
      export const Share = {};
      export const StyleSheet = { create: (value) => value };
      export const Dimensions = { get: () => ({ width: 0, height: 0 }) };
      export const PixelRatio = {};
      export const DeviceEventEmitter = {};
      export const NativeEventEmitter = class {};
      export const useColorScheme = () => 'light';`;
  }
  if (source === 'expo-file-system') {
    return `export const Directory = class {};
      export const File = class {};
      export const Paths = {};`;
  }
  if (source === 'base64-arraybuffer') return 'export const decode = (value) => value;';
  if (source === 'expo-widgets') return 'export const createWidget = () => ({});';
  return `const value = (..._args) => value;
    export default value;
    export const ActivityIndicator = value;
    export const Alert = value;
    export const Animated = value;
    export const Image = value;
    export const Pressable = value;
    export const SafeAreaView = value;
    export const ScrollView = value;
    export const StyleSheet = { create: (input) => input };
    export const Text = value;
    export const TextInput = value;
    export const View = value;
    export const VStack = value;
    export const jsx = value;
    export const jsxs = value;
    export const Fragment = value;
    export const containerBackground = value;
    export const font = value;
    export const foregroundStyle = value;
    export const lineLimit = value;
    export const padding = value;
    export const widgetURL = value;
    export const create = value;
    export const decode = value;
    export const encode = value;
    export const processLock = value;
    export const requestPermissionsAsync = value;
    export const getCurrentPositionAsync = value;
    export const getForegroundPermissionsAsync = value;
    export const getBackgroundPermissionsAsync = value;
    export const getLastKnownPositionAsync = value;
    export const setNotificationHandler = value;
    export const addNotificationResponseReceivedListener = value;
    export const scheduleNotificationAsync = value;
    export const cancelScheduledNotificationAsync = value;
    export const isAvailableAsync = value;`;
}

async function loadDurableStore() {
  const result = await build({
    absWorkingDir: join(process.cwd()),
    entryPoints: [join(process.cwd(), 'store/durable-store.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [{
      name: 'native-runtime-stubs',
      setup(plugin) {
        plugin.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
        plugin.onResolve({ filter: /^zustand(?:\/.*)?$/ }, (args) => ({ path: args.path, external: true }));
        plugin.onResolve({ filter: /widgets\/(?:LowStockWidget|QuickScanWidget)$/ }, (args) => ({ path: args.path, namespace: 'runtime-stub' }));
        plugin.onResolve({ filter: /^[^./]/ }, (args) => ({ path: args.path, namespace: 'runtime-stub' }));
        plugin.onLoad({ filter: /.*/, namespace: 'runtime-stub' }, (args) => ({
          contents: runtimeStub(args.path),
          loader: 'js',
        }));
      },
    }],
  });
  const runtimeModule = new Module(join(process.cwd(), 'store/durable-store.ts'));
  (runtimeModule as Module & { paths: string[] }).paths = (Module as typeof Module & {
    _nodeModulePaths: (path: string) => string[];
  })._nodeModulePaths(process.cwd());
  (runtimeModule as Module & { _compile: (code: string, filename: string) => void })._compile(
    result.outputFiles[0].text,
    join(process.cwd(), 'store/durable-store.ts'),
  );
  return (runtimeModule as Module & { exports: { useDurableStore: { getState: () => DurableState & { commitTrip: (trip: Trip, receipts: Receipt[]) => void }; setState: (state: Partial<DurableState>) => void } } }).exports.useDurableStore;
}

function makeItem(id: string, storeId: string | null): PantryItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: 'unit',
    status: 'low',
    storageLocation: 'pantry',
    storeId,
    expiryDate: null,
    createdAt: 1,
    updatedAt: 100,
    statusUpdatedAt: 100,
    statusRevision: 4,
  };
}

function makeAssignment(
  itemId: string,
  storeId: string,
  overrides: Partial<ShoppingStoreAssignment> = {},
): ShoppingStoreAssignment {
  return {
    id: `shopping-store:${itemId}:${storeId}`,
    pantryItemId: itemId,
    storeId,
    active: true,
    updatedAt: 100,
    revision: 4,
    assignmentBasedOnShoppingEpoch: EPOCH,
    assignmentBasedOnActiveTripId: TRIP_ID,
    ...overrides,
  };
}

function makeTrip(purchasedPairs: readonly (readonly [string, string])[]): Trip {
  return {
    id: TRIP_ID,
    storeIdsVisited: [COSTCO, SAFEWAY],
    skippedStoreIds: [],
    itemsBought: purchasedPairs.length,
    itemsRemaining: 0,
    itemsOutOfStock: 0,
    receiptIds: ['receipt-costco', 'receipt-safeway'],
    totalSpent: 99,
    breakdown: [],
    purchasedItems: purchasedPairs.map(([itemId, storeId]) => ({
      itemId,
      name: itemId,
      storeId,
      price: 0,
    })),
    startedAt: 100,
    completedAt: 200,
    duration: 100,
  };
}

function makeReceipt(id: string, tripId: string, storeId: string): Receipt {
  return {
    id,
    tripId,
    storeId,
    amount: 10,
    status: 'logged',
    createdAt: 200,
    items: [],
  };
}

async function commitProductionShape() {
  const store = await loadDurableStore();
  const purchasedPairs = [
    ...Array.from({ length: 2 }, (_, index) => [`costco-purchased-${index}`, COSTCO] as const),
    ...Array.from({ length: 8 }, (_, index) => [`safeway-purchased-${index}`, SAFEWAY] as const),
  ];
  const missingPairs = [
    ...Array.from({ length: 34 }, (_, index) => [`costco-missing-${index}`, COSTCO] as const),
    ['other-epoch', COSTCO] as const,
    ...Array.from({ length: 30 }, (_, index) => [`safeway-missing-${index}`, SAFEWAY] as const),
    ['other-trip', SAFEWAY] as const,
    ['dual-missing', COSTCO] as const,
    ['dual-missing', SAFEWAY] as const,
  ];
  const currentPairs = [...purchasedPairs, ...missingPairs];
  assert.equal(currentPairs.length, 78);
  assert.equal(purchasedPairs.length, 10);
  assert.equal(missingPairs.length, 68);
  const extraPairs = [
    ['other-trip', SAFEWAY] as const,
    ['other-epoch', TARGET] as const,
    ['unvisited', TARGET] as const,
  ];
  const assignments = [
    ...currentPairs.map(([itemId, storeId]) => makeAssignment(itemId, storeId)),
    makeAssignment('other-trip', COSTCO, { assignmentBasedOnActiveTripId: 'other-trip' }),
    makeAssignment('other-epoch', TARGET, { assignmentBasedOnShoppingEpoch: EPOCH + 1 }),
    makeAssignment('unvisited', TARGET),
  ];
  const itemIds = [...new Set([...currentPairs, ...extraPairs].map(([itemId]) => itemId))];
  const items = itemIds.map((itemId) => makeItem(itemId, currentPairs.find(([id]) => id === itemId)?.[1] ?? TARGET));
  const oldTrip: Trip = { ...makeTrip([]), id: 'old-trip', storeIdsVisited: [TARGET] };
  const oldReceipt = makeReceipt('old-receipt', oldTrip.id, TARGET);
  const trip = makeTrip(purchasedPairs);
  const receipts = [makeReceipt('receipt-costco', TRIP_ID, COSTCO), makeReceipt('receipt-safeway', TRIP_ID, SAFEWAY)];
  const activeSession: SharedShoppingSession = {
    status: 'shopping_store',
    tripId: TRIP_ID,
    startedAt: 100,
    storeQueue: [COSTCO, SAFEWAY],
    currentIndex: 1,
    skippedStoreIds: [],
    entries: purchasedPairs.map(([itemId, storeId], index) => ({
      entryId: `entry-${index}`,
      pantryItemId: itemId,
      stopId: `stop-${storeId}`,
      name: itemId,
      quantity: 1,
      unit: 'unit',
      storeId,
      picked: true,
    })),
    receipts: [],
    completedTrip: null,
  };
  const before: DurableState = {
    items,
    stores: [],
    priceHistory: [],
    receipts: [oldReceipt],
    trips: [oldTrip],
    activity: [],
    prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 0 },
    activeSession,
    shoppingEpoch: EPOCH,
    activeTripId: TRIP_ID,
    shoppingStoreAssignments: assignments,
    updatedAt: 100,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [],
  };
  const preCommit = JSON.parse(JSON.stringify(before)) as DurableState;
  store.setState(before);
  store.getState().commitTrip(trip, receipts);
  return {
    store,
    before: preCommit,
    after: store.getState() as DurableState,
    trip,
    receipts,
    oldTrip,
    oldReceipt,
    purchasedPairs,
    missingPairs,
  };
}

test('real commitTrip closes the production 78-pair shape and survives restart normalization', async () => {
  const { after, trip, receipts, oldTrip, oldReceipt, purchasedPairs, missingPairs } = await commitProductionShape();

  assert.equal(after.activeSession, null);
  assert.equal(after.activeTripId, null);
  assert.equal(after.shoppingEpoch, EPOCH);
  assert.deepEqual(after.receipts, [receipts[0], receipts[1], oldReceipt]);
  assert.deepEqual(after.trips, [trip, oldTrip]);

  const currentAssignment = (itemId: string, storeId: string) =>
    after.shoppingStoreAssignments?.find((assignment) => assignment.pantryItemId === itemId && assignment.storeId === storeId);
  for (const [itemId, storeId] of purchasedPairs) {
    assert.equal(currentAssignment(itemId, storeId)?.active, false);
    assert.equal(currentAssignment(itemId, storeId)?.closedTripId, TRIP_ID);
    assert.equal(after.items.find((item) => item.id === itemId)?.statusClosedTripId, TRIP_ID);
  }
  for (const [itemId, storeId] of missingPairs) {
    assert.equal(currentAssignment(itemId, storeId)?.active, false);
    assert.equal(after.items.find((item) => item.id === itemId)?.status, 'low');
  }
  assert.equal(currentAssignment('dual-missing', COSTCO)?.active, false);
  assert.equal(currentAssignment('dual-missing', SAFEWAY)?.active, false);
  assert.equal(currentAssignment('other-trip', COSTCO)?.active, true);
  assert.equal(currentAssignment('other-epoch', TARGET)?.active, true);
  assert.equal(currentAssignment('unvisited', TARGET)?.active, true);
  assert.equal(after.items.find((item) => item.id === 'other-trip')?.storeId, COSTCO);
  assert.equal(after.items.find((item) => item.id === 'other-epoch')?.storeId, TARGET);
  assert.equal(after.items.find((item) => item.id === 'unvisited')?.storeId, TARGET);

  const drafts = shoppingEntryDraftsFromAssignments(after.items, after.shoppingStoreAssignments);
  const closedNeedIds = new Set<string>(missingPairs.map(([itemId]) => itemId).filter((itemId) => itemId !== 'other-trip'));
  assert.equal(drafts.some((draft) => closedNeedIds.has(draft.pantryItemId)
    && (draft.storeId === COSTCO || draft.storeId === SAFEWAY)), false);
  const home = homeShoppingItems(after.items, after.shoppingStoreAssignments ?? [], []);
  assert.equal(home.some((entry) => closedNeedIds.has(entry.pantryItem.id)
    && (entry.storeId === COSTCO || entry.storeId === SAFEWAY)), false);

  const restarted = normalizeDurableState(JSON.parse(JSON.stringify(after)));
  assert.equal(restarted.activeSession, null);
  assert.equal(restarted.activeTripId, null);
  assert.equal(shoppingEntryDraftsFromAssignments(restarted.items, restarted.shoppingStoreAssignments)
    .some((draft) => closedNeedIds.has(draft.pantryItemId)
      && (draft.storeId === COSTCO || draft.storeId === SAFEWAY)), false);
});

test('stale pre-commit snapshots cannot resurrect the 68 released assignments', async () => {
  const { before, after, trip, receipts, purchasedPairs, missingPairs } = await commitProductionShape();
  const closedNeedIds = new Set<string>(missingPairs.map(([itemId]) => itemId).filter((itemId) => itemId !== 'other-trip'));

  for (const [remote, local] of [[before, after], [after, before]] as const) {
    const merged = mergeDurableSnapshotForPush(remote, local);
    const adopted = reconcileServerSnapshotAfterPush(merged, before, before).state;
    assert.equal(adopted.activeSession, null);
    assert.equal(adopted.activeTripId, null);
    assert.equal(adopted.shoppingEpoch, EPOCH);
    assert.deepEqual(adopted.receipts?.toSorted((a, b) => a.id.localeCompare(b.id)),
      after.receipts?.toSorted((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(adopted.trips?.toSorted((a, b) => a.id.localeCompare(b.id)),
      after.trips?.toSorted((a, b) => a.id.localeCompare(b.id)));
    for (const [itemId, storeId] of missingPairs) {
      assert.equal(adopted.shoppingStoreAssignments?.find((assignment) =>
        assignment.pantryItemId === itemId && assignment.storeId === storeId)?.active, false);
    }
    for (const [itemId, storeId] of purchasedPairs) {
      assert.equal(adopted.shoppingStoreAssignments?.find((assignment) =>
        assignment.pantryItemId === itemId && assignment.storeId === storeId)?.closedTripId, TRIP_ID);
      assert.equal(adopted.items.find((item) => item.id === itemId)?.statusClosedTripId, TRIP_ID);
    }
    const drafts = shoppingEntryDraftsFromAssignments(adopted.items, adopted.shoppingStoreAssignments);
    assert.equal(drafts.some((draft) => closedNeedIds.has(draft.pantryItemId)
      && (draft.storeId === COSTCO || draft.storeId === SAFEWAY)), false);
    const restarted = normalizeDurableState(JSON.parse(JSON.stringify(adopted)));
    assert.equal(restarted.activeSession, null);
    assert.equal(restarted.activeTripId, null);
    assert.equal(shoppingEntryDraftsFromAssignments(restarted.items, restarted.shoppingStoreAssignments)
      .some((draft) => closedNeedIds.has(draft.pantryItemId)
        && (draft.storeId === COSTCO || draft.storeId === SAFEWAY)), false);
  }
  assert.equal(trip.purchasedItems.length, 10);
  assert.equal(receipts.length, 2);
});

test('same-trip unpurchased expiring items are released without purchase markers', async () => {
  const store = await loadDurableStore();
  const item = { ...makeItem('expiring-missing', COSTCO), status: 'expiring' as const };
  const assignment = makeAssignment(item.id, COSTCO);
  const trip = makeTrip([]);
  const before: DurableState = {
    items: [item],
    stores: [],
    priceHistory: [],
    receipts: [],
    trips: [],
    activity: [],
    prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 0 },
    activeSession: {
      status: 'shopping_store',
      tripId: TRIP_ID,
      startedAt: 100,
      storeQueue: [COSTCO],
      currentIndex: 0,
      skippedStoreIds: [],
      entries: [],
      receipts: [],
      completedTrip: null,
    },
    shoppingEpoch: EPOCH,
    activeTripId: TRIP_ID,
    shoppingStoreAssignments: [assignment],
    updatedAt: 100,
    deletedItems: [],
    deletedStores: [],
    deletedTrips: [],
    deletedReceipts: [],
    closedTripIds: [],
  };
  store.setState(before);
  store.getState().commitTrip(trip, []);
  const after = store.getState() as DurableState;
  const released = after.shoppingStoreAssignments?.find((candidate) => candidate.id === assignment.id);
  const committedItem = after.items.find((candidate) => candidate.id === item.id);
  assert.equal(released?.active, false);
  assert.equal(committedItem?.status, 'expiring');
  assert.equal(committedItem?.statusClosedTripId, undefined);
  assert.equal(committedItem?.statusBasedOnClosedTripId, undefined);
  assert.equal(committedItem?.storeId, null);
});
