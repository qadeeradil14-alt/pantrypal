import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationsDir = join(process.cwd(), '../../supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) => name.includes('profile_avatars'));
const migration = migrationName ? readFileSync(join(migrationsDir, migrationName), 'utf8') : '';
const servicePath = join(process.cwd(), 'core/services/profileAvatar.ts');
const service = existsSync(servicePath) ? readFileSync(servicePath, 'utf8') : '';
const store = readFileSync(join(process.cwd(), 'store/household-store.ts'), 'utf8');
const account = readFileSync(join(process.cwd(), 'app/settings/account.tsx'), 'utf8');
const avatarStack = readFileSync(join(process.cwd(), 'components/shared/MemberAvatars.tsx'), 'utf8');
const memberList = readFileSync(join(process.cwd(), 'components/household/MemberList.tsx'), 'utf8');

test('migration creates a private constrained avatars bucket and profile path', () => {
  assert.match(migration, /add column if not exists avatar_path text/i);
  assert.match(migration, /avatar_path is null or avatar_path = id::text \|\| '\/avatar\.jpg'/i);
  assert.match(migration, /values \('avatars', 'avatars', false, 5242880, array\['image\/jpeg', 'image\/png'\]/i);
});

test('storage ownership policies allow only the caller exact object key', () => {
  for (const command of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`for ${command}\\s+to authenticated`, 'i'));
  }
  assert.match(migration, /name = \(select auth\.uid\(\)\)::text \|\| '\/avatar\.jpg'/i);
  assert.doesNotMatch(migration, /for (insert|update|delete)[\s\S]+?using \(bucket_id = 'avatars'\)[\s\S]+?with check \(bucket_id = 'avatars'\)/i);
});

test('household members can read avatar profile data without cross-user writes', () => {
  assert.match(migration, /create policy "profiles_household_select"/i);
  assert.match(migration, /is_household_member\(profiles\.household_id\)/i);
  assert.match(migration, /'avatarPath', p\.avatar_path/i);
  assert.match(migration, /left join public\.profiles p on p\.id = m\.user_id/i);
});

test('profile updates use one deterministic object and remove through Storage API', () => {
  assert.match(service, /\.upload\(path,[\s\S]+upsert: true/);
  assert.match(service, /\.from\('profiles'\)[\s\S]+\.update\(\{ avatar_path: path/);
  assert.match(service, /\.remove\(\[path\]\)/);
  assert.match(service, /avatar_path: null/);
  assert.match(service, /if \(!profile\?\.avatar_path\)[\s\S]+\.remove\(\[path\]\)/);
});

test('shared household avatars render photos with initials fallback', () => {
  assert.match(avatarStack, /<Avatar[\s\S]+photoUrl=\{m\.avatarUrl\}[\s\S]+displayName=\{m\.displayName\}/);
  assert.match(memberList, /<Avatar[\s\S]+photoUrl=\{member\.avatarUrl\}[\s\S]+displayName=\{member\.displayName\}/);
  assert.doesNotMatch(avatarStack, /Household icon badge/);
});

test('household profile changes refresh through Realtime', () => {
  assert.match(store, /table: 'profiles'/);
  assert.match(store, /filter: `household_id=eq\.\$\{household\.id\}`/);
  assert.match(store, /avatarPath/);
});

test('Account exposes the approved photo actions and removal confirmation', () => {
  assert.match(account, /Profile photo/);
  assert.match(account, /Take photo/);
  assert.match(account, /Choose from library/);
  assert.match(account, /Remove photo/);
  assert.match(account, /Remove profile photo\?/);
});
