import type { ShoppingEvent } from '../shopping-machine';
import type { HouseholdIdentity } from '../../types';

const ITEM_MUTATION_EVENTS = new Set<ShoppingEvent['type']>([
  'ADD_ENTRY',
  'REMOVE_ENTRY',
  'UPDATE_QUANTITY',
]);

const PICKED_STATE_EVENTS = new Set<ShoppingEvent['type']>([
  'TOGGLE_PICK',
  'SET_PICK',
  'MARK_OUT_OF_STOCK',
]);

const TRIP_LIFECYCLE_EVENTS = new Set<ShoppingEvent['type']>([
  'FINISH_STORE',
  'SAVE_RECEIPT',
  'SKIP_RECEIPT',
  'ACKNOWLEDGE_SUMMARY',
  'REOPEN_STORE',
  'CONTINUE_TRIP',
  'START_MANUAL_STORE',
  'FINISH_TRIP',
  'CHOOSE_NEXT_STORE',
  'SKIP_STORE',
  'FINISH_TRIP_EARLY',
  'ADVANCE_STORE',
  'END_TRIP',
  'UNSKIP_STORE',
]);

export type ShoppingCapabilities = {
  canStartTrip: boolean;
  canEditItems: boolean;
  canChangePickedState: boolean;
  canManageTripLifecycle: boolean;
  canLogPrices: boolean;
  canManageHousehold: boolean;
};

export function canOperateShoppingSession(
  shopperId: string | null | undefined,
  localMemberId: string | null | undefined,
): boolean {
  return !shopperId || shopperId === localMemberId;
}

export function shoppingCapabilities(
  shopperId: string | null | undefined,
  localMemberId: string | null | undefined,
  role: HouseholdIdentity['role'] | null | undefined,
): ShoppingCapabilities {
  const isOwner = role === 'owner';
  const isSelectedShopper = Boolean(localMemberId) && (
    shopperId ? shopperId === localMemberId : true
  );
  return {
    canStartTrip: isOwner,
    canEditItems: Boolean(localMemberId),
    canChangePickedState: isSelectedShopper,
    canManageTripLifecycle: isSelectedShopper,
    canLogPrices: isSelectedShopper,
    canManageHousehold: isOwner,
  };
}

export function canDispatchShoppingEvent(
  type: ShoppingEvent['type'],
  capabilities: ShoppingCapabilities,
): boolean {
  if (type === 'START_TRIP') return capabilities.canStartTrip;
  if (ITEM_MUTATION_EVENTS.has(type)) return capabilities.canEditItems;
  if (PICKED_STATE_EVENTS.has(type)) return capabilities.canChangePickedState;
  if (TRIP_LIFECYCLE_EVENTS.has(type)) return capabilities.canManageTripLifecycle;
  return false;
}
