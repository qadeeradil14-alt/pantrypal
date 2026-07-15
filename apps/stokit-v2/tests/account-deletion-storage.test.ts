import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), '../../supabase/functions/delete-account/index.ts'),
  'utf8',
);

test('account deletion removes the caller avatar before deleting auth user', () => {
  assert.match(source, /from\('avatars'\)\.remove\(\[avatarPath\]\)/);
  assert.ok(source.indexOf("from('avatars')") < source.lastIndexOf('auth.admin.deleteUser'));
});

test('account deletion removes receipt files only for households deleted with the owner', () => {
  assert.match(source, /ownedHouseholdIdsToDelete\.add\(row\.household_id\)/);
  assert.match(source, /removeHouseholdReceiptFiles\(serviceSupabase, householdId\)/);
  assert.ok(source.indexOf('removeHouseholdReceiptFiles') < source.lastIndexOf('auth.admin.deleteUser'));
});

test('storage cleanup errors block account deletion instead of orphaning files', () => {
  assert.match(source, /error: 'storage_cleanup_failed'/);
  assert.match(source, /return json\(\{ error: 'storage_cleanup_failed' \}, 500\)/);
});
