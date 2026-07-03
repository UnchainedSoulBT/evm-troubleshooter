# Contributing

Thanks for your interest in the EVM Transaction Troubleshooter.

## Architecture

The heavy lifting lives in **`packages/core`** — framework-agnostic pure functions
over a viem `PublicClient`. Everything is unit-testable and could ship as an npm
package or CLI. The UI (`apps/web`) is a thin layer over it.

```
packages/core/
  input.ts          input auto-detection (hash | raw tx | calldata | JSON)
  chains/           registry, client factory, capability probe, BYO-RPC merge
  simulate.ts       eth_call layer + raw-tx request builder (recover from, fresh fees)
  tx.ts             tx/receipt fetch + parent-block replay
  decode/           calldata + revert decoders, selector seed, container unpackers
  overrides.ts      state-override builders + ERC-20 slot math/discovery
  probes.ts         isolation probe suggestions + prove-the-fix override
  trace/            debug_traceCall → trace_call fallback, tree model, asset diff
  build.ts          ABI-form encoder (per-arg validation)
  preflight.ts      pre-broadcast checklist
  share.ts          permalink codec
  report.ts         markdown report
  recipes.ts        saved templates

apps/proxy/         selective RPC proxy (Hono): allowlist, rate limit, cache,
                    SSRF-guarded relay, keyed ABI/selector services
apps/web/           Next.js App Router UI
test/               Playwright e2e + forked-Anvil fork tests
```

## Guardrails

- **Core is pure functions** over a `PublicClient` — no framework imports in
  `packages/core`.
- **Security invariants:** never handle server-side private keys; the proxy
  enforces a method allowlist + per-IP rate limit; provider keys stay server-side;
  validate/checksum every address and hex input.
- **Chain-agnostic:** nothing hardcoded to one chain — everything flows through the
  registry. Default is Ethereum; BYO-RPC is always available.
- **Graceful degradation:** if an RPC lacks `debug_*`/archive, fall back and surface
  a capability badge — never crash.
- **Tests are sacred:** never weaken or skip a test to make a gate pass.

## Development

```sh
pnpm install
./scripts/install-foundry.sh          # anvil, for fork tests

pnpm dev                              # run the app
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm test                             # unit + integration (vitest)
pnpm test:fork                        # forked-Anvil tests (needs anvil)
pnpm test:e2e                         # Playwright (boots the app + anvil)
```

Add a test first (unit for `core`/`proxy`, fork or Playwright for on-chain
behavior), implement the minimum to pass, then run the full gate before opening a
PR. Use conventional commits (`feat/fix/chore/test/docs/refactor`).

## CI

Two jobs run on every push/PR: `checks` (typecheck, lint, format, build, unit
tests, bundle-secret scan) and `fork-e2e` (forked-Anvil tests + Playwright).
