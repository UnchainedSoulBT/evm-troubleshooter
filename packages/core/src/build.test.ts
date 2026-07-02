import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { encodeCall, parseArgInput, writableFunctions } from "./build";

const ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function setPair(address token, bool enabled)",
  "function batch(uint256[] ids)",
]);

describe("writableFunctions", () => {
  it("lists only non-view/pure functions", () => {
    const fns = writableFunctions(ABI).map((f) => f.name);
    expect(fns).toContain("transfer");
    expect(fns).toContain("setPair");
    expect(fns).not.toContain("balanceOf");
  });
});

describe("parseArgInput", () => {
  it("parses address, uint, bool, and array inputs", () => {
    expect(
      parseArgInput("address", "0x000000000000000000000000000000000000dEaD"),
    ).toEqual({
      ok: true,
      value: "0x000000000000000000000000000000000000dEaD",
    });
    expect(parseArgInput("uint256", "1000")).toEqual({
      ok: true,
      value: 1000n,
    });
    expect(parseArgInput("bool", "true")).toEqual({ ok: true, value: true });
    expect(parseArgInput("uint256[]", "[1, 2, 3]")).toEqual({
      ok: true,
      value: [1n, 2n, 3n],
    });
  });

  it("rejects malformed input with a message", () => {
    const bad = parseArgInput("address", "not-an-address");
    expect(bad.ok).toBe(false);
    const badUint = parseArgInput("uint256", "-5");
    expect(badUint.ok).toBe(false);
  });
});

describe("encodeCall", () => {
  it("encodes and round-trips through decodeFunctionData (encode→decode identity)", () => {
    const fn = ABI.find((f) => f.type === "function" && f.name === "transfer")!;
    const result = encodeCall(fn, [
      "0x000000000000000000000000000000000000dEaD",
      "123",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoded = decodeFunctionData({ abi: ABI, data: result.data });
      expect(decoded.functionName).toBe("transfer");
      expect(decoded.args?.[1]).toBe(123n);
    }
  });

  it("reports per-arg validation errors without throwing", () => {
    const fn = ABI.find((f) => f.type === "function" && f.name === "transfer")!;
    const result = encodeCall(fn, ["not-an-address", "123"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("to");
    }
  });
});
