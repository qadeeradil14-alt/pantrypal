import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(
  join(process.cwd(), 'scripts/preflight-ota.sh'),
  'utf8',
);

test('OTA preflight follows production ancestry instead of an obsolete checkout name', () => {
  assert.doesNotMatch(source, /PantryPal-golden-restore/);
  assert.doesNotMatch(source, /restore\/golden-baseline/);
  assert.match(source, /git merge-base --is-ancestor "\$LATEST_COMMIT" HEAD/);
});

test('OTA preflight proves it is bundling Stokit V2 from the app directory', () => {
  assert.match(source, /\[ -d "app\/\(tabs\)" \]/);
  assert.match(source, /\[ ! -d "app\/\(main\)" \]/);
  assert.match(source, /EXPECTED_RUNTIME="stokit-v2-1\.0\.0"/);
  assert.match(source, /EXPECTED_CHANNEL="production"/);
});

test('the production OTA command cannot bypass preflight', () => {
  const deploy = readFileSync(join(process.cwd(), 'deploy-v2.sh'), 'utf8');
  const ota = deploy.slice(deploy.indexOf('  ota)'), deploy.indexOf('  build)'));
  assert.match(ota, /bash scripts\/preflight-ota\.sh/);
});

test('Maestro smoke test targets the production Stokit bundle', () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'app.json'), 'utf8'),
  ) as { expo: { ios: { bundleIdentifier: string } } };
  const smoke = readFileSync(
    join(process.cwd(), '../../.maestro/flows/smoke-core.yaml'),
    'utf8',
  );
  assert.match(smoke, new RegExp(`^appId: ${config.expo.ios.bundleIdentifier}$`, 'm'));
  assert.match(smoke, /text: "Skip onboarding"/);
  const stale = spawnSync(
    'rg',
    ['-l', '^appId: (?!com\\.hewadadil\\.pantrypal$)', '../../.maestro', '--pcre2'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  assert.equal(stale.stdout.trim(), '');
  const runner = readFileSync(join(process.cwd(), '../../scripts/maestro-test.sh'), 'utf8');
  assert.match(runner, /FLOW="\$\{1:-\.maestro\/flows\/smoke-launch\.yaml\}"/);
});
