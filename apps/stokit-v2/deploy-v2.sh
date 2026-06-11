#!/usr/bin/env bash
#
# deploy-v2.sh — the ONLY correct way to ship Stokit V2.
#
# Why this exists:
#   The repo has two apps sharing one EAS projectId + "production" channel:
#     - repo-root  app/            = V1 (abandoned)
#     - apps/stokit-v2/ app/       = V2 (the real app)
#   Running `eas update` from the repo root bundles V1 and ships it to V2
#   devices over the air — the app silently reverts to V1. This script forces
#   the correct working directory (its own = apps/stokit-v2) so that mistake
#   is impossible, no matter where you invoke it from.
#
# Usage:
#   ./deploy-v2.sh ota "OTA 49: short description"   # JS/TS/UI change (OTA)
#   ./deploy-v2.sh build                              # native/config change (full build)
#
set -euo pipefail

# ── Force the correct directory: this script's own location (apps/stokit-v2) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Sanity guard: confirm we are really in V2, not V1 ─────────────────────────
if [ ! -d "app/(tabs)" ]; then
  echo "✗ ERROR: app/(tabs) not found in $SCRIPT_DIR"
  echo "  This does not look like Stokit V2. Aborting to avoid shipping V1."
  exit 1
fi
if [ -d "app/(main)" ]; then
  echo "✗ ERROR: found app/(main) — this looks like V1, not V2. Aborting."
  exit 1
fi

CMD="${1:-}"

case "$CMD" in
  ota)
    MSG="${2:-}"
    if [ -z "$MSG" ]; then
      echo "✗ Usage: ./deploy-v2.sh ota \"OTA NN: description\""
      exit 1
    fi
    echo "→ Reminder: bump the OTA label in app/(auth)/welcome.tsx before shipping."
    grep -n "OTA " "app/(auth)/welcome.tsx" || true
    echo ""
    echo "→ Typechecking…"
    npx tsc --noEmit
    echo "✓ Types clean."
    echo "→ Publishing OTA to production (from $(pwd))…"
    eas update --branch production --environment production --message "$MSG"
    echo "✓ OTA published. Force-close + reopen the app twice to apply."
    ;;

  build)
    echo "→ Typechecking…"
    npx tsc --noEmit
    echo "✓ Types clean."
    echo "→ Starting interactive iOS production build (from $(pwd))…"
    echo "  Accept defaults / let EAS generate provisioning profiles for both"
    echo "  targets (Stokit + widget) when prompted."
    eas build --platform ios --profile production
    ;;

  *)
    echo "Stokit V2 deploy — always runs from apps/stokit-v2 (V1 can't leak in)."
    echo ""
    echo "Usage:"
    echo "  ./deploy-v2.sh ota \"OTA NN: description\"   # JS/TS/UI change (over-the-air)"
    echo "  ./deploy-v2.sh build                          # native/config change (full build)"
    exit 1
    ;;
esac
