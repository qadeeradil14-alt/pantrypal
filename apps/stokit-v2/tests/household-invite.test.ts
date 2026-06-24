import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALREADY_IN_HOUSEHOLD_MESSAGE,
  LEAVE_CURRENT_HOUSEHOLD_FIRST_MESSAGE,
  STALE_INVITE_CODE_MESSAGE,
  joinHouseholdErrorMessage,
} from '../core/services/household';

test('maps stale invite code errors to renewal copy', () => {
  assert.deepEqual(joinHouseholdErrorMessage('Invalid invite code'), {
    message: STALE_INVITE_CODE_MESSAGE,
    invalidCode: true,
  });
});

test('keeps explicit already-member copy available to the join flow', () => {
  assert.equal(ALREADY_IN_HOUSEHOLD_MESSAGE, 'This person is already in your household.');
});

test('maps cross-household join rejection to an actionable leave-first message', () => {
  assert.deepEqual(
    joinHouseholdErrorMessage('Leave your current shared household before joining another'),
    { message: LEAVE_CURRENT_HOUSEHOLD_FIRST_MESSAGE, invalidCode: false },
  );
});
