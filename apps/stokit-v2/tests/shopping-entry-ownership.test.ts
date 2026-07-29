import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialSession, reduce } from '../core/shopping-machine';
import {
  canOperateShoppingSession,
  canDispatchShoppingEvent,
  shoppingCapabilities,
} from '../core/services/shoppingAccess';
import type { ShoppingEntry } from '../types';

const entry: ShoppingEntry = {
  entryId: 'banana',
  pantryItemId: 'banana',
  stopId: 'stop:trip:fair-price:1',
  name: 'Banana',
  quantity: 1,
  unit: 'unit',
  storeId: 'fair-price',
  picked: false,
};

test('START_TRIP records the selected shopper on the active session', () => {
  const session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [entry],
    now: 100,
    shopperId: 'member-shopper',
  });

  assert.equal(session.shopperId, 'member-shopper');
});

test('legacy sessions without an owner remain operable', () => {
  const session = reduce(initialSession, {
    type: 'START_TRIP',
    entries: [entry],
    now: 100,
  });

  assert.equal(session.shopperId, null);
  assert.equal(canOperateShoppingSession(session.shopperId, 'member-peer'), true);
  assert.equal(
    shoppingCapabilities(session.shopperId, 'member-peer', 'member').canManageTripLifecycle,
    true,
  );
});

test('only the selected shopper can perform picked-state and lifecycle operations', () => {
  assert.equal(canOperateShoppingSession('member-shopper', 'member-shopper'), true);
  assert.equal(canOperateShoppingSession('member-shopper', 'member-peer'), false);
  assert.equal(canOperateShoppingSession('member-shopper', null), false);

  const shopper = shoppingCapabilities('member-shopper', 'member-shopper', 'member');
  const collaborator = shoppingCapabilities('member-shopper', 'member-peer', 'member');

  for (const type of [
    'TOGGLE_PICK',
    'SET_PICK',
    'FINISH_STORE',
    'SAVE_RECEIPT',
    'SKIP_RECEIPT',
    'FINISH_TRIP',
    'FINISH_TRIP_EARLY',
    'END_TRIP',
  ] as const) {
    assert.equal(canDispatchShoppingEvent(type, shopper), true, `${type} must remain available to the selected shopper`);
    assert.equal(canDispatchShoppingEvent(type, collaborator), false, `${type} must remain blocked for collaborators`);
  }
});

test('household collaborators can edit items without receiving trip controls', () => {
  const collaborator = shoppingCapabilities('owner-shopper', 'member-peer', 'member');

  assert.equal(collaborator.canEditItems, true);
  assert.equal(collaborator.canChangePickedState, false);
  assert.equal(collaborator.canManageTripLifecycle, false);
  assert.equal(collaborator.canLogPrices, false);
  assert.equal(collaborator.canStartTrip, false);

  for (const type of ['ADD_ENTRY', 'REMOVE_ENTRY', 'UPDATE_QUANTITY'] as const) {
    assert.equal(canDispatchShoppingEvent(type, collaborator), true, `${type} must be a permitted item mutation`);
  }
});

test('only an owner can start a trip and choose the active shopper', () => {
  const owner = shoppingCapabilities(null, 'owner-user', 'owner');
  const member = shoppingCapabilities(null, 'member-user', 'member');

  assert.equal(canDispatchShoppingEvent('START_TRIP', owner), true);
  assert.equal(canDispatchShoppingEvent('START_TRIP', member), false);
  assert.equal(owner.canManageHousehold, true);
  assert.equal(member.canManageHousehold, false);
});

test('Shopping entry renders member avatars, visual store cards, and collaborative peer state', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/(tabs)/shopping.tsx'),
    'utf8',
  );

  assert.match(source, /Who[’']s shopping today\?/);
  assert.match(source, /Where are you shopping first\?/);
  assert.match(source, /<Avatar/);
  assert.match(source, /<StoreChip/);
  assert.match(source, /is shopping/);
  assert.match(source, /Shopping with/);
  assert.doesNotMatch(source, />READ-ONLY</i);
  assert.match(source, /shopperId/);
  assert.match(source, /canEditItems/);
  assert.match(source, /canManageTripLifecycle/);
});

test('Shopping entry keeps selection separate from navigation and shows a preparing transition', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/(tabs)/shopping.tsx'),
    'utf8',
  );

  assert.match(source, /Who[’']s shopping today\?/);
  assert.match(source, /Select who will lead this shopping trip\./);
  assert.match(source, /member\.role/);
  assert.match(source, /member\.isMe[^]*>You</);
  assert.match(source, /setSelectedShopperId\(localMember\?\.id/);
  assert.match(source, /label="Continue"/);
  assert.match(source, /disabled=\{!selectedShopperId\}/);
  assert.match(source, /selectedStoreId/);
  assert.match(source, /label="Start Shopping"/);
  assert.match(source, /disabled=\{!selectedStoreId\}/);
  assert.match(source, /Preparing your shopping trip\.\.\./);
  assert.match(source, /setTimeout\([^]*400\)/);
  assert.match(source, /startTripAt\(storeId, false, shopperId\)/);
});

test('Shopping entry preserves Screen safe-area top padding on both chooser screens', () => {
  const shoppingSource = readFileSync(
    join(process.cwd(), 'app/(tabs)/shopping.tsx'),
    'utf8',
  );
  const screenSource = readFileSync(
    join(process.cwd(), 'components/shared/Screen.tsx'),
    'utf8',
  );
  const entryScreenStyle = shoppingSource.match(/entryScreen:\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.equal(
    shoppingSource.match(/<Screen contentStyle=\{nsStyles\.entryScreen\}>/g)?.length,
    2,
  );
  assert.match(screenSource, /paddingTop: padTop/);
  assert.doesNotMatch(entryScreenStyle, /paddingTop/);
});

test('session store separates item mutations from picked-state and lifecycle permissions', () => {
  const source = readFileSync(
    join(process.cwd(), 'store/session-store.ts'),
    'utf8',
  );

  assert.match(source, /canDispatchShoppingEvent/);
  assert.match(source, /shoppingCapabilities/);
  assert.match(source, /members\.find\(\(member\) => member\.isMe\)/);
});
