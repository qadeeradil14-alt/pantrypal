#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MAESTRO_BIN="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
FLOW="${1:-.maestro/flows/smoke-core.yaml}"

if [[ ! -x "$MAESTRO_BIN" ]] && ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro not found. Install: curl -Ls https://get.maestro.mobile.dev | bash"
  exit 1
fi

if command -v maestro >/dev/null 2>&1; then
  MAESTRO_CMD=(maestro)
else
  MAESTRO_CMD=("$MAESTRO_BIN")
fi

# Java (required by Maestro CLI)
if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  elif [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  fi
fi

if ! "${MAESTRO_CMD[@]}" --version >/dev/null 2>&1; then
  echo "Maestro needs Java. On macOS: brew install openjdk@17"
  echo "Then: export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  exit 1
fi

ENV_FILE="$ROOT/.maestro/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${MAESTRO_EMAIL:-}" || -z "${MAESTRO_PASSWORD:-}" ]]; then
  echo "Set MAESTRO_EMAIL and MAESTRO_PASSWORD in .maestro/.env (see .maestro/.env.example)"
  exit 1
fi

export MAESTRO_HOUSEHOLD_NAME="${MAESTRO_HOUSEHOLD_NAME:-Maestro Home}"

if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
  export MAESTRO_DEVICE
fi

echo "Running Maestro flow: $FLOW"
"${MAESTRO_CMD[@]}" test "$FLOW"
