# EVM Transaction Troubleshooter

A public, open-source, chain-agnostic web app for debugging EVM transactions:
**simulate** (Tenderly-style), **decode** calldata & reverts, **probe** root causes with
state overrides, **trace** the full call tree with asset diffs, and optionally
**broadcast** client-side — on Ethereum, the top-10 EVM chains, and any custom RPC.

> Paste a tx hash, raw calldata, or a signed raw tx → understand why it fails →
> prove the fix with a state-override simulation → broadcast the corrected tx
> with your own wallet.

Built with Next.js (App Router), TypeScript strict, Tailwind + shadcn/ui, and
[viem](https://viem.sh) for everything EVM. All simulation/decoding logic lives in
the framework-agnostic [`packages/core`](packages/core).

## Repo layout

```
apps/web/        Next.js app (UI)
apps/proxy/      selective RPC proxy (Hono): allowlist, rate limit, cache
packages/core/   pure sim/decode/override/chain logic over a viem PublicClient
test/            Playwright e2e + Anvil fork tests
```

## Development

Requires Node ≥ 22 (pnpm via corepack) and [Foundry](https://getfoundry.sh) for
fork tests.

```sh
corepack enable pnpm
pnpm install
./scripts/install-foundry.sh   # anvil, for fork tests

pnpm dev          # run the web app (in apps/web)
pnpm test         # unit + integration (vitest)
pnpm test:fork    # forked-Anvil tests (needs anvil; ETH_RPC_URL overridable)
pnpm test:e2e     # Playwright e2e
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

The execution plan lives in [PLAN.md](PLAN.md); progress is tracked in
[PROGRESS.md](PROGRESS.md).

## Security model

- No custody, ever: private keys never touch the server; broadcasting is
  client-side via a connected wallet or a user-pasted pre-signed raw tx.
- The RPC proxy is selective (only CORS-less nodes and key-bearing APIs) and
  enforces a JSON-RPC method allowlist plus per-IP rate limits.
- Provider keys live server-side only — never in the client bundle.

## License

[MIT](LICENSE)
