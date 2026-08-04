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
#   - the app directory is Stokit V2, never the abandoned V1
#   - working tree is clean (nothing unrelated can enter the bundle)
#   - runtime version and channel match production expectations
#   - the update currently serving production was cut from an ancestor of HEAD
#     (i.e. this checkout contains everything production is running)
#   - local OTA_SEQ is exactly latest-production-OTA + 1
set -euo pipefail

EXPECTED_RUNTIME="stokit-v2-1.0.0"
EXPECTED_CHANNEL="production"

fail() { echo "ABORT: $1" >&2; exit 1; }

# Resolve the live production OTA number from the most reliable evidence
# available, without ever letting a `grep` no-match kill the caller.
#
# OTA 457 was published with message "fix: prevent repeat arrival alerts
# until exit" — no "OTA 457:" prefix. The old script parsed the number with a
# bare `grep -Eo 'OTA [0-9]+' | head -1 | grep -Eo '[0-9]+'` pipeline; a
# no-match there returns 1, `pipefail` propagates it, and `set -e` killed the
# whole script BEFORE the `[ -n "$LATEST_OTA" ] || fail ...` line could even
# run — so it died with no ABORT message and no explanation.
#
# This function is pure (no network/git calls) and structurally cannot
# reproduce that failure: every internal pipeline ends in `|| true`, so a
# no-match degrades to an empty string instead of a nonzero exit, and the
# function itself always `return`s 0. The empty-result case is left for the
# CALLER to treat as fatal (see the fail() call after it is invoked) — this
# function only ever reports what it found, never aborts on its own.
#
# Resolution order:
#   1. The release message ("OTA NNN: ...") — fast path, no extra git call,
#      and the only source every OTA <=456 needs.
#   2. constants/version.ts AS IT EXISTED AT THE PRODUCTION COMMIT. This is
#      MORE reliable than the message, not just a fallback for when it's
#      missing: every "chore: bump OTA sequence to N" commit sets this field
#      as part of actually publishing, so — unlike free-text in a --message
#      flag — it cannot be typo'd, reworded, or omitted independently of a
#      real release. EAS's own update metadata (update:list / update:view)
#      exposes no numeric "OTA sequence" field at all; gitCommitHash is the
#      most reliable pointer EAS gives us, and this uses it to reach the
#      project's actual source of truth for the number rather than inventing
#      a new one.
#
# $1 = release message text (may or may not contain "OTA NNN")
# $2 = contents of constants/version.ts at the production commit, or "" if
#      not yet fetched (the caller only pays for that git call when the
#      message-based fast path already failed)
# stdout = "NUMBER|source description", NUMBER empty if neither source resolved
resolve_latest_ota() {
  local msg="$1" version_file_content="${2:-}"
  local from_msg
  from_msg="$(printf '%s' "$msg" | grep -Eo 'OTA [0-9]+' 2>/dev/null | head -1 | grep -Eo '[0-9]+' 2>/dev/null || true)"
  if [ -n "$from_msg" ]; then
    printf '%s|release message\n' "$from_msg"
    return 0
  fi
  if [ -n "$version_file_content" ]; then
    local from_file
    from_file="$(printf '%s' "$version_file_content" | grep -Eo 'OTA_SEQ = [0-9]+' 2>/dev/null | grep -Eo '[0-9]+' 2>/dev/null || true)"
    if [ -n "$from_file" ]; then
      printf '%s|constants/version.ts at the production commit\n' "$from_file"
      return 0
    fi
  fi
  printf '|\n'
  return 0
}

# Only run the full network/git-dependent flow when executed directly, so
# this file can be `source`d to unit-test resolve_latest_ota in isolation
# (see tests/release-preflight.test.ts) without touching EAS or git.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

[ -d "app/(tabs)" ] \
  || fail "app/(tabs) is missing — this is not Stokit V2"
[ ! -d "app/(main)" ] \
  || fail "app/(main) exists — this appears to be the abandoned V1 app"

[ -z "$(git status --porcelain)" ] \
  || fail "working tree is dirty — unrelated files would enter the bundle"

RUNTIME="$(python3 -c "import json;print(json.load(open('app.json'))['expo']['runtimeVersion'])")"
[ "$RUNTIME" = "$EXPECTED_RUNTIME" ] \
  || fail "runtimeVersion is '$RUNTIME', expected '$EXPECTED_RUNTIME'"

CHANNEL="$(python3 -c "import json;print(json.load(open('app.json'))['expo']['updates']['requestHeaders']['expo-channel-name'])")"
[ "$CHANNEL" = "$EXPECTED_CHANNEL" ] \
  || fail "channel header is '$CHANNEL', expected '$EXPECTED_CHANNEL'"

# `|| true` here too: this pipeline had the exact same latent silent-death
# shape as the OTA-number one below, just never triggered because
# constants/version.ts has always had a matching line. Hardened for real,
# not just at the one call site that happened to break.
LOCAL_SEQ="$(grep -Eo 'OTA_SEQ = [0-9]+' constants/version.ts 2>/dev/null | grep -Eo '[0-9]+' 2>/dev/null || true)"
[ -n "$LOCAL_SEQ" ] || fail "could not read OTA_SEQ from constants/version.ts"

echo "Querying EAS for the update currently serving '$EXPECTED_CHANNEL'..."
LATEST_JSON="$(npx eas-cli update:list --branch "$EXPECTED_CHANNEL" --limit 1 --non-interactive --json 2>/dev/null)" \
  || fail "eas-cli update:list failed — check EAS auth/network"
[ -n "$LATEST_JSON" ] || fail "eas-cli update:list returned empty output"

LATEST_GROUP="$(printf '%s' "$LATEST_JSON" | python3 -c "
import json, sys
print(json.load(sys.stdin)['currentPage'][0]['group'])
" 2>/dev/null)" || fail "could not parse an update group from EAS output — malformed response"
[ -n "$LATEST_GROUP" ] || fail "EAS returned no update group for '$EXPECTED_CHANNEL'"

LATEST_MSG="$(printf '%s' "$LATEST_JSON" | python3 -c "
import json, sys
print(json.load(sys.stdin)['currentPage'][0]['message'])
" 2>/dev/null)" || fail "could not parse the update message from EAS output — malformed response"

LATEST_COMMIT="$(npx eas-cli update:view "$LATEST_GROUP" --json 2>/dev/null \
  | python3 -c "
import json, sys
updates = json.load(sys.stdin)
hashes = {u['gitCommitHash'] for u in updates}
assert len(hashes) == 1, 'platforms disagree on commit'
print(hashes.pop())
" 2>/dev/null)" \
  || fail "could not resolve a single git commit hash for update group $LATEST_GROUP — malformed response or platforms disagree"
[ -n "$LATEST_COMMIT" ] || fail "resolved an empty commit hash for update group $LATEST_GROUP"

git cat-file -t "$LATEST_COMMIT" >/dev/null 2>&1 \
  || fail "production commit $LATEST_COMMIT is unknown to this checkout — this workspace is stale"
git merge-base --is-ancestor "$LATEST_COMMIT" HEAD \
  || fail "production commit $LATEST_COMMIT is not an ancestor of HEAD — this checkout is missing shipped code"

RESOLUTION="$(resolve_latest_ota "$LATEST_MSG" "")"
if [ -z "${RESOLUTION%%|*}" ]; then
  # Message-based fast path found nothing — fall back to the commit's own
  # constants/version.ts. Only fetched now, not unconditionally, since most
  # publishes never need it.
  VERSION_FILE_CONTENT="$(git show "$LATEST_COMMIT:./constants/version.ts" 2>/dev/null || true)"
  RESOLUTION="$(resolve_latest_ota "$LATEST_MSG" "$VERSION_FILE_CONTENT")"
fi
LATEST_OTA="${RESOLUTION%%|*}"
OTA_SOURCE="${RESOLUTION#*|}"
[ -n "$LATEST_OTA" ] \
  || fail "could not determine the live OTA number from either the release message or constants/version.ts at commit $LATEST_COMMIT — refusing to guess"

EXPECTED_NEXT=$((LATEST_OTA + 1))
[ "$LOCAL_SEQ" -eq "$EXPECTED_NEXT" ] \
  || fail "local OTA_SEQ is $LOCAL_SEQ but production serves OTA $LATEST_OTA (via $OTA_SOURCE) — bump to exactly $EXPECTED_NEXT first"

echo "OK: Stokit V2/runtime/channel verified"
echo "OK: production serves OTA $LATEST_OTA via $OTA_SOURCE (group $LATEST_GROUP, commit ${LATEST_COMMIT:0:7}, ancestor of HEAD)"
echo "OK: local OTA_SEQ $LOCAL_SEQ is the next number in sequence"
echo "Safe to publish OTA $LOCAL_SEQ."

fi
