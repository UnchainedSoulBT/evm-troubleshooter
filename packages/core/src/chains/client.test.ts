import { describe, expect, it } from "vitest";
import { createClientForChain, UnknownChainError } from "./client.js";

describe("createClientForChain", () => {
  it("creates a client for a registry chain by id", () => {
    const client = createClientForChain(1);
    expect(client.chain?.id).toBe(1);
    expect(client.chain?.name).toBe("Ethereum");
    expect(client.transport.url).toBe("https://ethereum-rpc.publicnode.com");
  });

  it("throws for an unknown numeric chain id", () => {
    expect(() => createClientForChain(999999)).toThrow(UnknownChainError);
  });

  it("creates a client for a custom chain (BYO-RPC)", () => {
    const client = createClientForChain({
      chainId: 31337,
      rpcUrl: "http://127.0.0.1:8545",
    });
    expect(client.chain?.id).toBe(31337);
    expect(client.transport.url).toBe("http://127.0.0.1:8545");
    expect(client.chain?.name).toBe("Chain 31337");
  });

  it("merges registry metadata when a custom RPC targets a known chain", () => {
    const client = createClientForChain({
      chainId: 8453,
      rpcUrl: "https://my-private-base-node.example.com",
    });
    expect(client.chain?.id).toBe(8453);
    expect(client.chain?.name).toBe("Base");
    expect(client.transport.url).toBe(
      "https://my-private-base-node.example.com",
    );
  });
});
