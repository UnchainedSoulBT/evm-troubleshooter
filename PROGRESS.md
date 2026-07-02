# Progress

Execution ledger for `PLAN.md`. The executing agent ticks each task with its commit hash and
a one-line note. Mark a phase `[x] complete` only after its acceptance gate (PLAN §7) is
green. Log blockers/decisions inline.

## Phase 0 — Foundation & CI — [x] complete
- [x] 0.0 Study prior art (PLAN Appendix A) — d223579 — GitLab repos inaccessible (auth-gated; verified via `git ls-remote` 2026-07-02). Proceeding clean-room per the Appendix A caveat: chain registry / selector maps / panic codes / trace-fallback pattern re-implemented from public sources (viem docs, openchain.xyz, Sourcify, Etherscan V2 docs, chainlist). Nothing Fireblocks-specific will ship.
- [x] 0.1 pnpm workspace (`apps/web`, `apps/proxy`, `packages/core`, `test`) — 4a14711 — pnpm 11.9.0 via corepack; proxy is a mount-anywhere Hono app (standalone dev server + `hono/vercel` mount into web planned for single-deploy)
- [x] 0.2 TS strict configs + ESLint + Prettier — 1bf4e43 — base tsconfig adds `noUncheckedIndexedAccess`/`noImplicitOverride`; root flat ESLint covers core/proxy/test, web keeps eslint-config-next
- [x] 0.3 Tailwind + shadcn/ui — 4a14711 — landed with the web scaffold (Tailwind v4 via create-next-app; shadcn init radix/vega + Button); Next is 16.2.9 — conventions re-checked against bundled docs before UI work
- [x] 0.4 vitest + Playwright wired — 784670a — single root vitest config (core+proxy, v8 coverage scoped to core); Playwright boots web via webServer, smoke test green
- [x] 0.5 Foundry/Anvil install script — 1dc5680 — idempotent foundryup script + `startAnvil` fork helper (readiness poll, ANVIL_BIN/ETH_RPC_URL overrides); fork-boot test green locally (chainId 1)
- [x] 0.6 CI: typecheck/lint/test + forked-Anvil job — e6f2d6d — two jobs: checks + fork-e2e (foundry-toolchain, `pnpm test:fork`, Playwright); ETH_RPC_URL repo var, publicnode default
- [x] 0.7 base README — c5e4051 — overview, dev setup, security model
- [x] GATE: `pnpm i && pnpm build && pnpm test` green in CI; Anvil fork boots — CI run 28601207810 (checks ✓, fork-e2e ✓ incl. Anvil mainnet-fork boot + Playwright smoke) — repo: github.com/UnchainedSoulBT/evm-troubleshooter

## Phase 1 — Chain registry & RPC capability — [ ] in progress
- [x] 1.1 `chains.ts` registry seeded with top-10 (ETH default) — 45ae632 — registry.json (single editable file) + lookup/explorer-url helpers; RPCs re-researched from public sources (prior art inaccessible)
- [x] 1.2 `createClientForChain(chainId | customRpc)` — 43cea8d — BYO-RPC merges registry metadata for known chainIds; UnknownChainError for unknown numeric ids
- [x] 1.3 capability probe → { archive, debug, estimateGas } — a34ff8d — archive probed at latest−10k blocks (block 1 was wrong: anvil forks of full nodes legitimately lack deep state); probe never throws; anvil-fork + live-ETH smoke tests included
- [x] 1.4 UI chain switcher + add custom chain/RPC form + persist — b29cc51 — localStorage via useSyncExternalStore (React Compiler lint forbids sync setState in effects); e2e proves persistence + accurate badges against a real local anvil; switched repo to extensionless relative imports for Turbopack
- [ ] GATE: chain switch reconnects; custom RPC works; badges accurate

## Phase 2 — RPC proxy (secure gateway) — [ ] not started
- [ ] 2.1 serverless handler + method allowlist
- [ ] 2.2 per-IP rate limit
- [ ] 2.3 cache for immutable reads
- [ ] 2.4 provider keys via env; client → proxy by default; BYO-RPC bypass
- [ ] GATE: disallowed method rejected; 429 past threshold; no keys in bundle

## Phase 3 — Read & replay core — [ ] not started
- [ ] 3.1 tx-hash lookup → tx + receipt render
- [ ] 3.2 input auto-detect (hash | calldata | JSON)
- [ ] 3.3 `simulateCall` via eth_call with optional blockNumber
- [ ] 3.4 single-input UI + results panel skeleton
- [ ] GATE: known tx renders; latest eth_call correct; historical replay pins to block

## Phase 4 — Decoding subsystem — [ ] not started
- [ ] 4.1 `decodeFunctionData`
- [ ] 4.2 revert decoder (Error/Panic/custom)
- [ ] 4.3 selector DB fallback (openchain, proxied)
- [ ] 4.4 ABI resolution chain (paste → Sourcify → explorer → selector DB) + cache
- [ ] 4.5 container unpackers (multicall, EVC batch, Safe, Permit2)
- [ ] 4.6 Decoded tab UI
- [ ] GATE: three §8 decode fixtures pass; unknown selectors show candidates

## Phase 5 — State overrides & probes — [ ] not started
- [ ] 5.1 `overrides.ts` builders (balance/nonce/code/storage)
- [ ] 5.2 wire stateOverride into simulate/estimateGas
- [ ] 5.3 ERC-20 slot helpers + manual-slot fallback
- [ ] 5.4 probe builder UI (balanceOf/allowance/transferFrom) + auto-suggest
- [ ] GATE: override flips transferFrom revert→success; probes correct

## Phase 6 — Trace tree & asset diff — [ ] not started
- [ ] 6.1 debug_traceCall callTracer → tree model
- [ ] 6.2 reverting node highlight + decoded error inline
- [ ] 6.3 prestateTracer diff → asset diff view
- [ ] 6.4 graceful fallback to eth_call + capability badge
- [ ] GATE: nested multicall tree flags reverting leg; asset diff shows deltas; degrades cleanly

## Phase 7 — Build call & broadcast — [ ] not started
- [ ] 7.1 ABI-driven encode form + per-arg validation
- [ ] 7.2 wagmi + WalletConnect v2 connect
- [ ] 7.3 sendTransaction/writeContract + raw tx relay
- [ ] 7.4 pre-flight checklist + would-revert warning
- [ ] 7.5 receipt polling → feed hash into trace
- [ ] GATE: encode round-trips; mock-wallet broadcast works; no server-side keys

## Phase 8 — Sharing, reports & recipes — [ ] not started
- [ ] 8.1 shareable permalink (full request) → reproduce
- [ ] 8.2 markdown report export
- [ ] 8.3 saved recipes/templates with param slots
- [ ] GATE: permalink reproduces sim; report complete; recipe re-runs

## Phase 9 — UX polish & docs — [ ] not started
- [ ] 9.1 loading/empty/error states + responsive + dark mode
- [ ] 9.2 landing page + in-app help/examples
- [ ] 9.3 accessibility pass
- [ ] 9.4 README + deploy guide + CONTRIBUTING
- [ ] GATE: no critical axe issues; inputs validated; docs enable fresh setup

## Phase 10 — Hardening & launch — [ ] not started
- [ ] 10.1 full §8 E2E in CI + live smoke on ≥3 chains
- [ ] 10.2 load/rate-limit test + bundle-secret scan
- [ ] 10.3 perf-budget check (<2.5s warm render) + error monitoring
- [ ] 10.4 deploy public URL + tag v1.0.0
- [ ] GATE: PLAN §1 global gate green; demo live; release tagged

---
BLOCKERS: (none)
DECISIONS-NEEDED: (none)
