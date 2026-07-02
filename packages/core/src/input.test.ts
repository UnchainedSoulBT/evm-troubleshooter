import { describe, expect, it } from "vitest";
import { detectInputKind, isHexData } from "./input";

describe("isHexData", () => {
  it("accepts 0x-prefixed even-length hex", () => {
    expect(isHexData("0xdeadbeef")).toBe(true);
    expect(isHexData("0x")).toBe(true);
  });

  it("rejects odd-length, unprefixed, or non-hex input", () => {
    expect(isHexData("0xabc")).toBe(false);
    expect(isHexData("deadbeef")).toBe(false);
    expect(isHexData("0xzz")).toBe(false);
  });
});

describe("detectInputKind", () => {
  it("classifies a 32-byte hash", () => {
    expect(
      detectInputKind(
        "0x60286c0fee3a46697e3ea4b04bc229f5db4b65d001d93563351fb66d81301561",
      ),
    ).toBe("txHash");
  });

  it("classifies calldata and trims whitespace", () => {
    expect(detectInputKind("  0xa9059cbb  ")).toBe("calldata");
  });

  it("returns unknown for empty or non-hex input", () => {
    expect(detectInputKind("0x")).toBe("unknown");
    expect(detectInputKind("hello")).toBe("unknown");
  });
});
