import assert from 'node:assert/strict';
import test from 'node:test';
import { isExistingAccountSignUpResponse } from '../core/services/authResponses';

test('detects Supabase existing-account sign-up response without claiming email was sent', () => {
  assert.equal(isExistingAccountSignUpResponse({
    session: null,
    user: { identities: [] },
  }), true);
});

test('does not treat new sign-up identity as an existing account', () => {
  assert.equal(isExistingAccountSignUpResponse({
    session: null,
    user: { identities: [{ id: 'new' }] },
  }), false);
});
