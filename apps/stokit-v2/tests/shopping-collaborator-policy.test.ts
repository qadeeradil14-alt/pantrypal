import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();

test('collaborator UI reuses the active shopping list and hides lifecycle controls', () => {
  const source = readFileSync(join(appRoot, 'app/(tabs)/shopping.tsx'), 'utf8');

  assert.doesNotMatch(source, />READ-ONLY</i);
  assert.match(source, /Shopping with/);
  assert.match(source, /canEditItems/);
  assert.match(source, /canChangePickedState/);
  assert.match(source, /canManageTripLifecycle/);
  assert.match(source, /canLogPrices/);
  assert.match(source, /ShoppingItemEditSheet/);
});

test('member item editing uses durable item writes and tombstone deletion', () => {
  const source = readFileSync(
    join(appRoot, 'components/shopping/ShoppingItemEditSheet.tsx'),
    'utf8',
  );

  assert.match(source, /updateItem/);
  assert.match(source, /deleteItem/);
  assert.match(source, /StorePickerSheet/);
  assert.match(source, /Edit item/);
  assert.doesNotMatch(source, /notes/i);
});

test('backend policy permits member item metadata but protects trip lifecycle fields', () => {
  const migrationsDir = join(appRoot, '../../supabase/migrations');
  const migrationName = readdirSync(migrationsDir).find((name) =>
    name.includes('collaborative_member_permissions'),
  );
  assert.ok(migrationName, 'collaborative member permission migration must exist');
  const sql = readFileSync(join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /can_update_household_snapshot_as_member/i);
  assert.match(sql, /shopperId/i);
  assert.match(sql, /pickedAt/i);
  assert.match(sql, /outOfStockAt/i);
  assert.match(sql, /household snapshot member update/i);
  assert.match(sql, /is_household_owner/i);
  assert.match(sql, /is_household_member/i);
  assert.doesNotMatch(sql, /notes/i);

  const privateHelperMigration = readdirSync(migrationsDir).find((name) =>
    name.includes('move_collaborative_permission_helper_private'),
  );
  assert.ok(privateHelperMigration, 'permission helper must be outside the exposed API schema');
  const privateSql = readFileSync(join(migrationsDir, privateHelperMigration), 'utf8');
  assert.match(privateSql, /set schema private/i);
  assert.match(privateSql, /from public, anon/i);
  assert.match(privateSql, /private\.can_update_household_snapshot_as_member/i);
});

test('OTA 410 sync heartbeat and CAS paths remain unchanged', () => {
  const sync = readFileSync(join(appRoot, 'core/services/syncEngine.ts'), 'utf8');

  assert.match(sync, /createRealtimeFallbackScheduler/);
  assert.match(sync, /5_000/);
  assert.match(sync, /\.eq\('updated_at', remoteUpdatedAt\)/);
  assert.match(sync, /mergeDurableSnapshotForPush/);
});
