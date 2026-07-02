import { describe, expect, it } from "vitest";
import { mergeChains } from "./merge";

describe("mergeChains", () => {
  it("returns the registry unchanged with no custom chains", () => {
    const merged = mergeChains([]);
    expect(merged).toHaveLength(10);
    expect(merged[0]?.chainId).toBe(1);
  });

  it("overrides the RPC of a known chain, keeping its metadata", () => {
    const merged = mergeChains([
      { chainId: 1, rpcUrl: "https://my-node.example.com" },
    ]);
    const eth = merged.find((c) => c.chainId === 1);
    expect(eth?.rpcUrl).toBe("https://my-node.example.com");
    expect(eth?.name).toBe("Ethereum");
    expect(eth?.custom).toBe(true);
    expect(merged).toHaveLength(10);
  });

  it("appends unknown chains with fallback naming", () => {
    const merged = mergeChains([
      { chainId: 31337, rpcUrl: "http://127.0.0.1:8545" },
      { chainId: 100, rpcUrl: "https://rpc.gnosischain.com", name: "Gnosis" },
    ]);
    expect(merged).toHaveLength(12);
    expect(merged.at(-2)?.name).toBe("Chain 31337");
    expect(merged.at(-1)?.name).toBe("Gnosis");
    expect(merged.at(-1)?.custom).toBe(true);
  });
});
