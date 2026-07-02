import {
  createPublicClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { getChain, type ChainInfo } from "./registry";

export interface CustomChainConfig {
  chainId: number;
  rpcUrl: string;
  name?: string;
}

/** A registry chain id, or a BYO-RPC config for any chain. */
export type ChainTarget = number | CustomChainConfig;

export class UnknownChainError extends Error {
  constructor(chainId: number) {
    super(
      `Chain ${chainId} is not in the registry — pass { chainId, rpcUrl } to use a custom RPC`,
    );
    this.name = "UnknownChainError";
  }
}

function toViemChain(info: ChainInfo, rpcUrl: string): Chain {
  return defineChain({
    id: info.chainId,
    name: info.name,
    nativeCurrency: info.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: {
      default: { name: "Explorer", url: info.explorerUrl },
    },
  });
}

export function createClientForChain(target: ChainTarget): PublicClient {
  let chain: Chain;
  let rpcUrl: string;

  if (typeof target === "number") {
    const info = getChain(target);
    if (!info) throw new UnknownChainError(target);
    rpcUrl = info.rpcUrl;
    chain = toViemChain(info, rpcUrl);
  } else {
    rpcUrl = target.rpcUrl;
    const known = getChain(target.chainId);
    chain = known
      ? toViemChain(known, rpcUrl)
      : defineChain({
          id: target.chainId,
          name: target.name ?? `Chain ${target.chainId}`,
          nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        });
  }

  return createPublicClient({ chain, transport: http(rpcUrl) });
}
