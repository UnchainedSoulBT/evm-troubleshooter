import registry from "./registry.json";

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface ChainInfo {
  chainId: number;
  name: string;
  nativeCurrency: NativeCurrency;
  /** Default public, CORS-enabled RPC. Users can always bring their own. */
  rpcUrl: string;
  /** Explorer origin without a trailing slash, e.g. https://etherscan.io */
  explorerUrl: string;
}

export const CHAINS: readonly ChainInfo[] = registry.chains;

export const DEFAULT_CHAIN_ID = 1;

export function getChain(chainId: number): ChainInfo | undefined {
  return CHAINS.find((c) => c.chainId === chainId);
}

export function txExplorerUrl(
  chainId: number,
  txHash: string,
): string | undefined {
  const chain = getChain(chainId);
  return chain ? `${chain.explorerUrl}/tx/${txHash}` : undefined;
}
