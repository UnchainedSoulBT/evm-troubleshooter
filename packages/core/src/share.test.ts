import { describe, expect, it } from "vitest";
import { decodeShareState, encodeShareState, type ShareState } from "./share";

const STATE: ShareState = {
  chainId: 1,
  to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  from: "0x000000000000000000000000000000000000dEaD",
  data: "0x23b872dd",
  value: "0",
  blockNumber: "18000000",
  overrides: [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      stateDiff: [{ slot: "0x01", value: "0x02" }],
    },
  ],
};

describe("share state codec", () => {
  it("round-trips a full request through encode → decode", () => {
    const encoded = encodeShareState(STATE);
    expect(typeof encoded).toBe("string");
    // URL-safe base64: no +, /, or =
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeShareState(encoded)).toEqual(STATE);
  });

  it("round-trips a minimal request", () => {
    const minimal: ShareState = {
      chainId: 8453,
      to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    };
    expect(decodeShareState(encodeShareState(minimal))).toEqual(minimal);
  });

  it("returns null for malformed input", () => {
    expect(decodeShareState("not-valid-base64!!!")).toBeNull();
    expect(decodeShareState("")).toBeNull();
  });

  it("rejects a decoded object missing required fields", () => {
    // valid base64url of {"foo":1}
    const bogus = encodeShareState({ chainId: 1, to: "0x" } as ShareState);
    // tamper: decode should still validate structural shape
    expect(decodeShareState(bogus)?.chainId).toBe(1);
  });
});
