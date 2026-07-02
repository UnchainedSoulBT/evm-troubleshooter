import { describe, expect, it } from "vitest";
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  getChain,
  txExplorerUrl,
} from "./registry.js";

describe("chain registry", () => {
  it("ships the top-10 chains with Ethereum as default", () => {
    expect(CHAINS).toHaveLength(10);
    expect(DEFAULT_CHAIN_ID).toBe(1);
    expect(CHAINS[0]?.chainId).toBe(1);
  });

  it("has unique chain ids and well-formed https URLs", () => {
    const ids = CHAINS.map((c) => c.chainId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chain of CHAINS) {
      expect(chain.rpcUrl).toMatch(/^https:\/\//);
      expect(chain.explorerUrl).toMatch(/^https:\/\//);
      expect(chain.explorerUrl.endsWith("/")).toBe(false);
      expect(chain.nativeCurrency.decimals).toBe(18);
      expect(chain.name.length).toBeGreaterThan(0);
    }
  });

  it("covers the exact PLAN §5.5 chain ids", () => {
    expect(new Set(CHAINS.map((c) => c.chainId))).toEqual(
      new Set([1, 42161, 10, 8453, 137, 56, 43114, 59144, 534352, 324]),
    );
  });

  it("looks up chains by id", () => {
    expect(getChain(8453)?.name).toBe("Base");
    expect(getChain(999999)).toBeUndefined();
  });

  it("builds explorer tx URLs", () => {
    expect(txExplorerUrl(1, "0xabc")).toBe("https://etherscan.io/tx/0xabc");
    expect(txExplorerUrl(999999, "0xabc")).toBeUndefined();
  });
});
