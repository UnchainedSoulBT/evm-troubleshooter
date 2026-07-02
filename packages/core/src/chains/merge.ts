import type { CustomChainConfig } from "./client";
import { CHAINS, type ChainInfo } from "./registry";

export interface MergedChain extends ChainInfo {
  /** true when the RPC (or the whole chain) was supplied by the user */
  custom?: boolean;
}

/**
 * Registry chains with user-supplied BYO-RPC entries applied: a custom entry
 * for a known chainId overrides its RPC; unknown chainIds are appended.
 */
export function mergeChains(custom: CustomChainConfig[]): MergedChain[] {
  const byId = new Map(custom.map((c) => [c.chainId, c]));

  const merged: MergedChain[] = CHAINS.map((chain) => {
    const override = byId.get(chain.chainId);
    if (!override) return chain;
    byId.delete(chain.chainId);
    return { ...chain, rpcUrl: override.rpcUrl, custom: true };
  });

  for (const extra of byId.values()) {
    merged.push({
      chainId: extra.chainId,
      name: extra.name ?? `Chain ${extra.chainId}`,
      nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
      rpcUrl: extra.rpcUrl,
      explorerUrl: "",
      custom: true,
    });
  }

  return merged;
}
