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

## Phase 1 — Chain registry & RPC capability — [x] complete
- [x] 1.1 `chains.ts` registry seeded with top-10 (ETH default) — 45ae632 — registry.json (single editable file) + lookup/explorer-url helpers; RPCs re-researched from public sources (prior art inaccessible)
- [x] 1.2 `createClientForChain(chainId | customRpc)` — 43cea8d — BYO-RPC merges registry metadata for known chainIds; UnknownChainError for unknown numeric ids
- [x] 1.3 capability probe → { archive, debug, estimateGas } — a34ff8d — archive probed at latest−10k blocks (block 1 was wrong: anvil forks of full nodes legitimately lack deep state); probe never throws; anvil-fork + live-ETH smoke tests included
- [x] 1.4 UI chain switcher + add custom chain/RPC form + persist — b29cc51 — localStorage via useSyncExternalStore (React Compiler lint forbids sync setState in effects); e2e proves persistence + accurate badges against a real local anvil; switched repo to extensionless relative imports for Turbopack
- [x] GATE: chain switch reconnects; custom RPC works; badges accurate — CI green (checks ✓, fork-e2e ✓: mocked-transport unit tests, anvil-fork probe, live ETH smoke, Playwright e2e incl. real-anvil custom chain + persistence); visual check in browser OK (badges truthful for publicnode: trace/archive off, estimateGas on)

## Phase 2 — RPC proxy (secure gateway) — [x] complete
- [x] 2.1 serverless handler + method allowlist — d9f71bc — Hono createApp(deps) with injectable fetch/env/clock; allowlist extended beyond PLAN's list with read-only methods the app needs (eth_chainId/blockNumber/getStorageAt/getLogs/gasPrice/feeHistory/maxPriorityFeePerGas/web3_clientVersion); batch requests rejected; JSON-RPC-shaped errors
- [x] 2.2 per-IP rate limit — d9f71bc — token bucket (default 120/min, burst 30, env-tunable); per-instance in serverless (noted: global limit scales with instances, fine as v1 abuse brake); 429 + Retry-After
- [x] 2.3 cache for immutable reads — d9f71bc — LRU+TTL; only mined txs/receipts and block-pinned code/blocks cache; latest/pending and unmined never cache; x-proxy-cache header
- [x] 2.4 provider keys via env; client → proxy by default; BYO-RPC bypass — 02d3ffa — RPC_URL_<chainId> server-side overrides; proxy mounted into web via hono/vercel (single Vercel deploy); registry chains → /api/rpc/:chainId, custom chains direct; verbatim relay ?url= has an SSRF guard (private ranges blocked unless ALLOW_PRIVATE_RPC=1); bundle-secret script verified to both pass clean and catch a planted canary
- [x] GATE: disallowed method rejected; 429 past threshold; no keys in bundle — CI green: 43 proxy unit tests (allowlist/429/cache-hit-no-upstream/SSRF), e2e proves the mounted route rejects eth_accounts (403) and blocks SSRF, bundle-secret check passes clean AND was negative-tested against a planted canary

## Phase 3 — Read & replay core — [x] complete
- [x] 3.1 tx-hash lookup → tx + receipt render — 4ffe487 — fetchTransaction (null for unknown hash, null receipt while pending); replayRequestFromTx pins to parent block N−1 (eth_call at N sees post-block state; exact intra-block position replay intentionally out of scope)
- [x] 3.2 input auto-detect (hash | calldata | JSON) — a8bf16c — plus signed raw tx (viem parseTransaction, signature required, RLP chainId extracted); JSON request accepts hex+decimal numerics
- [x] 3.3 `simulateCall` via eth_call with optional blockNumber — 4ffe487 — raw revert data dug from viem's error chain (code 3 / data / cause walk); requestFromRawTx recovers `from` and drops stale fee fields (§5.3 battle rules); fork-proven: USDC read, no-allowance revert (§8.1 precursor), pinned replay, graceful deep-history error
- [x] 3.4 single-input UI + results panel skeleton — 6e78543 — kind badge, conditional to/from/block fields, sim/tx/replay cards; chain-mismatch warning for raw txs; fixed Mono swallowing data-testid (e2e caught it); verified live in browser vs mainnet via proxy
- [x] GATE: known tx renders; latest eth_call correct; historical replay pins to block — CI green (checks ✓, fork-e2e ✓: 12 Playwright tests incl. fork-backed tx render/replay/revert flows, 7 fork tests, 56 unit tests); revert flow also verified live vs mainnet in browser

## Phase 4 — Decoding subsystem — [x] complete
- [x] 4.1 `decodeFunctionData` — a46496a — resolution order user ABI → builtin seed → selector-DB candidates; all selectors computed from signature strings at module init (never hardcoded hex); canonical tuple signatures
- [x] 4.2 revert decoder (Error/Panic/custom) — a46496a — Error(string), Panic(uint256) w/ Solidity panic map, custom via ABI/builtin (OZ v5 ERC-6093 set)/selector DB; graceful `empty` and `unknown` kinds
- [x] 4.3 selector DB fallback (openchain, proxied) — 4766389 — GET /api/selectors/:kind/:selector, 7-day cache; errors share the 4-byte space so one openchain endpoint serves both
- [x] 4.4 ABI resolution chain + cache — 4766389/2a7d02d — proxy GET /api/abi/:chainId/:address does Sourcify → Etherscan V2 (server-side key, tested to never leak into responses); client caches in-memory and accepts pasted JSON or human-readable signatures
- [x] 4.5 container unpackers — a46496a — multicall ×3 arities, Safe execTransaction (to/value carried), Multicall3 aggregate/aggregate3/aggregate3Value, EVC batch; Permit2 permit decodes via builtin signature (nothing to expand — it has no sub-call bytes); recursion depth-capped at 5
- [x] 4.6 Decoded tab UI — 2a7d02d — tabs on sim + tx cards (Decoded default), recursive sub-call tree with target/value, decoded revert w/ args table, candidates list, optional ABI textarea; e2e rate-limit env raised for parallel workers sharing one IP
- [x] GATE: three §8 decode fixtures pass; unknown selectors show candidates — CI green; §8 fixtures covered: require-string revert (decoding.spec revert message), OZ custom error (revert.test builtin ERC20InsufficientAllowance), multicall expansion (decoding.spec 2 sub-calls); unknown selectors surface candidates (calldata.test + decoded-view)

## Phase 5 — State overrides & probes — [x] complete (gate green in CI run after 7e4f931)
- [x] 5.1 `overrides.ts` builders (balance/nonce/code/storage) — dec0b4e — plus mergeOverrides (per-address dedup)
- [x] 5.2 wire stateOverride into simulate/estimateGas — dec0b4e — SimulateRequest.stateOverride typed as core StateOverrideEntry[]; mapped to viem's stateDiff-XOR-state shape at the call boundary
- [x] 5.3 ERC-20 slot helpers + manual-slot fallback — dec0b4e — solidity+vyper mapping/nested-mapping slot math; findErc20Slot discovers the slot by probing a magic value through an override (never mutates chain); UI surfaces a manual-slot fallback message when discovery fails
- [x] 5.4 probe builder UI (balanceOf/allowance/transferFrom) + auto-suggest — 7e4f931 — read probes + prove-the-fix; suggestions derived from decoded revert (OZ custom errors + require-strings); transferFrom allowance owner correctly read from calldata arg0
- [x] GATE: override flips transferFrom revert→success; probes correct — fork test (overrides.fork) + e2e (probes.spec) both prove §8 scenario 2: decoded no-allowance revert → suggested allowance override → re-sim succeeds

## Phase 6 — Trace tree & asset diff — [x] complete
- [x] 6.1 debug_traceCall callTracer → tree model — 99795e4 — geth callTracer (+withLog) and parity trace_call both normalize into one TraceNode tree; reverts bubble up
- [x] 6.2 reverting node highlight + decoded error inline — 68d40cf — recursive TraceView flags nodes with data-reverted; error/revertReason shown inline
- [x] 6.3 prestateTracer diff → asset diff view — 99795e4+68d40cf — assetDiffFromPrestate (native balance deltas); AssetDiffView table with +/- coloring; ERC-20 log-derived deltas deferred (native covers §8.4)
- [x] 6.4 graceful fallback to eth_call + capability badge — 68d40cf — source none → dashed "trace unavailable" panel; sim pass/fail always available; capability badges already reflect trace support (Phase 1)
- [x] GATE: nested tree flags reverting leg; asset diff shows deltas; degrades cleanly — CI green (checks ✓, fork-e2e ✓); trace.fork proves reverting-leg flag on real fork; trace.spec proves UI tree + asset-diff tab (§8.4); degrade path verified live (publicnode reports trace off → dashed unavailable panel)

## Phase 7 — Build call & broadcast — [ ] in progress
- [x] 7.1 ABI-driven encode form + per-arg validation — 9904f13(core in earlier commit) — encodeCall with per-arg parse (address/uint/int/bool/bytes/string/arrays/tuples), encode↔decode identity tested; writableFunctions filters view/pure
- [x] 7.2 wagmi + WalletConnect v2 connect — 9904f13/738d7cf — wagmi 3 config: injected + WalletConnect v2 (walletConnect connector, enabled when NEXT_PUBLIC_WC_PROJECT_ID is set — public, not a secret) + mock connector gated behind NEXT_PUBLIC_E2E_MOCK_WALLET (never ships in the public build)
- [x] 7.3 sendTransaction + raw tx relay — 9904f13 — walletClient.sendTransaction (client-side signing only); raw pre-signed relay via publicClient.sendRawTransaction (bytes only, no key handling)
- [x] 7.4 pre-flight checklist + would-revert warning — 9904f13(core) — chainId match / fresh-fee gas estimate / nonce / balance≥value+fee / final simulation; broadcast disabled while any check fails; loud revert warning
- [x] 7.5 receipt polling → feed hash into trace — 9904f13 — waitForTransactionReceipt → status badge; tx hash shown (paste back into the troubleshooter input re-traces it)
- [x] GATE: encode round-trips; mock-wallet broadcast works; no server-side keys — encode↔decode unit test; broadcast.spec proves mock-wallet connect→preflight(all pass)→broadcast→success receipt on a chain-id-31337 anvil fork; no server key path (proxy allowlist includes only eth_sendRawTransaction; broadcast is client wallet only) — pending CI confirm

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
