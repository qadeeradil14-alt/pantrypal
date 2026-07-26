import type { ShoppingEvent } from '../shopping-machine';

const OPERATIONAL_EVENTS = new Set<ShoppingEvent['type']>([
  'TOGGLE_PICK',
  'SET_PICK',
  'FINISH_STORE',
  'SAVE_RECEIPT',
  'SKIP_RECEIPT',
  'ACKNOWLEDGE_SUMMARY',
  'CONTINUE_TRIP',
  'START_MANUAL_STORE',
  'FINISH_TRIP',
  'CHOOSE_NEXT_STORE',
  'SKIP_STORE',
  'FINISH_TRIP_EARLY',
  'ADVANCE_STORE',
  'END_TRIP',
  'REMOVE_ENTRY',
  'RESUME_TRIP',
  'MARK_OUT_OF_STOCK',
  'UNSKIP_STORE',
  'UPDATE_QUANTITY',
]);

export function canOperateShoppingSession(
  shopperId: string | null | undefined,
  localMemberId: string | null | undefined,
): boolean {
  return !shopperId || shopperId === localMemberId;
}

export function isOperationalShoppingEvent(type: ShoppingEvent['type']): boolean {
  return OPERATIONAL_EVENTS.has(type);
}
