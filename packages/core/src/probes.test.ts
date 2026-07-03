import { createPublicClient, custom, pad, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { buildProbeOverride, runReadProbe, suggestProbes } from "./probes";
import { erc20AllowanceSlot } from "./overrides";
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

const ALLOWANCE_SLOT_INDEX = 10n;

function tokenClient(): PublicClient {
  return createPublicClient({
    transport: custom(
      {
        request: async ({
          method,
          params,
        }: {
          method: string;
          params: unknown[];
        }) => {
          if (method !== "eth_call") return "0x1";
          const [call, , overrides] = params as [
            { data: string },
            string,
            Record<string, { stateDiff?: Record<string, string> }> | undefined,
          ];
          // allowance(owner, spender) selector 0xdd62ed3e
          if (call.data.startsWith("0xdd62ed3e")) {
            if (!overrides) return pad("0x00");
            const expected = erc20AllowanceSlot(
              OWNER,
              SPENDER,
              ALLOWANCE_SLOT_INDEX,
              "solidity",
            );
            const entry = Object.entries(overrides).find(
              ([addr]) => addr.toLowerCase() === TOKEN.toLowerCase(),
            );
            const diff = entry?.[1]?.stateDiff ?? {};
            const written = Object.entries(diff).find(
              ([slot]) => slot.toLowerCase() === expected.toLowerCase(),
            );
            return written ? written[1] : pad("0x00");
          }
          // balanceOf → return a value
          return pad("0x64");
        },
      },
      { retryCount: 0 },
    ),
  });
}

describe("runReadProbe", () => {
  it("runs a balanceOf read probe and parses the value", async () => {
    const result = await runReadProbe(tokenClient(), TOKEN, {
      kind: "balanceOf",
      owner: OWNER,
    });
    expect(result.outcome.status).toBe("success");
    expect(result.value).toBe(100n);
    expect(result.label).toContain("balanceOf");
  });

  it("runs an allowance read probe", async () => {
    const result = await runReadProbe(tokenClient(), TOKEN, {
      kind: "allowance",
      owner: OWNER,
      spender: SPENDER,
    });
    expect(result.label).toContain("allowance");
  });
});

describe("buildProbeOverride", () => {
  it("discovers the allowance slot and builds an override", async () => {
    const suggestion = {
      kind: "allowance" as const,
      token: TOKEN,
      owner: OWNER,
      spender: SPENDER,
      needed: 500n,
      description: "",
    };
    const override = await buildProbeOverride(tokenClient(), suggestion);
    expect(override).not.toBeNull();
    expect(override?.address).toBe(TOKEN);
    expect(override?.stateDiff?.[0]?.slot).toBe(
      erc20AllowanceSlot(OWNER, SPENDER, ALLOWANCE_SLOT_INDEX, "solidity"),
    );
  });

  it("returns null when the slot cannot be discovered", async () => {
    const blindClient = createPublicClient({
      transport: custom(
        { request: async () => pad("0x00") },
        { retryCount: 0 },
      ),
    });
    const override = await buildProbeOverride(blindClient, {
      kind: "balance",
      token: TOKEN,
      holder: OWNER,
      description: "",
    });
    expect(override).toBeNull();
  });
});
