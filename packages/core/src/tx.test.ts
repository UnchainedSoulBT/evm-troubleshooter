import { createPublicClient, custom, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { fetchTransaction, replayRequestFromTx } from "./tx";

const HASH =
  "0x60286c0fee3a46697e3ea4b04bc229f5db4b65d001d93563351fb66d81301561" as const;

const RPC_TX = {
  hash: HASH,
  from: "0x000000000000000000000000000000000000dead",
  to: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  input: "0xa9059cbb",
  value: "0x0",
  gas: "0xea60",
  gasPrice: "0x3b9aca00",
  nonce: "0x1",
  blockNumber: "0x112a880",
  blockHash: "0x" + "11".repeat(32),
  transactionIndex: "0x0",
  type: "0x0",
  v: "0x25",
  r: "0x" + "22".repeat(32),
  s: "0x" + "33".repeat(32),
  chainId: "0x1",
};

function mockClient(
  handler: (method: string, params: unknown) => unknown,
): PublicClient {
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

describe("fetchTransaction", () => {
  it("returns tx + receipt for a mined transaction", async () => {
    const client = mockClient((method) => {
      if (method === "eth_getTransactionByHash") return RPC_TX;
      if (method === "eth_getTransactionReceipt")
        return {
          transactionHash: HASH,
          status: "0x0",
          blockNumber: "0x112a880",
          blockHash: RPC_TX.blockHash,
          transactionIndex: "0x0",
          from: RPC_TX.from,
          to: RPC_TX.to,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          logs: [],
          logsBloom: "0x" + "00".repeat(256),
          type: "0x0",
          effectiveGasPrice: "0x3b9aca00",
        };
      throw new Error(`unexpected ${method}`);
    });

    const fetched = await fetchTransaction(client, HASH);
    expect(fetched).not.toBeNull();
    expect(fetched?.tx.from.toLowerCase()).toBe(
      "0x000000000000000000000000000000000000dead",
    );
    expect(fetched?.receipt?.status).toBe("reverted");
  });

  it("returns null for an unknown hash", async () => {
    const client = mockClient((method) => {
      if (method === "eth_getTransactionByHash") return null;
      throw new Error(`unexpected ${method}`);
    });
    expect(await fetchTransaction(client, HASH)).toBeNull();
  });

  it("returns a null receipt for a pending tx", async () => {
    const client = mockClient((method) => {
      if (method === "eth_getTransactionByHash")
        return { ...RPC_TX, blockNumber: null, blockHash: null };
      if (method === "eth_getTransactionReceipt") return null;
      throw new Error(`unexpected ${method}`);
    });
    const fetched = await fetchTransaction(client, HASH);
    expect(fetched?.receipt).toBeNull();
  });
});

describe("replayRequestFromTx", () => {
  it("pins the replay to the parent block", async () => {
    const client = mockClient((method) =>
      method === "eth_getTransactionByHash"
        ? RPC_TX
        : method === "eth_getTransactionReceipt"
          ? null
          : (() => {
              throw new Error(`unexpected ${method}`);
            })(),
    );
    const fetched = await fetchTransaction(client, HASH);
    const req = replayRequestFromTx(fetched!.tx);
    expect(req.blockNumber).toBe(18_000_000n - 1n);
    expect(req.from?.toLowerCase()).toBe(
      "0x000000000000000000000000000000000000dead",
    );
    expect(req.data).toBe("0xa9059cbb");
  });
});
