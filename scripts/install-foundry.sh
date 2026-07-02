#!/usr/bin/env bash
# Installs the Foundry toolchain (anvil, forge, cast) via foundryup.
# Idempotent: skips if anvil is already on PATH or in ~/.foundry/bin.
set -euo pipefail

FOUNDRY_BIN="$HOME/.foundry/bin"

if command -v anvil >/dev/null 2>&1; then
  echo "anvil already installed: $(anvil --version | head -1)"
  exit 0
fi

if [ -x "$FOUNDRY_BIN/anvil" ]; then
  echo "anvil already installed at $FOUNDRY_BIN (add it to PATH)"
  exit 0
fi

curl -sSL https://foundry.paradigm.xyz | bash
"$FOUNDRY_BIN/foundryup"
"$FOUNDRY_BIN/anvil" --version
