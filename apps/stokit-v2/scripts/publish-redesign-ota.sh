#!/usr/bin/env bash
set -euo pipefail

if [ "${APP_VARIANT:-}" != "redesign" ]; then
  echo "APP_VARIANT=redesign is required."
  exit 1
fi

if [ "$#" -ne 1 ]; then
  echo 'Usage: npm run ota:redesign -- "OTA NN: description"'
  exit 1
fi

npx tsx scripts/verify-redesign-release.ts
eas update --channel shopping-redesign-test --environment preview --message "$1" --non-interactive
