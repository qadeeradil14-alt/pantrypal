import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const edgeFn = fs.readFileSync(
  path.join(__dirname, '../../../supabase/functions/delete-account/index.ts'),
  'utf-8',
);
const authStore = fs.readFileSync(path.join(__dirname, '../store/auth-store.ts'), 'utf-8');
const accountSettings = fs.readFileSync(path.join(__dirname, '../app/settings/account.tsx'), 'utf-8');

// ── Edge Function policy ──────────────────────────────────────────────────────

test('deletion only targets the authenticated caller, never a body-supplied id', () => {
  assert.ok(edgeFn.includes('auth.getUser('), 'must verify the caller JWT');
  assert.ok(edgeFn.includes('admin.deleteUser(user.id)'), 'must delete the verified caller only');
  assert.ok(!edgeFn.includes('req.json'), 'must not read a target user from the request body');
});

test('owner with other members is blocked with 409 before any mutation', () => {
  assert.ok(edgeFn.includes("'owner_has_members'"), 'blocked case must return owner_has_members');
  assert.ok(edgeFn.includes('409'), 'blocked case must be HTTP 409');
  const blockIdx = edgeFn.indexOf("'owner_has_members'");
  const leaveIdx = edgeFn.indexOf("rpc('leave_shared_household')");
  const deleteIdx = edgeFn.indexOf('admin.deleteUser(user.id)');
  assert.ok(blockIdx < leaveIdx, 'owner guard must run before leaving a household');
  assert.ok(blockIdx < deleteIdx, 'owner guard must run before deletion');
});

test('non-owner member leaves via existing RPC under the user JWT', () => {
  assert.ok(edgeFn.includes("rpc('leave_shared_household')"), 'must reuse leave_shared_household');
  assert.ok(
    edgeFn.includes("Deno.env.get('SUPABASE_ANON_KEY')"),
    'leave must run on an anon-key client (user JWT), not the service role',
  );
  assert.ok(
    edgeFn.includes('Authorization: authHeader'),
    'leave client must carry the caller JWT so auth.uid() resolves',
  );
});

test('member count guard uses an exact server-side count', () => {
  assert.ok(edgeFn.includes("count: 'exact'"), 'owner guard must count members server-side');
  assert.ok(edgeFn.includes('> 1'), 'sole owner (count === 1) must be allowed to delete');
});

// ── Client behavior ───────────────────────────────────────────────────────────

test('auth store surfaces the blocked-owner case distinctly', () => {
  assert.ok(authStore.includes("'OWNER_HAS_MEMBERS'"), 'blocked case must have its own code');
  assert.ok(authStore.includes('status === 409'), 'blocked case must map from HTTP 409');
});

test('successful deletion purges local data and signs out locally', () => {
  const deleteBody = authStore.slice(authStore.indexOf('deleteAccount: async'));
  for (const call of ['resetLocalOnly()', 'clearLocal()', 'clearSession()', 'clearReceiptImages()', 'stopSyncEngine()']) {
    assert.ok(deleteBody.includes(call), `deleteAccount must call ${call}`);
  }
  assert.ok(
    deleteBody.includes("signOut({ scope: 'local' })"),
    'must sign out locally (server-side user is already gone)',
  );
});

test('account settings routes to welcome after deletion and offers household settings when blocked', () => {
  assert.ok(accountSettings.includes("router.replace('/(auth)/welcome')"), 'must return to Welcome');
  assert.ok(accountSettings.includes('Go to Household'), 'blocked alert must offer household settings');
  assert.ok(
    accountSettings.includes('Transfer ownership or remove all household members'),
    'blocked alert must use the approved copy',
  );
});
