import { describe, expect, it } from "vitest";
import { suggestProbes } from "./probes";
import type { DecodedRevert } from "./decode/types";

const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const OWNER = "0xF977814e90dA44bFA03b6295A0616a897441aceC" as const;
const SPENDER = "0x000000000000000000000000000000000000dEaD" as const;

describe("suggestProbes", () => {
  it("suggests an allowance override for an OZ insufficient-allowance revert", () => {
    const revert: DecodedRevert = {
      kind: "custom",
      errorName: "ERC20InsufficientAllowance",
      signature: "ERC20InsufficientAllowance(address,uint256,uint256)",
      args: [
        { name: "spender", type: "address", value: SPENDER },
        { name: "allowance", type: "uint256", value: 0n },
        { name: "needed", type: "uint256", value: 100n },
      ],
      source: "builtin",
      message: "insufficient allowance",
      raw: "0x",
    };
    const suggestions = suggestProbes(revert, { token: TOKEN, owner: OWNER });
    const allowance = suggestions.find((s) => s.kind === "allowance");
    expect(allowance).toBeDefined();
    expect(allowance?.spender).toBe(SPENDER);
    expect(allowance?.needed).toBe(100n);
  });

  it("suggests a balance override for an insufficient-balance revert", () => {
    const revert: DecodedRevert = {
      kind: "custom",
      errorName: "ERC20InsufficientBalance",
      signature: "ERC20InsufficientBalance(address,uint256,uint256)",
      args: [
        { name: "sender", type: "address", value: OWNER },
        { name: "balance", type: "uint256", value: 5n },
        { name: "needed", type: "uint256", value: 100n },
      ],
      source: "builtin",
      message: "insufficient balance",
      raw: "0x",
    };
    const suggestions = suggestProbes(revert, { token: TOKEN, owner: OWNER });
    const balance = suggestions.find((s) => s.kind === "balance");
    expect(balance?.holder).toBe(OWNER);
    expect(balance?.needed).toBe(100n);
  });

  it("recognizes the classic require-string allowance revert", () => {
    const revert: DecodedRevert = {
      kind: "error-string",
      reason: "ERC20: transfer amount exceeds allowance",
      message: "reverted: ERC20: transfer amount exceeds allowance",
      raw: "0x",
    };
    const suggestions = suggestProbes(revert, { token: TOKEN, owner: OWNER });
    expect(suggestions.some((s) => s.kind === "allowance")).toBe(true);
  });

  it("returns nothing actionable for an unrelated panic", () => {
    const revert: DecodedRevert = {
      kind: "panic",
      panicCode: 0x12,
      panicDescription: "division by zero",
      message: "panic",
      raw: "0x",
    };
    expect(suggestProbes(revert, { token: TOKEN, owner: OWNER })).toHaveLength(
      0,
    );
  });
});
