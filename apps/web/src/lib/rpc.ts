import type { MergedChain } from "@evm-troubleshooter/core";

/**
 * Registry chains route through the app's proxy (allowlist + rate limit,
 * server-side provider keys); user-supplied BYO-RPC chains bypass it and go
 * straight to the user's node (PLAN §5.7). Client-side only.
 */
export function rpcUrlFor(chain: MergedChain): string {
  if (chain.custom) return chain.rpcUrl;
  return `${window.location.origin}/api/rpc/${chain.chainId}`;
}
