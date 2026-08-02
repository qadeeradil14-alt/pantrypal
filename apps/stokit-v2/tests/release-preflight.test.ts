import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  const expectedAppId = config.expo.ios.bundleIdentifier;
  assert.match(smoke, new RegExp(`^appId: ${expectedAppId}$`, 'm'));
  assert.match(smoke, /text: "Skip onboarding"/);

  // Stale-appId sweep across every flow and subflow. ripgrep is the fast path,
  // but it is not guaranteed to be on PATH — and when the binary is missing,
  // spawnSync returns `stdout: undefined`, which used to throw a TypeError here
  // and fail the whole test for an environment reason. Guard error/status/stdout
  // and fall back to a plain Node scan so this validation always actually runs.
  const maestroRoot = join(process.cwd(), '../../.maestro');
  const stale = spawnSync(
    'rg',
    ['-l', `^appId: (?!${expectedAppId.replace(/\./g, '\\.')}$)`, '../../.maestro', '--pcre2'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  // rg exit codes: 0 = matches found, 1 = no matches, >1 = a real error.
  const rgUsable =
    !stale.error && typeof stale.stdout === 'string' && (stale.status === 0 || stale.status === 1);
  if (rgUsable) {
    assert.equal(stale.stdout.trim(), '', 'every .maestro flow must target the production bundle id');
  } else {
    const offenders = readdirSync(maestroRoot, { recursive: true, encoding: 'utf8' })
      .filter((entry) => /\.ya?ml$/.test(entry))
      .filter((entry) =>
        readFileSync(join(maestroRoot, entry), 'utf8')
          .split('\n')
          .filter((line) => line.startsWith('appId:'))
          .some((line) => line.trim() !== `appId: ${expectedAppId}`),
      );
    assert.deepEqual(offenders, [], 'every .maestro flow must target the production bundle id');
  }
  const runner = readFileSync(join(process.cwd(), '../../scripts/maestro-test.sh'), 'utf8');
  assert.match(runner, /FLOW="\$\{1:-\.maestro\/flows\/smoke-launch\.yaml\}"/);
});
