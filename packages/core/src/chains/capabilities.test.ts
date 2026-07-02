import { createPublicClient, custom, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { probeCapabilities } from "./capabilities";

type Handler = (method: string, params: unknown) => unknown;

function mockClient(handler: Handler): PublicClient {
  return createPublicClient({
    transport: custom(
      {
        request: async ({
          method,
          params,
        }: {
          method: string;
          params: unknown;
        }) => handler(method, params),
      },
      { retryCount: 0 },
    ),
  });
}

const fullNode: Handler = (method) => {
  switch (method) {
    case "web3_clientVersion":
      return "Geth/v1.16.0";
    case "eth_blockNumber":
      return "0x152dd10";
    case "eth_getBalance":
      return "0x0";
    case "eth_estimateGas":
      return "0x5208";
    case "debug_traceCall":
      return { type: "CALL", from: "0x", to: "0x", calls: [] };
    default:
      throw new Error(`unexpected method ${method}`);
  }
};

describe("probeCapabilities", () => {
  it("reports a fully capable node", async () => {
    const caps = await probeCapabilities(mockClient(fullNode));
    expect(caps).toEqual({
      clientVersion: "Geth/v1.16.0",
      latestBlock: 22207760n,
      debug: true,
      archive: true,
      estimateGas: true,
    });
  });

  it("detects a node without debug_traceCall", async () => {
    const caps = await probeCapabilities(
      mockClient((method, params) => {
        if (method === "debug_traceCall") {
          throw new Error("the method debug_traceCall does not exist");
        }
        return fullNode(method, params);
      }),
    );
    expect(caps.debug).toBe(false);
    expect(caps.archive).toBe(true);
    expect(caps.latestBlock).toBe(22207760n);
  });

  it("detects a pruned (non-archive) node", async () => {
    const caps = await probeCapabilities(
      mockClient((method, params) => {
        if (method === "eth_getBalance") {
          const [, block] = params as [string, string];
          if (block !== "latest") throw new Error("missing trie node");
        }
        return fullNode(method, params);
      }),
    );
    expect(caps.archive).toBe(false);
    expect(caps.debug).toBe(true);
  });

  it("degrades to all-off when the RPC is unreachable", async () => {
    const caps = await probeCapabilities(
      mockClient(() => {
        throw new Error("fetch failed");
      }),
    );
    expect(caps).toEqual({
      clientVersion: null,
      latestBlock: null,
      debug: false,
      archive: false,
      estimateGas: false,
    });
  });
});
