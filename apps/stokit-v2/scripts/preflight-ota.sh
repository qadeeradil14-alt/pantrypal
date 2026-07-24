#!/usr/bin/env bash
# Pre-publish safety check for production OTAs. Run from anywhere:
#   bash apps/stokit-v2/scripts/preflight-ota.sh
#
# Exists because OTA 380 was published from a stale checkout that had never
# seen OTAs 385-400 (shipped from another workspace), silently rolling
# production back. The local git log alone cannot be trusted for sequencing —
# EAS is the source of truth for what production is actually serving.
#
# Aborts unless ALL of the following hold:
#   - workspace is the canonical golden workspace
#   - branch is the canonical golden branch
#   - working tree is clean (nothing unrelated can enter the bundle)
#   - runtime version and channel match production expectations
#   - the update currently serving production was cut from an ancestor of HEAD
#     (i.e. this checkout contains everything production is running)
#   - local OTA_SEQ is exactly latest-production-OTA + 1
set -euo pipefail

EXPECTED_WORKSPACE="/Users/hewadadil/Documents/PantryPal-golden-restore"
EXPECTED_BRANCH="restore/golden-baseline-385-plus-quantity-diag"
EXPECTED_RUNTIME="stokit-v2-1.0.0"
EXPECTED_CHANNEL="production"

fail() { echo "ABORT: $1" >&2; exit 1; }

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

TOPLEVEL="$(git rev-parse --show-toplevel)"
[ "$TOPLEVEL" = "$EXPECTED_WORKSPACE" ] \
  || fail "workspace is $TOPLEVEL, expected $EXPECTED_WORKSPACE"

BRANCH="$(git branch --show-current)"
[ "$BRANCH" = "$EXPECTED_BRANCH" ] \
  || fail "branch is '$BRANCH', expected '$EXPECTED_BRANCH'"

[ -z "$(git status --porcelain)" ] \
  || fail "working tree is dirty — unrelated files would enter the bundle"

RUNTIME="$(python3 -c "import json;print(json.load(open('app.json'))['expo']['runtimeVersion'])")"
[ "$RUNTIME" = "$EXPECTED_RUNTIME" ] \
  || fail "runtimeVersion is '$RUNTIME', expected '$EXPECTED_RUNTIME'"

CHANNEL="$(python3 -c "import json;print(json.load(open('app.json'))['expo']['updates']['requestHeaders']['expo-channel-name'])")"
[ "$CHANNEL" = "$EXPECTED_CHANNEL" ] \
  || fail "channel header is '$CHANNEL', expected '$EXPECTED_CHANNEL'"

LOCAL_SEQ="$(grep -Eo 'OTA_SEQ = [0-9]+' constants/version.ts | grep -Eo '[0-9]+')"
[ -n "$LOCAL_SEQ" ] || fail "could not read OTA_SEQ from constants/version.ts"

echo "Querying EAS for the update currently serving '$EXPECTED_CHANNEL'..."
LATEST_JSON="$(npx eas-cli update:list --branch "$EXPECTED_CHANNEL" --limit 1 --non-interactive --json 2>/dev/null)"
LATEST_GROUP="$(printf '%s' "$LATEST_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['currentPage'][0]['group'])")"
LATEST_MSG="$(printf '%s' "$LATEST_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['currentPage'][0]['message'])")"
LATEST_OTA="$(printf '%s' "$LATEST_MSG" | grep -Eo 'OTA [0-9]+' | head -1 | grep -Eo '[0-9]+')"
[ -n "$LATEST_OTA" ] || fail "could not parse an OTA number from latest production message: '$LATEST_MSG'"

LATEST_COMMIT="$(npx eas-cli update:view "$LATEST_GROUP" --json 2>/dev/null \
  | python3 -c "import json,sys;us=json.load(sys.stdin);hs={u['gitCommitHash'] for u in us};assert len(hs)==1, 'platforms disagree on commit';print(hs.pop())")"

git cat-file -t "$LATEST_COMMIT" >/dev/null 2>&1 \
  || fail "production commit $LATEST_COMMIT is unknown to this checkout — this workspace is stale"
git merge-base --is-ancestor "$LATEST_COMMIT" HEAD \
  || fail "production commit $LATEST_COMMIT is not an ancestor of HEAD — this checkout is missing shipped code"

EXPECTED_NEXT=$((LATEST_OTA + 1))
[ "$LOCAL_SEQ" -eq "$EXPECTED_NEXT" ] \
  || fail "local OTA_SEQ is $LOCAL_SEQ but production serves OTA $LATEST_OTA — bump to exactly $EXPECTED_NEXT first"

echo "OK: workspace/branch/runtime/channel verified"
echo "OK: production serves OTA $LATEST_OTA (group $LATEST_GROUP, commit ${LATEST_COMMIT:0:7}, ancestor of HEAD)"
echo "OK: local OTA_SEQ $LOCAL_SEQ is the next number in sequence"
echo "Safe to publish OTA $LOCAL_SEQ."
