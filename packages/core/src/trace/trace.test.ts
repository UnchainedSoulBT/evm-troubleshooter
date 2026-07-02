import { createPublicClient, custom, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { assetDiffFromPrestate, traceCall } from "./trace";

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

const REQ = {
  from: "0x000000000000000000000000000000000000000a" as const,
  to: "0x000000000000000000000000000000000000000b" as const,
  data: "0xabcdef" as const,
};

describe("traceCall fallback chain", () => {
  it("uses debug_traceCall when available", async () => {
    const client = mockClient((method) => {
      if (method === "debug_traceCall")
        return { type: "CALL", from: REQ.from, to: REQ.to, input: REQ.data };
      throw new Error("should not reach here");
    });
    const result = await traceCall(client, REQ);
    expect(result.source).toBe("debug_traceCall");
    expect(result.root?.to).toBe(REQ.to);
  });

  it("falls back to trace_call when debug is unsupported", async () => {
    const client = mockClient((method) => {
      if (method === "debug_traceCall")
        throw new Error("the method debug_traceCall does not exist");
      if (method === "trace_call")
        return [
          {
            traceAddress: [],
            type: "call",
            action: { from: REQ.from, to: REQ.to, input: REQ.data },
            result: { gasUsed: "0x1" },
          },
        ];
      throw new Error(`unexpected ${method}`);
    });
    const result = await traceCall(client, REQ);
    expect(result.source).toBe("trace_call");
    expect(result.root?.to).toBe(REQ.to);
  });

  it("reports unavailable when neither tracer exists", async () => {
    const client = mockClient((method) => {
      if (method === "debug_traceCall") throw new Error("does not exist");
      if (method === "trace_call") throw new Error("does not exist");
      throw new Error(`unexpected ${method}`);
    });
    const result = await traceCall(client, REQ);
    expect(result.source).toBe("none");
    expect(result.root).toBeNull();
    expect(result.unavailableReason).toBeDefined();
  });
});

describe("assetDiffFromPrestate", () => {
  it("computes native balance deltas from pre/post state", async () => {
    const client = mockClient((method, params) => {
      if (method !== "debug_traceCall") throw new Error(`unexpected ${method}`);
      const cfg = (params as unknown[])[2] as {
        tracerConfig?: { diffMode?: boolean };
      };
      // prestateTracer diff mode returns { pre, post }
      if (cfg.tracerConfig?.diffMode) {
        return {
          pre: {
            "0x000000000000000000000000000000000000000a": {
              balance: "0xde0b6b3a7640000", // 1 eth
            },
          },
          post: {
            "0x000000000000000000000000000000000000000a": {
              balance: "0x1bc16d674ec80000", // 2 eth
            },
          },
        };
      }
      return {};
    });

    const diffs = await assetDiffFromPrestate(client, REQ);
    const native = diffs.find((d) => d.token === null);
    expect(native?.delta).toBe(10n ** 18n); // +1 eth
    expect(native?.address).toBe("0x000000000000000000000000000000000000000a");
  });

  it("returns an empty diff when prestate is unsupported", async () => {
    const client = mockClient(() => {
      throw new Error("prestateTracer not supported");
    });
    expect(await assetDiffFromPrestate(client, REQ)).toEqual([]);
  });
});
