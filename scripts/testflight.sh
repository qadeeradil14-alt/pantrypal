#!/usr/bin/env bash
# Build Stokit for iOS and upload to TestFlight via EAS.
# Run from your Mac terminal (not Cursor shell if locale errors occur):
#   cd /Users/hewadadil/Documents/PantryPal && bash scripts/testflight.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export COPYFILE_DISABLE=1

echo "==> Branch: $(git branch --show-current)"
echo "==> Last commit: $(git log -1 --oneline)"

if [[ ! -f package.json ]]; then
  echo "Run this from the PantryPal repo root." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Node/npx not found. Install Node 20+ first." >&2
  exit 1
fi

echo ""
echo "==> Preflight: expo install --check"
npx expo install --check

echo ""
echo "==> Preflight: TypeScript"
npx tsc --noEmit

if [[ ! -f secrets/AuthKey_SY6372R52T.p8 ]]; then
  echo ""
  echo "WARNING: secrets/AuthKey_SY6372R52T.p8 is missing."
  echo "  eas build will still work; eas submit may prompt for Apple credentials"
  echo "  or fail until you place the App Store Connect API key at that path."
  echo "  (See eas.json submit.production.ios)"
fi

echo ""
echo "==> EAS login (skip if already logged in)"
npx eas-cli whoami || npx eas-cli login

echo ""
echo "==> Starting iOS production build (auto-increment build number)"
echo "    App: Stokit | bundle: com.hewadadil.pantrypal"
echo "    When Apple/Expo prompts appear, complete them in this terminal."
echo ""

npx eas-cli build --platform ios --profile production "$@"

echo ""
echo "==> Next: submit the finished build to App Store Connect"
echo "    If the build command did not auto-submit, run:"
echo "      npx eas-cli submit --platform ios --profile production --latest"
echo ""
echo "Then open App Store Connect > Apps > Stokit > TestFlight"
echo "  https://appstoreconnect.apple.com"
echo ""
echo "Fill Test Information / compliance if Apple shows missing items."
echo "See TESTFLIGHT_GEMINI_HANDOFF.md for copy-paste field values."
