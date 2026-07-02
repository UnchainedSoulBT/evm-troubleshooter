import { encodeErrorResult, parseAbi, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { decodeRevert } from "./revert";

const ERROR_STRING_ABI = parseAbi(["error Error(string)"]);
const PANIC_ABI = parseAbi(["error Panic(uint256)"]);

describe("decodeRevert", () => {
  it("handles empty revert data", async () => {
    const decoded = await decodeRevert("0x" as Hex, {});
    expect(decoded.kind).toBe("empty");
  });

  it("decodes Error(string) — §8 fixture 1", async () => {
    const data = encodeErrorResult({
      abi: ERROR_STRING_ABI,
      errorName: "Error",
      args: ["ERC20: transfer amount exceeds allowance"],
    });
    const decoded = await decodeRevert(data, {});
    expect(decoded.kind).toBe("error-string");
    if (decoded.kind === "error-string") {
      expect(decoded.reason).toBe("ERC20: transfer amount exceeds allowance");
    }
  });

  it("decodes Panic(uint256) with the Solidity panic-code map", async () => {
    const data = encodeErrorResult({
      abi: PANIC_ABI,
      errorName: "Panic",
      args: [0x12n],
    });
    const decoded = await decodeRevert(data, {});
    expect(decoded.kind).toBe("panic");
    if (decoded.kind === "panic") {
      expect(decoded.panicCode).toBe(0x12);
      expect(decoded.panicDescription).toMatch(/division/i);
    }
  });

  it("decodes a builtin OZ v5 custom error — §8 fixture 2", async () => {
    const abi = parseAbi([
      "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    ]);
    const data = encodeErrorResult({
      abi,
      errorName: "ERC20InsufficientAllowance",
      args: ["0x000000000000000000000000000000000000dEaD", 0n, 100n],
    });
    const decoded = await decodeRevert(data, {});
    expect(decoded.kind).toBe("custom");
    if (decoded.kind === "custom") {
      expect(decoded.errorName).toBe("ERC20InsufficientAllowance");
      expect(decoded.source).toBe("builtin");
      expect(decoded.args[1]?.value).toBe(0n);
      expect(decoded.args[2]?.value).toBe(100n);
    }
  });

  it("decodes a custom error from a user-pasted ABI", async () => {
    const abi = parseAbi(["error CustomThing(uint256 id, bytes32 tag)"]);
    const data = encodeErrorResult({
      abi,
      errorName: "CustomThing",
      args: [7n, toHex("x", { size: 32 })],
    });
    const decoded = await decodeRevert(data, { abi });
    expect(decoded.kind).toBe("custom");
    if (decoded.kind === "custom") {
      expect(decoded.errorName).toBe("CustomThing");
      expect(decoded.source).toBe("abi");
    }
  });

  it("falls back to selector-DB candidates for unknown custom errors", async () => {
    const abi = parseAbi(["error Mysterious(uint256 x)"]);
    const data = encodeErrorResult({
      abi,
      errorName: "Mysterious",
      args: [1n],
    });
    const decoded = await decodeRevert(data, {
      lookupSelector: async () => ["Mysterious(uint256)"],
    });
    expect(decoded.kind).toBe("custom");
    if (decoded.kind === "custom") {
      expect(decoded.errorName).toBe("Mysterious");
      expect(decoded.source).toBe("selector-db");
    }
  });

  it("reports unknown with candidates when nothing decodes", async () => {
    const decoded = await decodeRevert("0xdeadbeef00" as Hex, {
      lookupSelector: async () => ["candidateError(bytes)"],
    });
    expect(decoded.kind).toBe("unknown");
    if (decoded.kind === "unknown") {
      expect(decoded.candidates).toEqual(["candidateError(bytes)"]);
    }
  });
});
