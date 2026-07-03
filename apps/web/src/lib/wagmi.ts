import { createConfig, http, injected, mock } from "wagmi";
import { mainnet } from "wagmi/chains";
import { defineChain, type Chain } from "viem";
import type { Config, CreateConnectorFn } from "wagmi";

// well-known anvil dev account #0 — test-only, never a real key
const E2E_MOCK_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

/**
 * Local anvil chain (fixed port) so the mock wallet + broadcast path work
 * against the fork in e2e. Real wallets talk to their own RPC via the
 * injected / WalletConnect provider.
 */
export const anvilChain: Chain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const mockEnabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_E2E_MOCK_WALLET === "1";

function connectors(): CreateConnectorFn[] {
  const list: CreateConnectorFn[] = [injected()];
  if (mockEnabled) {
    list.unshift(
      mock({
        accounts: [E2E_MOCK_ACCOUNT],
        features: { defaultConnected: false },
      }),
    );
  }
  return list;
}

let cached: Config | undefined;

export function getWagmiConfig(): Config {
  cached ??= createConfig({
    // anvil first so the mock wallet (e2e) defaults to the local fork
    chains: mockEnabled ? [anvilChain, mainnet] : [mainnet, anvilChain],
    connectors: connectors(),
    transports: {
      [mainnet.id]: http("/api/rpc/1"),
      [anvilChain.id]: http("http://127.0.0.1:8545"),
    },
    ssr: true,
  });
  return cached;
}

export const isMockWallet = mockEnabled;
