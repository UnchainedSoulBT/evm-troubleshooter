import { createPublicClient, custom, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { requestFromRawTx, simulateCall } from "./simulate";

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

describe("simulateCall", () => {
  it("returns success with return data", async () => {
    const client = mockClient((method) => {
      if (method === "eth_call") return "0x0000000000000000000000000000000000000000000000000000000000000001";
      throw new Error(`unexpected ${method}`);
    });
    const outcome = await simulateCall(client, {
      to: "0x000000000000000000000000000000000000dEaD",
      data: "0x70a08231",
    });
    expect(outcome).toEqual({
      status: "success",
      returnData:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    });
  });

  it("captures raw revert data on revert", async () => {
    const revertData =
      "0x08c379a0" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "000000000000000000000000000000000000000000000000000000000000000c" +
      "6e6f20616c6c6f77616e63650000000000000000000000000000000000000000";
    const client = mockClient(() => {
      const err = new Error("execution reverted: no allowance") as Error & {
        code: number;
        data: string;
      };
      err.code = 3;
      err.data = revertData;
      throw err;
    });
    const outcome = await simulateCall(client, {
      from: "0x000000000000000000000000000000000000dEaD",
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      data: "0x23b872dd",
    });
    expect(outcome.status).toBe("revert");
    if (outcome.status === "revert") {
      expect(outcome.revertData).toBe(revertData);
      expect(outcome.message).toMatch(/revert/i);
    }
  });

  it("passes a pinned blockNumber through to eth_call", async () => {
    let seenBlock: unknown;
    const client = mockClient((method, params) => {
      if (method === "eth_call") {
        seenBlock = (params as unknown[])[1];
        return "0x";
      }
      throw new Error(`unexpected ${method}`);
    });
    await simulateCall(client, {
      to: "0x000000000000000000000000000000000000dEaD",
      blockNumber: 18_000_000n,
    });
    expect(seenBlock).toBe("0x112a880");
  });

  it("maps transport failures to an error outcome", async () => {
    const client = mockClient(() => {
      throw new Error("fetch failed");
    });
    const outcome = await simulateCall(client, {
      to: "0x000000000000000000000000000000000000dEaD",
    });
    expect(outcome.status).toBe("error");
  });
});

describe("requestFromRawTx", () => {
  it("recovers the sender and never omits `from` (PLAN §5.3)", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const raw = await account.signTransaction({
      chainId: 1,
      type: "eip1559",
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      data: "0xa9059cbb",
      value: 123n,
      nonce: 7,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      gas: 60_000n,
    });

    const req = await requestFromRawTx(raw);
    expect(req.from).toBe(account.address);
    expect(req.to.toLowerCase()).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(req.data).toBe("0xa9059cbb");
    expect(req.value).toBe(123n);
    // stale fee fields must NOT be carried over (fresh fees are fetched
    // at simulation time); gas limit is kept
    expect(req.gas).toBe(60_000n);
    expect("maxFeePerGas" in req).toBe(false);
  });
});
