import { createPublicClient, custom, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { preflight } from "./preflight";

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

const FROM = "0x000000000000000000000000000000000000000a" as const;
const TO = "0x000000000000000000000000000000000000000b" as const;

function happyNode(method: string): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1";
    case "eth_estimateGas":
      return "0x5208";
    case "eth_getTransactionCount":
      return "0x3";
    case "eth_getBalance":
      return "0xde0b6b3a7640000"; // 1 eth
    case "eth_gasPrice":
      return "0x3b9aca00";
    case "eth_call":
      return "0x";
    case "eth_maxPriorityFeePerGas":
      return "0x3b9aca00";
    case "eth_getBlockByNumber":
      return { baseFeePerGas: "0x3b9aca00", number: "0x1", gasLimit: "0x1" };
    default:
      throw new Error(`unexpected ${method}`);
  }
}

describe("preflight", () => {
  it("passes all checks for a fundable, simulatable tx", async () => {
    const report = await preflight(mockClient(happyNode), {
      chainId: 1,
      from: FROM,
      to: TO,
      value: 0n,
    });
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.status !== "fail")).toBe(true);
    expect(report.checks.find((c) => c.id === "nonce")?.detail).toContain("3");
  });

  it("flags a chainId mismatch", async () => {
    const report = await preflight(
      mockClient((m) => (m === "eth_chainId" ? "0x89" : happyNode(m))),
      { chainId: 1, from: FROM, to: TO, value: 0n },
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "chainId")?.status).toBe("fail");
  });

  it("fails when balance is below value + fee", async () => {
    const report = await preflight(
      mockClient((m) => (m === "eth_getBalance" ? "0x0" : happyNode(m))),
      { chainId: 1, from: FROM, to: TO, value: 10n ** 18n },
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "balance")?.status).toBe("fail");
  });

  it("warns loudly when the simulation would revert", async () => {
    const report = await preflight(
      mockClient((m) => {
        if (m === "eth_call") {
          const err = new Error("execution reverted") as Error & {
            code: number;
          };
          err.code = 3;
          throw err;
        }
        return happyNode(m);
      }),
      { chainId: 1, from: FROM, to: TO, value: 0n },
    );
    expect(report.ok).toBe(false);
    const sim = report.checks.find((c) => c.id === "simulation");
    expect(sim?.status).toBe("fail");
    expect(sim?.detail).toMatch(/revert/i);
  });
});
