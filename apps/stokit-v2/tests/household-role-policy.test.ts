import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { householdCapabilities } from '../core/services/householdPermissions';

const migrationsDir = join(process.cwd(), '../../supabase/migrations');

function roleMigration(): string {
  const file = readdirSync(migrationsDir).find((name) => name.includes('household_role_architecture'));
  assert.ok(file, 'household role migration must exist');
  return readFileSync(join(migrationsDir, file), 'utf8');
}

test('owner capabilities require transfer before leave and sole ownership before delete', () => {
  assert.deepEqual(householdCapabilities('owner', 2), {
    canInvite: true,
    canRemoveMembers: true,
    canTransferOwnership: true,
    canLeave: false,
    canDeleteHousehold: false,
  });
  assert.equal(householdCapabilities('owner', 1).canDeleteHousehold, true);
  assert.equal(householdCapabilities('owner', 1).canLeave, false);
});

test('member capabilities allow only voluntary leave', () => {
  assert.deepEqual(householdCapabilities('member', 3), {
    canInvite: false,
    canRemoveMembers: false,
    canTransferOwnership: false,
    canLeave: true,
    canDeleteHousehold: false,
  });
});

test('server migration exposes atomic transfer and sole-owner deletion RPCs', () => {
  const sql = roleMigration();

  assert.match(sql, /function public\.transfer_household_ownership\(target_user_id uuid\)/i);
  assert.match(sql, /function public\.delete_shared_household\(\)/i);
  assert.match(sql, /Only the household owner can transfer ownership/i);
  assert.match(sql, /Only a sole owner can delete the household/i);
  assert.match(sql, /update public\.households\s+set owner_id = target_user_id/i);
});

test('server blocks role escalation and limits direct member updates to push token', () => {
  const sql = roleMigration();

  assert.match(
    sql,
    /revoke [^;]*update[^;]* on table public\.household_members from anon, authenticated/i,
  );
  assert.match(sql, /grant update \(push_token\) on table public\.household_members to authenticated/i);
  assert.match(sql, /create unique index[^;]+where role = 'owner'/is);
});

test('owner can never leave and member leave never copies shared data', () => {
  const sql = roleMigration();
  const leave = sql.match(/function public\.leave_shared_household\(\)[\s\S]+?\$function\$;/i)?.[0] ?? '';

  assert.match(leave, /Owners must transfer ownership before leaving/i);
  assert.doesNotMatch(leave, /current_state|merge_household_states/);
  assert.match(leave, /delete from public\.household_members/i);
});

test('invite code is returned only to owners', () => {
  const sql = roleMigration();

  assert.match(sql, /me\.role <> 'owner'/i);
  assert.match(sql, /revoke select on table public\.households from anon, authenticated/i);
  assert.match(sql, /grant select \(id, name, created_at, plan, owner_id, is_personal\)/i);
});

test('membership changes clear local household data and refresh in foreground', () => {
  const store = readFileSync(join(process.cwd(), 'store/household-store.ts'), 'utf8');
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');

  assert.match(store, /useSessionStore\.getState\(\)\.clearSession\(\)/);
  assert.match(store, /table: 'profiles'/);
  assert.match(store, /transferOwnership:/);
  assert.match(store, /deleteHousehold:/);
  assert.match(layout, /useHouseholdStore\.getState\(\)\.refresh\(\)/);
});

test('settings requires confirmations and exposes only role-appropriate actions', () => {
  const settings = readFileSync(join(process.cwd(), 'app/household.tsx'), 'utf8');

  assert.match(settings, /Transfer household ownership\?/);
  assert.match(settings, /Delete shared household\?/);
  assert.match(settings, /capabilities\.canLeave/);
  assert.match(settings, /capabilities\.canDeleteHousehold/);
});
