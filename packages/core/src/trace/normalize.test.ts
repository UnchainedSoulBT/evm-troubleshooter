import { describe, expect, it } from "vitest";
import { normalizeCallTracer, normalizeParityTrace } from "./normalize";

const A = "0x000000000000000000000000000000000000000a";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";

describe("normalizeCallTracer (geth debug_traceCall)", () => {
  it("builds a tree and flags the reverting leg", () => {
    const raw = {
      type: "CALL",
      from: A,
      to: B,
      value: "0x0",
      gas: "0x100000",
      gasUsed: "0x5208",
      input: "0xabcdef",
      calls: [
        {
          type: "STATICCALL",
          from: B,
          to: C,
          gas: "0x1000",
          gasUsed: "0x100",
          input: "0x70a08231",
          output: "0x01",
        },
        {
          type: "CALL",
          from: B,
          to: C,
          gas: "0x2000",
          gasUsed: "0x200",
          input: "0x23b872dd",
          error: "execution reverted",
          output: "0x08c379a0",
        },
      ],
    };

    const root = normalizeCallTracer(raw);
    expect(root.type).toBe("CALL");
    expect(root.calls).toHaveLength(2);
    expect(root.reverted).toBe(true); // bubbled from the child
    expect(root.calls[0]?.reverted).toBe(false);
    expect(root.calls[1]?.reverted).toBe(true);
    expect(root.calls[1]?.error).toBe("execution reverted");
    expect(root.calls[1]?.depth).toBe(1);
    expect(root.gasUsed).toBe(0x5208n);
  });

  it("captures logs when withLog is enabled", () => {
    const raw = {
      type: "CALL",
      from: A,
      to: B,
      input: "0x",
      logs: [{ address: C, topics: ["0xdead"], data: "0xbeef" }],
    };
    const root = normalizeCallTracer(raw);
    expect(root.logs?.[0]?.address).toBe(C);
  });
});

describe("normalizeParityTrace (trace_call flat list)", () => {
  it("reconstructs a tree from trace addresses", () => {
    const raw = [
      {
        traceAddress: [],
        type: "call",
        action: {
          from: A,
          to: B,
          value: "0x0",
          gas: "0x100000",
          input: "0x11",
        },
        result: { gasUsed: "0x5208", output: "0x" },
      },
      {
        traceAddress: [0],
        type: "call",
        action: { from: B, to: C, value: "0x0", gas: "0x1000", input: "0x22" },
        error: "Reverted",
      },
    ];
    const root = normalizeParityTrace(raw);
    expect(root.to).toBe(B);
    expect(root.calls).toHaveLength(1);
    expect(root.calls[0]?.to).toBe(C);
    expect(root.calls[0]?.reverted).toBe(true);
    expect(root.reverted).toBe(true);
  });
});
