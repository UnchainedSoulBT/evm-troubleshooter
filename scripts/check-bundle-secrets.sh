#!/usr/bin/env bash
# Fails if server-side secret values leak into the client bundle (PLAN §5.7,
# §8 scenario 10). Any env var whose name suggests a secret (excluding
# NEXT_PUBLIC_*) must not appear verbatim in apps/web/.next/static.
set -euo pipefail

STATIC_DIR="apps/web/.next/static"
if [ ! -d "$STATIC_DIR" ]; then
  echo "error: $STATIC_DIR not found — run pnpm build first" >&2
  exit 1
fi

fail=0
while IFS='=' read -r name value; do
  case "$name" in
    NEXT_PUBLIC_*) continue ;;
    *KEY* | *SECRET* | *TOKEN* | *PRIVATE* | RPC_URL_*)
      if [ -n "${value:-}" ] && [ "${#value}" -ge 8 ]; then
        if grep -rqF -- "$value" "$STATIC_DIR"; then
          echo "SECRET LEAK: value of \$$name found in client bundle" >&2
          fail=1
        fi
      fi
      ;;
  esac
done < <(env)

if grep -rqE "BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY" "$STATIC_DIR"; then
  echo "SECRET LEAK: private key material in client bundle" >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "bundle-secret check: clean"
fi
exit "$fail"
