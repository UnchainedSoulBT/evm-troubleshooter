# EVM Transaction Troubleshooter

**Live demo:** [evm-troubleshooter.vercel.app](https://evm-troubleshooter.vercel.app) (soon at [evm.trbt.cloud](https://evm.trbt.cloud))

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

## Features

- **Auto-detected input** — paste a tx hash, signed raw tx, calldata, or a JSON
  call request; the type is detected for you.
- **Simulation** — `eth_call` replay (latest or pinned to a historical block),
  with decoded return data and revert reasons.
- **Decoding** — calldata and reverts via your pasted ABI → Sourcify/Etherscan →
  the openchain signature DB; container calls (`multicall`, Gnosis Safe, Multicall3,
  EVC) expand into readable sub-calls.
- **State-override probes** — override balances/allowances/storage and re-simulate
  to prove a root cause without touching the chain (the "prove the fix" flow).
- **Call trace & asset diff** — full `debug_traceCall` tree with the reverting leg
  flagged, plus native-balance deltas; degrades cleanly on non-trace RPCs.
- **Build & broadcast** — ABI-driven encode form with a pre-flight checklist;
  broadcast client-side via your wallet, or relay a pre-signed raw tx.
- **Share & reproduce** — permalinks that reload the exact simulation, markdown
  report export, and saved recipes.

## Configuration

Copy [`.env.example`](.env.example) to `.env` (all server-side, never bundled):

| Variable                                 | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `RPC_URL_<chainId>`                      | Paid/keyed RPC upstream for a chain (overrides the public default) |
| `ETHERSCAN_API_KEY`                      | Etherscan V2 multichain key for ABI resolution                     |
| `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_BURST` | Proxy rate-limit tuning                                            |
| `NEXT_PUBLIC_WC_PROJECT_ID`              | WalletConnect v2 project id (public; enables the connector)        |

## Deploy (Vercel)

The proxy is mounted into the Next.js app, so it is a single deployment.

```sh
vercel link --token "$VERCEL_TOKEN"
vercel --prod --token "$VERCEL_TOKEN"
```

Set the server-side variables above in the Vercel project (never in the client).
Before shipping, run the bundle-secret scan:

```sh
pnpm build && ./scripts/check-bundle-secrets.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture and development notes.

## Security model

- No custody, ever: private keys never touch the server; broadcasting is
  client-side via a connected wallet or a user-pasted pre-signed raw tx.
- The RPC proxy is selective (only CORS-less nodes and key-bearing APIs) and
  enforces a JSON-RPC method allowlist plus per-IP rate limits.
- Provider keys live server-side only — never in the client bundle.

## License

[MIT](LICENSE)
