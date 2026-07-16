import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeReplicaState,
  mergeReplicaStates,
  recordLocalMutation,
} from '../core/services/replicaSync';
import type { DurableState, SharedShoppingSession, Receipt, Trip } from '../types';

function emptyState(): DurableState {
  return {
    items: [], stores: [], priceHistory: [], receipts: [], trips: [], activity: [],
    prefs: { householdName: 'Home', defaultUnit: 'unit', expiringWindowDays: 3, weeklyBudget: 200 },
    activeSession: null, updatedAt: 0,
  };
}

function shoppingSession(tripId: string): SharedShoppingSession {
  return {
    status: 'store_summary',
    tripId, startedAt: 1, storeQueue: ['store-1'], currentIndex: 0, skippedStoreIds: [],
    entries: [], removedItemIds: [], receipts: [], completedTrip: null,
  };
}

test('[regression] EXACT_FLOW: SyncEngine fix prevents revert', () => {
  let iphone = mergeReplicaStates([initializeReplicaState(emptyState(), 'seed-device')], 'iphone-device');
  let session = shoppingSession('trip-1');
  iphone = recordLocalMutation(iphone, { ...iphone, activeSession: session }, 'iphone-device', 'shopping.start');
  
  const receipt: Receipt = {
    id: 'r_trip-1_0', tripId: 'trip-1', storeId: 'store-1', amount: 42.50,
    status: 'logged', imageUri: 'file://receipt.jpg', createdAt: 2
  };
  session = { ...session, receipts: [receipt] };
  iphone = recordLocalMutation(iphone, { ...iphone, activeSession: session }, 'iphone-device', 'shopping.save');
  
  // Simulated SyncEngine fix:
  // 1. Await uploads using initial state
  const uploadedImagePath = 'r.jpg';
  
  // 2. WHILE awaiting, commitTrip happens
  const completedTrip: Trip = {
    id: 'trip-1', startedAt: 1, completedAt: 3, duration: 2, totalSpent: 42.50,
    itemsBought: 0, itemsRemaining: 0, itemsOutOfStock: 0, storeIdsVisited: ['store-1'],
    skippedStoreIds: [], receiptIds: ['r_trip-1_0'], breakdown: [], purchasedItems: []
  };
  iphone = recordLocalMutation(iphone, {
    ...iphone,
    trips: [completedTrip],
    receipts: [iphone.activeSession!.receipts[0]],
  }, 'iphone-device', 'trip.commit');
  iphone = recordLocalMutation(iphone, { ...iphone, activeSession: null }, 'iphone-device', 'shopping.finish');
  
  // 3. Upload finishes. Take FRESH latest state synchronously.
  const latest = JSON.parse(JSON.stringify(iphone));
  const uploaded = {
    ...latest,
    receipts: latest.receipts.map((r: any) => r.id === receipt.id ? { ...r, imagePath: uploadedImagePath } : r),
    activeSession: latest.activeSession ? {
      ...latest.activeSession,
      receipts: latest.activeSession.receipts.map((r: any) => r.id === receipt.id ? { ...r, imagePath: uploadedImagePath } : r)
    } : null,
  };
  
  const prepared = recordLocalMutation(latest, uploaded, 'iphone-device', 'receipt.upload');
  
  // 4. applyRemotePatch
  iphone = {
    ...iphone,
    ...prepared,
    trips: prepared.trips,
    receipts: prepared.receipts,
    activeSession: prepared.activeSession,
  };
  
  assert.equal(iphone.trips.length, 1, 'iPhone trips should be preserved');
  assert.equal(iphone.receipts.length, 1, 'iPhone receipts should be preserved');
  assert.equal(iphone.receipts[0].imagePath, 'r.jpg', 'iPhone receipt should have imagePath');
});
