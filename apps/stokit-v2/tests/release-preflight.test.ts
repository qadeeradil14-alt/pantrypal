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

// ── OTA number resolution (resolve_latest_ota) ────────────────────────────
//
// OTA 457 was published with message "fix: prevent repeat arrival alerts
// until exit" — no "OTA 457:" prefix. The old script parsed the number with
// a bare `grep -Eo 'OTA [0-9]+' | head -1 | grep -Eo '[0-9]+'` pipeline; a
// no-match there returns 1, `pipefail` propagated it, and `set -e` killed the
// whole script before it could even print why. These run the ACTUAL bash
// function via a real subprocess — not a regex against the source text — so
// they prove the runtime behavior, not just that certain strings are present.

function runResolver(msg: string, versionFileContent = ''): {
  stdout: string;
  status: number | null;
} {
  const script = join(process.cwd(), 'scripts/preflight-ota.sh');
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "${script}"
    resolve_latest_ota "$1" "$2"
  `, '_', msg, versionFileContent], { encoding: 'utf8' });
  return { stdout: result.stdout, status: result.status };
}

test('OTA resolver: message contains "OTA NNN" resolves via the fast path', () => {
  const { stdout, status } = runResolver('OTA 457: some description', '');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), '457|release message');
});

test('OTA resolver: message lacks "OTA NNN" but constants/version.ts resolves it', () => {
  const { stdout, status } = runResolver(
    'fix: prevent repeat arrival alerts until exit',
    'export const OTA_SEQ = 457;',
  );
  assert.equal(status, 0);
  assert.equal(stdout.trim(), '457|constants/version.ts at the production commit');
});

test('OTA resolver: neither source resolves anything — reports empty, does not throw', () => {
  const { stdout, status } = runResolver('totally unrelated message', '');
  assert.equal(status, 0, 'the resolver itself must never fail; the CALLER decides whether empty is fatal');
  assert.equal(stdout.trim(), '|', 'both the number and the source description are empty');
});

test('OTA resolver: a pipe/grep mismatch (the exact OTA 457 shape) never kills the calling script', () => {
  // Reproduces the precise regression end-to-end under set -e -o pipefail:
  // resolve the message (empty), THEN fall back to the version file — proving
  // the script is still alive to attempt the second call, which the old
  // bare-grep pipeline could never reach.
  const script = join(process.cwd(), 'scripts/preflight-ota.sh');
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "${script}"
    RESOLUTION="$(resolve_latest_ota "fix: prevent repeat arrival alerts until exit" "")"
    if [ -z "\${RESOLUTION%%|*}" ]; then
      RESOLUTION="$(resolve_latest_ota "fix: prevent repeat arrival alerts until exit" "export const OTA_SEQ = 457;")"
    fi
    echo "SURVIVED:$RESOLUTION"
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'SURVIVED:457|constants/version.ts at the production commit');
});

test('OTA resolver: malformed EAS JSON produces an explicit ABORT, never a silent exit', () => {
  // Simulates the LATEST_GROUP-parsing step against garbage input, using the
  // exact fail() pattern the real script uses at that call site.
  const script = join(process.cwd(), 'scripts/preflight-ota.sh');
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "${script}"
    LATEST_JSON="not valid json at all"
    LATEST_GROUP="$(printf '%s' "$LATEST_JSON" | python3 -c "
import json, sys
print(json.load(sys.stdin)['currentPage'][0]['group'])
" 2>/dev/null)" || fail "could not parse an update group from EAS output — malformed response"
    echo "should not print"
  `], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'malformed input must fail, never silently continue');
  assert.match(result.stderr, /ABORT: could not parse an update group from EAS output — malformed response/);
  assert.doesNotMatch(result.stdout, /should not print/);
});

test('sourcing preflight-ota.sh for testing does not trigger the EAS-querying flow', () => {
  const script = join(process.cwd(), 'scripts/preflight-ota.sh');
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    source "${script}"
    echo "sourced without running the network-dependent flow"
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sourced without running the network-dependent flow/);
  assert.doesNotMatch(result.stdout, /Querying EAS/,
    'sourcing must only define resolve_latest_ota, never execute the main flow');
});

test('the resolver never depends solely on the release-message text', () => {
  assert.match(source, /constants\/version\.ts at the production commit/,
    'a non-message fallback source must exist');
  assert.match(source, /git show "\$LATEST_COMMIT:\.\/constants\/version\.ts"/,
    'the fallback must read the ACTUAL production commit\'s file, not HEAD\'s');
});

test('every grep-based extraction in the script is defended against a silent pipefail exit', () => {
  // Comment lines (e.g. the header explaining the OTA 457 regression) legally
  // describe the old, unguarded pipeline shape — only executable lines matter.
  const codeLines = source.split('\n').filter((line) => !line.trim().startsWith('#'));
  const grepLines = codeLines.filter((line) => /grep -Eo '[^']+'/.test(line));
  assert.ok(grepLines.length >= 3, 'expected the LOCAL_SEQ extraction and both resolve_latest_ota extractions');
  // Every executable line containing a bare `grep -Eo` extraction must also
  // carry a `|| true` so a no-match can never propagate as a fatal pipefail
  // before the caller gets to check emptiness explicitly.
  for (const line of grepLines) {
    assert.match(line, /\|\| true/, `unguarded grep pipeline: ${line.trim()}`);
  }
});
