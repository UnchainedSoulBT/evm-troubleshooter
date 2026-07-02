import { createPublicClient, custom, pad, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import {
  balanceOverride,
  codeOverride,
  erc20AllowanceSlot,
  erc20BalanceSlot,
  findErc20Slot,
  mergeOverrides,
  storageOverride,
} from "./overrides";

const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const OWNER = "0xF977814e90dA44bFA03b6295A0616a897441aceC" as const;
const SPENDER = "0x000000000000000000000000000000000000dEaD" as const;

describe("override builders", () => {
  it("builds balance, code and storage overrides", () => {
    expect(balanceOverride(OWNER, 5n)).toEqual({
      address: OWNER,
      balance: 5n,
    });
    expect(codeOverride(TOKEN, "0x60006000")).toEqual({
      address: TOKEN,
      code: "0x60006000",
    });
    const slot = pad("0x01");
    const value = pad("0x02");
    expect(storageOverride(TOKEN, [{ slot, value }])).toEqual({
      address: TOKEN,
      stateDiff: [{ slot, value }],
    });
  });

  it("merges overrides for the same address", () => {
    const merged = mergeOverrides([
      storageOverride(TOKEN, [{ slot: pad("0x01"), value: pad("0x0a") }]),
      storageOverride(TOKEN, [{ slot: pad("0x02"), value: pad("0x0b") }]),
      balanceOverride(OWNER, 5n),
    ]);
    expect(merged).toHaveLength(2);
    const token = merged.find((e) => e.address === TOKEN);
    expect(token?.stateDiff).toHaveLength(2);
  });
});

describe("ERC-20 slot math", () => {
  it("computes solidity mapping slots deterministically", () => {
    const a = erc20BalanceSlot(OWNER, 9n, "solidity");
    const b = erc20BalanceSlot(OWNER, 9n, "solidity");
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    // different slot index → different storage slot
    expect(erc20BalanceSlot(OWNER, 2n, "solidity")).not.toBe(a);
    // vyper layout hashes in the reverse order
    expect(erc20BalanceSlot(OWNER, 9n, "vyper")).not.toBe(a);
  });

  it("nests allowance slots (allowance[owner][spender])", () => {
    const slot = erc20AllowanceSlot(OWNER, SPENDER, 10n, "solidity");
    expect(slot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(erc20AllowanceSlot(SPENDER, OWNER, 10n, "solidity")).not.toBe(slot);
  });
});

describe("findErc20Slot", () => {
  function tokenMock(balanceSlotIndex: bigint): PublicClient {
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
              { to: string; data: string },
              string,
              Record<string, { stateDiff?: Record<string, string> }>,
            ];
            const holder = `0x${call.data.slice(34, 74)}`;
            const expected = erc20BalanceSlot(
              holder as `0x${string}`,
              balanceSlotIndex,
              "solidity",
            );
            const entry = Object.entries(overrides ?? {}).find(
              ([addr]) => addr.toLowerCase() === TOKEN.toLowerCase(),
            );
            const diff = entry?.[1]?.stateDiff ?? {};
            const written = Object.entries(diff).find(
              ([slot]) => slot.toLowerCase() === expected.toLowerCase(),
            );
            return written ? written[1] : pad("0x00");
          },
        },
        { retryCount: 0 },
      ),
    });
  }

  it("discovers the balances mapping slot by override probing", async () => {
    const client = tokenMock(9n);
    const found = await findErc20Slot(client, TOKEN, "balance");
    expect(found).toEqual({ slotIndex: 9n, layout: "solidity" });
  });

  it("returns null when no slot responds", async () => {
    const client = createPublicClient({
      transport: custom(
        { request: async () => pad("0x00") },
        { retryCount: 0 },
      ),
    });
    expect(await findErc20Slot(client, TOKEN, "balance")).toBeNull();
  });
});
