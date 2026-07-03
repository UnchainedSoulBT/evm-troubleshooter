import {
  CHAINS,
  createClientForChain,
  probeCapabilities,
  simulateCall,
} from "@evm-troubleshooter/core";
import { encodeFunctionData, erc20Abi, isAddress } from "viem";
import { describe, expect, it } from "vitest";

/**
 * §8 scenario 7 / §1.2: smoke-pass live against ≥3 of the top-10 chains.
 * Each chain's canonical USDC(.e) — a read that must return non-empty data.
 * Uses the public registry RPCs directly (no proxy) so it runs anywhere.
 */
const TARGETS: { chainId: number; name: string; usdc: `0x${string}` }[] = [
  {
    chainId: 42161,
    name: "Arbitrum One",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    chainId: 8453,
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    chainId: 137,
    name: "Polygon PoS",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  {
    chainId: 10,
    name: "OP Mainnet",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
];

const HOLDER = "0x0000000000000000000000000000000000000001" as const;

describe("live cross-chain smoke (§8.7)", () => {
  let passed = 0;

  it.each(TARGETS)(
    "simulates a USDC read on $name",
    async ({ chainId, usdc }) => {
      const registryChain = CHAINS.find((c) => c.chainId === chainId);
      expect(registryChain).toBeDefined();
      expect(isAddress(usdc)).toBe(true);

      const client = createClientForChain(chainId);

      // capability probe must at least reach the node
      const caps = await probeCapabilities(client);
      if (caps.latestBlock === null) {
        // public RPC transiently down — don't fail the whole gate for one
        console.warn(`skip ${chainId}: RPC unreachable`);
        return;
      }

      const outcome = await simulateCall(client, {
        to: usdc,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [HOLDER],
        }),
      });
      expect(outcome.status).toBe("success");
      passed += 1;
    },
  );

  it("passed on at least 3 chains", () => {
    expect(passed).toBeGreaterThanOrEqual(3);
  });
});
