# EVM Transaction Troubleshooter — Full Execution Plan

A public, open-source, chain-agnostic web app for debugging EVM transactions:
**simulate** (like Tenderly), **decode** calldata & reverts, **validate** state via RPC,
**build** contract calls, and optionally **broadcast** — on Ethereum (default) and the
top-10 EVM chains, plus any custom RPC.

This document is the single source of truth for the executing agent. Work the
[Execution loop](#2-the-execution-loop) top-to-bottom through the
[Phased plan](#7-phased-plan-scaffold--full-product). Keep `PROGRESS.md` current.

---

## 0. Mission & end goal

A user pastes a **tx hash**, **raw calldata**, or a **raw tx** and gets: a human-readable
decode, an on-chain **simulation** (including historical replay and state overrides), a
**call trace + asset diff**, **isolation probes**, and optional **client-side broadcast**.

> **The product is "done" when a stranger can, with zero setup, load the app, reproduce a
> failing mainnet transaction, understand *why* it fails, prove the fix with a
> state-override simulation, and (optionally) broadcast a corrected tx with their own
> wallet — on any of the 10 supported chains.**

**Non-goals (v1):** no custody, no server-side private keys, no proprietary tracing infra.
Broadcasting is client-side via a connected wallet only. Nothing Fireblocks-specific.

---

## 1. Definition of full success (global gate)

The product is complete only when **all** of these hold simultaneously:

1. **Functional:** Every phase's acceptance suite (§7) is green.
2. **End-to-end:** All final E2E scenarios (§8) pass on CI against a forked Ethereum
   mainnet (Anvil) and smoke-pass live against ≥3 of the top-10 chains.
3. **Quality gates:** `typecheck`, `lint`, `format:check`, and unit+integration tests pass
   with **0 errors**; test coverage on `packages/core` ≥ 80%.
4. **Non-functional:**
   - No secrets in the client bundle; RPC proxy enforces a method allowlist + rate limit.
   - No private keys ever handled server-side; broadcast is client-wallet only.
   - a11y: no critical axe violations on main views; keyboard-navigable.
   - Perf: first simulation result renders < 2.5s on a warm public RPC (excluding node
     latency).
5. **Docs:** `README` (run/deploy), in-app help, and a public demo link work.
6. **Progress ledger:** `PROGRESS.md` shows every task checked with its commit hash, no
   open blockers.

If any item is red, the product is **not** done — the loop continues.

---

## 2. The execution loop

The executor works **one task at a time**, top-to-bottom through phases. Never skip a phase
gate.

```
LOAD    → Read PLAN.md + PROGRESS.md. Pick the first unchecked task in the
          lowest incomplete phase. Re-read the files it touches.
FRAME   → Restate the task + its acceptance criteria in one line. Note the
          test(s) that will prove it.
TEST    → Write or update the failing test first (unit/integration/e2e as
          appropriate). Skip only for pure-scaffold/config tasks.
BUILD   → Implement the minimum code to satisfy the task + its tests.
VERIFY  → Run, in order: typecheck → lint → unit → integration → relevant e2e.
          All must pass.
REVIEW  → Self-check against acceptance criteria AND global guardrails (§3).
          Remove dead code / slop.
COMMIT  → Conventional commit (feat/fix/chore/test/docs/refactor). One logical
          change per commit.
LEDGER  → Tick the task in PROGRESS.md with the commit hash + one-line note of
          any deviation.
NEXT    → Return to LOAD.
```

**Phase gate** (run after a phase's last task): run that phase's full acceptance suite (§7).
If green → mark the phase complete in `PROGRESS.md`, proceed. If red → create tasks to fix
and re-loop; do **not** advance.

**Blocker rule:** if a task fails **VERIFY 3 times** with distinct fixes, stop editing,
write a `BLOCKER:` entry in `PROGRESS.md` (what, why, hypotheses tried, what's needed), and
move to the next **independent** task. Never fake tests or `skip`/comment them to go green.

**Decision rule (autonomy):** for reversible choices (naming, layout, lib-equivalents,
defaults) pick a sensible option and note it. For irreversible/scope-changing choices
(dropping a phase, adding custody, changing the security model) stop and record a
`DECISION-NEEDED:` entry rather than guessing.

**Definition of "task done":** its test(s) pass, phase criteria unaffected-or-advanced,
committed, ledgered.

---

## 3. Global guardrails (invariants the loop must never violate)

- **Stack:** Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui; **viem**
  for all EVM; wagmi + WalletConnect v2 for wallet; monorepo via pnpm workspaces; Foundry
  **Anvil** for fork tests; **vitest** unit/integration; **Playwright** e2e.
- **Architecture:** all sim/decode logic lives in framework-agnostic `packages/core` (pure
  functions over a viem `PublicClient`), so it is testable and reusable. UI is a thin layer.
- **Security invariants:** never store/accept server-side private keys; the proxy has an RPC
  method allowlist + per-IP rate limit; no provider keys in the client; validate/checksum
  every address & hex input; never `eval` ABIs.
- **Chain-agnostic invariant:** nothing hardcoded to a single chain. Everything flows
  through the chain registry. Default = Ethereum (1). Top-10 shipped + BYO-RPC/custom-chain
  always available.
- **Graceful degradation:** if a chain's RPC lacks `debug_*`/archive, fall back to
  `eth_call` and surface a capability badge — never crash.
- **No slop:** no narrating comments, no dead code, no unused deps. Comments only for
  non-obvious intent.
- **Tests are sacred:** never weaken/skip a test to pass a gate.

---

## 4. Progress ledger format (`PROGRESS.md`)

The executor maintains this file continuously:

```md
# Progress
## Phase N — <name> — [ ] in progress / [x] complete
- [x] N.1 <task> — <commit sha> — note
- [ ] N.2 <task>
BLOCKER: <id> — <desc> — <what's needed>
DECISION-NEEDED: <id> — <options> — <recommendation>
```

---

## 5. Product specification (implementation reference)

### 5.1 Architecture

Keep it a thin app over RPC; the node does the heavy lifting.

```
Frontend (Next.js + viem)
  - Inputs: txHash | rawTx | calldata (auto-detected)
  - Decoders (ABI, selector DB), result & trace viewer
  - Wallet connect (broadcast only, client-side)
        │
        ├─ direct JSON-RPC (default: CORS-enabled public RPCs, or user's BYO-RPC)
        │
        └─ via backend proxy ONLY when needed:
             • CORS-less RPCs (verbatim relay)
             • key-bearing APIs (Etherscan/paid RPC — key stays server-side)
             • optional shared/rate-limited public gateway
        ▼
EVM RPC providers (per chain): latest + archive; debug/trace-capable where available
```

The proxy is **selective** (see §5.7): the browser talks to public/BYO RPCs directly; the
serverless proxy only fronts CORS-less nodes and secret-bearing APIs.

### 5.2 Tech stack

- Frontend: Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui.
- EVM: **viem** (typed, tree-shakeable, first-class `stateOverride`, ABI + error decoding).
- Wallet: wagmi + WalletConnect v2 (broadcast only).
- Backend: Next.js route handlers or a small Hono/Fastify service on serverless.
- ABI/selector lookup: openchain.xyz signature DB + Sourcify + explorer-compatible ABI
  fetch (per chain).
- Local fork: Foundry **Anvil** (`anvil --fork-url ...`) for deterministic tests and an
  optional sandbox mode.
- Testing: vitest (unit/integration) + Playwright (e2e), with a forked Anvil in CI.

### 5.3 Simulation engine (the "Tenderly" core)

Three layers, cheap → powerful:

**(a) Basic replay — `eth_call` at a block**

```ts
import { createPublicClient, http } from "viem";

const client = createPublicClient({ transport: http(RPC_URL) });

const result = await client.call({
  account: from,
  to,
  data: calldata,
  value,
  blockNumber, // pin to reproduce historical reverts; omit for "latest"
});
// On revert with a known ABI, viem throws a decoded error.
```

**(b) State overrides — the probe superpower** (fake balances/allowances/storage/code):

```ts
const result = await client.call({
  to, data: calldata, account: from, blockNumber,
  stateOverride: [
    { address: token, stateDiff: [{ slot: allowlistSlot, value: TRUE }] },
    { address: from, balance: parseEther("100") },
  ],
});
```

**(c) Full call trace — `debug_traceCall`** (nested tree, which leg reverted, asset diff):

```ts
const trace = await client.request({
  method: "debug_traceCall",
  params: [
    { from, to, data: calldata, value: toHex(value) },
    blockNumberHex,
    { tracer: "callTracer", tracerConfig: { withLog: true } },
  ],
});
// Render as a tree; each node: to/from/input/output/error/gasUsed.
// Use prestateTracer (diff mode) for balance/storage-change ("asset diff") views.
```

**Simulation flow:** resolve inputs → try `debug_traceCall` (rich) → fall back to `eth_call`
(pass/fail + return data) → decode return/revert → if revert, auto-suggest probes → render
status, decoded steps, revert reason, gas, trace tree, asset diff.

**Battle-tested rules (from the prior-art Simulator — see Appendix A):**
- When simulating a **signed raw tx**, recover the sender with viem `recoverTransactionAddress`
  / `parseTransaction`. **Never omit `from` for contract calls** — many nodes treat a missing
  `from` as `msg.sender = 0x0` and revert spuriously.
- **Do not reuse the signed tx's fee fields.** Fetch fresh network fees
  (`estimateFeesPerGas`, fallback to `block.baseFeePerGas`) and a fresh `estimateGas` + a small
  buffer for the `eth_call`. Stale/foreign fee fields cause false failures.
- **Trace fallback chain:** `debug_traceCall` (Geth/Erigon/Nethermind, `callTracer` +
  `withLog`) → `trace_call` (Parity/OpenEthereum/Erigon, `['trace','vmTrace','stateDiff']`) →
  plain `eth_call`. Normalize both trace shapes into one tree model; show a clear "trace not
  available on this RPC" message on total fallback.

### 5.4 Decoding subsystem

- **Function/calldata decoder:** `decodeFunctionData({ abi, data })`. Recursively expand
  container selectors: `multicall(bytes[])`, EVC `batch`, Gnosis Safe `execTransaction`,
  Permit2 `permit`. Keep a registry: container selector → how to unpack sub-calls.
- **Revert decoder:** `decodeErrorResult({ abi, data })`; handle `Error(string)`
  (`0x08c379a0`), `Panic(uint256)` (`0x4e487b71`) with the Solidity **panic-code map**, and
  custom errors. When ABI is unknown, look up the 4-byte selector via openchain and show
  candidate signatures.
- **Seed selector table:** ship a built-in `COMMON_SELECTORS` map (ERC-20/721/1155, Ownable,
  Pausable) and the `PANIC_CODES` map so the most frequent calls/reverts decode with zero
  network lookups — both can be lifted verbatim from the prior-art Simulator (Appendix A).
- **ABI resolution:** user-pasted → Sourcify → explorer API (Etherscan V2 multichain, per
  chain) → selector DB. Cache aggressively.

### 5.5 Chains & RPC

- **Default: Ethereum (1).** Boots with a public RPC so it works with zero config.
- **Top-10 registry** (single editable JSON; id, name, native, default public RPC, explorer,
  capability flags):

  | # | Chain | chainId | Native |
  |---|-------|---------|--------|
  | 1 | Ethereum (default) | 1 | ETH |
  | 2 | Arbitrum One | 42161 | ETH |
  | 3 | OP Mainnet | 10 | ETH |
  | 4 | Base | 8453 | ETH |
  | 5 | Polygon PoS | 137 | POL |
  | 6 | BNB Smart Chain | 56 | BNB |
  | 7 | Avalanche C-Chain | 43114 | AVAX |
  | 8 | Linea | 59144 | ETH |
  | 9 | Scroll | 534352 | ETH |
  | 10 | zkSync Era | 324 | ETH |

  (Swap in Gnosis `100`, Blast `81457`, or Mantle `5000` per audience.)
- **Reuse vetted RPC + explorer values.** The prior-art Simulator/Broadcaster ship a working
  ~40-chain `EVM_NETWORKS` list plus a `CHAIN_ID_MAP` (chainId → { name, public RPC, explorer
  `/tx/` base }). Lift the entries for the top-10 verbatim rather than re-researching public
  RPCs (see Appendix A for exact values). Keep them in one editable JSON.
- **Dynamic chain list (optional):** the Etherscan V2 multichain **chainlist**
  (`https://api.etherscan.io/v2/chainlist`) returns every supported chain (id, name, explorer);
  parse it to offer more chains without hardcoding, filtering out testnets. Ethereum stays the
  default.
- **BYO-RPC + custom chain:** always available — paste a chainId + RPC URL to work on any
  chain outside the top-10 (new L2s, testnets, private chains).
- **Auto-detect chain from a raw tx:** for signed-tx / RLP inputs, decode the chainId from the
  RLP (typed-tx: chainId is the first item after the type byte; legacy: derive from `v`) and
  auto-select the network — a proven UX from the prior-art tools.
- **Capability probe on select:** `web3_clientVersion`, latest block, a cheap
  `debug_traceCall` → `{ archive, debug, estimateGas }` badge. Degrade gracefully.

### 5.6 Broadcasting (client-side only)

- Never accept/store private keys server-side. Broadcast via connected wallet
  (`walletClient.sendTransaction` / `writeContract`) or relay a user-pasted **pre-signed raw
  tx** through `eth_sendRawTransaction` (bytes only).
- **Raw-RLP rebroadcast** (from the prior-art Broadcaster): accept one-or-many RLP-encoded
  signed txs (paste / file upload), auto-detect the chain per line, and broadcast in batch with
  retry/backoff and clear per-tx success/hash/error reporting. Great for "stuck tx" recovery.
- **Pre-flight checklist** auto-runs before enabling broadcast: `estimateGas`, nonce via
  `getTransactionCount`, balance ≥ value+fee, chainId match, final simulation. Warn loudly
  on a simulated revert. After broadcast: poll receipt, feed the hash back into the trace
  view.
- **Multi-VM (stretch, not v1):** the prior-art Broadcaster also submits Solana
  (`sendTransaction` + `skipPreflight`/`maxRetries`), XRP (`submit` `tx_blob`), and Bitcoin
  (`/sendRawTransaction`). Keep the broadcast layer pluggable so non-EVM submitters can be
  added later without touching the EVM path. v1 stays EVM-only.

### 5.7 Proxy model, security & abuse (public tool)

**Proxy is selective, not mandatory** (correction from the prior art — see Appendix A). Most
public RPCs send CORS headers, so the browser calls them **directly** with no proxy. Route
through the backend proxy only when needed:
1. **CORS-less RPCs** (e.g. some enterprise/self-hosted nodes) — server relays the JSON-RPC
   POST verbatim (the prior-art `cortex-rpc` route is the reference pattern).
2. **Key-bearing APIs** (Etherscan V2, paid RPC providers) — the key lives in the proxy/env
   and never reaches the browser; expose it via a gated `/api/<service>/key` or a passthrough.
3. **Rate-limited/cached public gateway** — optional shared endpoint for users without their
   own RPC.

When a request does go through the proxy, enforce:
- an **RPC method allowlist**: `eth_call`, `eth_estimateGas`, `eth_getTransaction*`,
  `eth_getBlockByNumber`, `eth_getCode`, `eth_getBalance`, `eth_getTransactionCount`,
  `debug_traceCall`, `trace_call`, `eth_sendRawTransaction`; block `eth_accounts`, admin, and
  node-management methods.
- per-IP rate limit; cache immutable reads (tx by hash, code, historical calls);
- client-side pacing for shared keys (mirror the prior-art `etherscanRateLimit`: min interval
  + daily budget) so one shared Etherscan key isn't burned.
- **BYO-key/RPC bypass:** when a user supplies their own RPC/Etherscan key, call it directly
  and skip the shared proxy/limits.
- Validate/checksum all inputs (address, hex length, chainId). Never `eval` ABIs. No secrets
  in the client.

### 5.8 Repo layout

```
evm-troubleshooter/
├─ apps/web/                 # Next.js app
│  ├─ app/                   # routes, pages
│  ├─ components/            # trace viewer, decoder UI, probe chips
│  └─ lib/                   # thin UI adapters over packages/core
├─ apps/proxy/               # serverless RPC proxy (allowlist, rate limit, cache)
├─ packages/core/            # framework-agnostic sim/decode logic (testable)
│  ├─ simulate.ts            # eth_call / debug_traceCall wrappers
│  ├─ decode.ts              # calldata + revert decoding, container unpackers
│  ├─ overrides.ts           # state-override builders
│  ├─ chains.ts              # registry + capability probe
│  └─ abi/                   # abi resolution (sourcify/explorer/openchain)
└─ test/                     # vitest + anvil fork fixtures + Playwright e2e
```

Put sim/decode logic in `packages/core` (pure functions over a `PublicClient`) so it is
unit-testable against a forked Anvil and reusable as an npm package/CLI later.

---

## 6. Milestones map

Phases build strictly on each other. Read-only value lands first (Phases 0–6), then
build/broadcast (7), then collaboration/polish/launch (8–10).

---

## 7. Phased plan (scaffold → full product)

Each phase lists **Goal**, **Tasks**, and **Acceptance criteria (phase gate)**.

### Phase 0 — Foundation & CI
**Goal:** runnable monorepo with tooling and green CI.
**Tasks:** pnpm workspace (`apps/web`, `apps/proxy`, `packages/core`, `test`); TS strict
configs; ESLint + Prettier; Tailwind + shadcn; vitest + Playwright wired; Foundry/Anvil
install script; CI running typecheck/lint/test + a forked-Anvil job; base `README`.
**Acceptance:** `pnpm i && pnpm build && pnpm test` succeed locally and in CI; a trivial
`core` unit test and a trivial Playwright test pass; Anvil fork boots in CI.

### Phase 1 — Chain registry & RPC capability
**Goal:** default ETH + top-10 chains + BYO-RPC, with capability detection.
**Tasks:** `packages/core/chains.ts` registry JSON seeded with the top-10 (§5.5, ETH
default); `createClientForChain(chainId | customRpc)`; capability probe
(`web3_clientVersion`, latest block, cheap `debug_traceCall`) → `{ archive, debug,
estimateGas }`; UI chain switcher + "add custom chain/RPC" form; persist selection.
**Acceptance:** switching chains reconnects; custom RPC works; capability badges reflect
reality (unit-tested against mocked transports + one live ETH smoke test in CI).

### Phase 2 — RPC proxy (secure gateway)
**Goal:** all node calls route through a hardened proxy.
**Tasks:** `apps/proxy` serverless handler; **method allowlist** (§5.7); per-IP rate limit;
response cache for immutable reads; provider keys via env; block admin/account methods;
client points to proxy by default, BYO-RPC bypasses to the user's node.
**Acceptance:** disallowed methods rejected (tested); rate limit returns 429 past threshold;
cached read served without upstream hit; no keys in the client bundle (grep test in CI).

### Phase 3 — Read & replay core
**Goal:** fetch and reproduce transactions/calls.
**Tasks:** tx-hash lookup → tx + receipt render; input auto-detect (hash | calldata | JSON
request); `simulateCall` in `core` via `eth_call` with optional `blockNumber` (historical
replay on archive-capable chains); return-data surfaced; single-input UI + results panel
skeleton.
**Acceptance:** a known mainnet tx renders correctly; a latest-block `eth_call` returns
expected data; historical replay pins to block when archive is available, else shows a clear
message. Unit tests on forked Anvil.

### Phase 4 — Decoding subsystem
**Goal:** turn bytes into meaning.
**Tasks:** `decode.ts` — `decodeFunctionData`; revert decoder for `Error(string)`, `Panic`,
and custom errors; **selector DB fallback** via openchain (proxied) with candidate
signatures; ABI resolution chain: user-pasted → Sourcify → explorer API → selector DB,
cached; **container unpackers** for `multicall(bytes[])`, EVC `batch`, Gnosis Safe
`execTransaction`, Permit2 `permit` (recursive expansion); Decoded tab UI.
**Acceptance:** the three §8 decode fixtures pass (require-string, custom error, multicall
expansion); unknown selectors show candidates; ABI resolver hits cache on repeat.

### Phase 5 — State overrides & probes
**Goal:** the "Tenderly" superpower — prove causes without touching chain.
**Tasks:** `overrides.ts` builders (balance, nonce, code, storage `stateDiff`/`state`); wire
`stateOverride` into `simulateCall`/`estimateGas`; storage-slot helpers for common ERC-20
layouts (allowance/balance) with a manual-slot fallback; **probe builder** UI: one-click
`balanceOf`, `allowance`, `transferFrom` dry-runs + auto-suggested probes derived from a
decoded revert's args.
**Acceptance:** overriding an allowance slot flips a failing `transferFrom` sim from
revert→success (forked-Anvil test); probe chips return correct pass/fail; suggestions are
generated from a decoded custom error.

### Phase 6 — Trace tree & asset diff
**Goal:** show the full call tree and balance changes; highlight the failing leg.
**Tasks:** `debug_traceCall` with `callTracer` (+ `withLog`) → tree model; reverting node
highlighted with decoded error inline; `prestateTracer` diff mode → asset/storage-change
view; **graceful fallback** to `eth_call` pass/fail when trace is unsupported (badge shown);
Trace + Asset Diff tabs.
**Acceptance:** a nested multicall renders as a tree with the reverting leg flagged; asset
diff shows token/native deltas; on a non-debug chain the UI degrades cleanly (tested with a
capability mock).

### Phase 7 — Build call & broadcast (client-side only)
**Goal:** compose and send transactions safely.
**Tasks:** ABI-driven form → encode calldata (per-arg validation); wagmi + WalletConnect v2
connect; `walletClient.sendTransaction` / `writeContract`; raw pre-signed tx relay via
`eth_sendRawTransaction`; **pre-flight checklist** (§5.6) with a loud warning on simulated
revert; post-broadcast receipt polling → feed hash back into the trace view.
**Acceptance:** encode round-trips (encode→decode identity test); the broadcast path works
on a testnet/forked chain via a mock wallet in Playwright; pre-flight blocks/warns on a
would-revert tx; **no server-side key handling** (audited in review + CI grep).

### Phase 8 — Sharing, reports & recipes
**Goal:** collaboration and reuse.
**Tasks:** shareable permalink encoding the full request (chain, from/to/value/data/block/
overrides) → one-click reproduce; "Copy report" → markdown summary; saved **recipes/
templates** (e.g., approve-then-swap) with param slots, stored locally + exportable.
**Acceptance:** a permalink reproduces an identical simulation on load; exported markdown
contains decode + result + probes; a saved recipe re-runs with new params.

### Phase 9 — UX polish & docs
**Goal:** production-grade feel.
**Tasks:** loading/empty/error states everywhere; responsive layout; dark mode; input
validation messages; landing page; in-app help + examples per supported chain; accessibility
pass (focus, labels, contrast); `README` + deploy guide + `CONTRIBUTING`.
**Acceptance:** axe shows no critical issues on main views; all inputs have validation +
helpful errors; docs let a new dev run and deploy from scratch.

### Phase 10 — Hardening & launch
**Goal:** ship it.
**Tasks:** full §8 E2E suite in CI (forked Anvil) + live smoke on ≥3 chains; load/rate-limit
test on the proxy; bundle-secret scan; perf-budget check (<2.5s warm render); error
monitoring hook; deploy to a public URL; tag v1.0.0.
**Acceptance:** the §1 global gate is fully green; public demo URL live; release tagged.

---

## 8. Final acceptance E2E scenarios (must all pass)

Run on CI against forked Ethereum mainnet (deterministic) and smoke on live chains. All are
chain-agnostic and mostly latest-block, so any public RPC works.

1. **Decode & simulate a failing `transferFrom` (no allowance):** sim reverts; decoder shows
   `Error(string)` *or* OZ `ERC20InsufficientAllowance(...)`; balance probe ok, allowance
   probe fail.
2. **Prove the fix with a state override:** override the allowance storage slot → the same
   calldata now simulates **success** (root-cause isolation demo).
3. **Container unpacking:** a Uniswap `multicall(bytes[])` / Universal Router call expands
   into readable sub-steps in the Decoded + Trace tabs.
4. **Slippage revert + trace:** a swap with too-high `amountOutMin` reverts; the trace tree
   highlights the failing leg with the decoded router error.
5. **Historical replay:** re-simulate a known past reverting tx pinned to its block (on an
   archive-capable RPC) and reproduce the exact revert.
6. **Custom chain via BYO-RPC:** add a non-top-10 chain by chainId + RPC and run scenario 1
   end-to-end.
7. **Cross-chain parity:** run scenario 1 on ≥3 of the top-10 (e.g., Arbitrum, Base,
   Polygon) by switching chains only.
8. **Build & broadcast (mock wallet):** encode a call, pass pre-flight, broadcast on a forked
   chain, poll receipt, feed the hash back into the trace.
9. **Permalink reproduce:** a generated share link reloads the exact simulation.
10. **Security guardrails:** the proxy rejects a disallowed RPC method and enforces the rate
    limit; no secret/private-key material in the client bundle.

**When scenarios 1–10 are green AND the §1 global gate holds, the product is fully
complete.**

---

## Appendix A — Prior art & reuse (Fireblocks internal support tools)

Before building, study the existing internal port. It already solves large parts of this
problem and its patterns are vetted in production. **Reuse the generic EVM logic; exclude
everything Fireblocks-/deployment-specific.**

### Sources
- Public (legacy) demo: `killhitstudios.com/broadcaster` — a "Rebroadcaster" that broadcasts
  RLP-encoded txs across ~40 chains with auto-detect. Now moved internal; treat as reference.
- `gitlab.com/fireblocks/tools/support-tools/internal-support-tools-front` — **Next.js 15/16
  (App Router) + TS + Tailwind + viem** port of `monad-boss-game-web`. Tools live under
  `src/app/(tools)/`. Route handlers under `src/app/api/`. This is the closest existing
  analog to our product.
- `gitlab.com/fireblocks/tools/support-tools/internal-support-tools-back` — Hono/Node backend
  (faucet, chaincanon proxy). **Mostly not relevant** (Fireblocks-internal).

### Directly reusable (lift into `packages/core` / UI)
- **Simulator** (`src/app/(tools)/simulator/page.tsx`): the exact simulate flow we want —
  parse signed RLP, `recoverTransactionAddress` for `from`, fresh `estimateFeesPerGas` +
  `estimateGas` + buffer, `client.call` for pass/fail, `decodeErrorResult` for reverts, and
  `debug_traceCall`(callTracer,withLog) with a `trace_call` fallback + a normalized trace-tree
  parser. Also `PANIC_CODES` and a `COMMON_SELECTORS` (ERC-20/721/1155/Ownable/Pausable) map
  — lift both verbatim.
- **Chain registry** (`EVM_NETWORKS` + `CHAIN_ID_MAP` in the Simulator/Broadcaster): ~40
  chains with public RPCs + explorer `/tx/` bases. Copy the top-10 entries into our registry
  instead of re-researching. Includes the RLP→chainId auto-detect logic.
- **Broadcaster** (`src/app/(tools)/broadcaster/page.tsx`): multi-line RLP paste/upload,
  per-line chain auto-detect, batch broadcast with retry, `eth_sendRawTransaction` (+ Solana/
  XRP/BTC submitters as a pluggable stretch reference).
- **tx-fetcher** (`tx-fetcher/EvmFetcher.tsx`): fetch by hash (`eth_getTransactionByHash`) and
  nonce-only mode (`eth_getTransactionCount`) — feeds our read/replay + pre-flight.
- **RPC proxy pattern** (`src/app/api/cortex-rpc/route.ts`): minimal verbatim JSON-RPC relay
  for CORS-less endpoints, with structured fetch-error diagnostics. Model for our selective
  proxy (§5.7).
- **Shared-key rate limiting** (`@/lib/etherscanRateLimit`, `/api/etherscan/key`): min-interval
  + daily-budget pacing for a shared Etherscan V2 key; and the Etherscan V2 **chainlist** for a
  dynamic chain list. Adapt to BYO-key for the public tool.

### Gaps our tool adds (not in the prior art)
- **State overrides / isolation probes** (the technique that actually root-caused the Euler
  case) — override balances/allowances/storage and re-simulate. This is the headline
  differentiator.
- **`prestateTracer` asset-diff** view.
- **Container/batch unpacking** (`multicall`, EVC `batch`, Safe `execTransaction`, Permit2).
- **Selector DB fallback** (openchain) + **ABI resolution** (Sourcify/explorer) for unknown
  contracts.
- **Unified single-input box** (hash | calldata | raw tx auto-detected) instead of separate
  tool pages, plus **permalinks** and **markdown report export**.
- **Historical replay at an arbitrary block** for calldata (not just latest / signed tx).

### Explicitly EXCLUDE (Fireblocks-internal / not public)
Okta / `oauth2-proxy` auth, Fireforge deploy config, faucet, easy-cosigner, webhook-tester,
callback-handler, chaincanon/Explorer, Cortex endpoints, and `fireblocksAssetChainMap`. None
of these belong in the public tool.

### How reuse maps to phases
- Phase 1 (chains): seed registry from `EVM_NETWORKS`/`CHAIN_ID_MAP`; add RLP auto-detect.
- Phase 2 (proxy): base it on the `cortex-rpc` relay; make it selective (§5.7).
- Phase 3 (read/replay): port tx-fetcher + the Simulator's recover-from + fresh-fees flow.
- Phase 4 (decode): lift `COMMON_SELECTORS` + `PANIC_CODES`; add openchain + Sourcify.
- Phase 6 (trace): port the `debug_traceCall`→`trace_call` fallback + trace-tree parser.
- Phase 7 (broadcast): port the Broadcaster's RLP batch + auto-detect + retry.

**License/attribution note:** these are internal Fireblocks repos. Since the product is public
and non-Fireblocks, re-implement the generic EVM logic cleanly in `packages/core` (patterns and
constants like public RPCs/selectors/panic-codes are fine to reuse; do not copy internal auth/
deploy/Fireblocks-specific code). Confirm licensing before copying any file verbatim.
