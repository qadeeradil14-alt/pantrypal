import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialSession, reduce } from '../core/shopping-machine';
import {
  canOperateShoppingSession,
  isOperationalShoppingEvent,
} from '../core/services/shoppingAccess';
import type { ShoppingEntry } from '../types';

const entry: ShoppingEntry = {
  itemId: 'banana',
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
});

test('only the selected shopper can perform shopping operations', () => {
  assert.equal(canOperateShoppingSession('member-shopper', 'member-shopper'), true);
  assert.equal(canOperateShoppingSession('member-shopper', 'member-peer'), false);
  assert.equal(canOperateShoppingSession('member-shopper', null), false);

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
    assert.equal(isOperationalShoppingEvent(type), true, `${type} must be owner-only`);
  }

  assert.equal(isOperationalShoppingEvent('START_TRIP'), false);
  assert.equal(isOperationalShoppingEvent('ADD_ENTRY'), false);
});

test('Shopping entry renders member avatars, visual store cards, and peer read-only state', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/(tabs)/shopping.tsx'),
    'utf8',
  );

  assert.match(source, /Who[’']s shopping today\?/);
  assert.match(source, /Where are you shopping first\?/);
  assert.match(source, /<Avatar/);
  assert.match(source, /<StoreChip/);
  assert.match(source, /is shopping/);
  assert.match(source, /read-only/i);
  assert.match(source, /shopperId/);
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

test('session store rejects owner-only events from another household member', () => {
  const source = readFileSync(
    join(process.cwd(), 'store/session-store.ts'),
    'utf8',
  );

  assert.match(source, /isOperationalShoppingEvent/);
  assert.match(source, /canOperateShoppingSession/);
  assert.match(source, /members\.find\(\(member\) => member\.isMe\)/);
});
