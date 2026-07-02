import {
  buildProbeOverride,
  createClientForChain,
  decodeRevert,
  findErc20Slot,
  simulateCall,
  suggestProbes,
} from "@evm-troubleshooter/core";
import { encodeFunctionData, erc20Abi } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilInstance } from "./anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC" as const;
const RECEIVER = "0x000000000000000000000000000000000000dEaD" as const;
const AMOUNT = 1_000_000n; // 1 USDC

function transferFromData() {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transferFrom",
    args: [WHALE, RECEIVER, AMOUNT],
  });
}

describe("state-override isolation (§8 scenario 2)", () => {
  let anvil: AnvilInstance;
  let client: ReturnType<typeof createClientForChain>;

  beforeAll(async () => {
    anvil = await startAnvil();
    client = createClientForChain({ chainId: 1, rpcUrl: anvil.rpcUrl });
  }, 90_000);

  afterAll(() => anvil?.stop());

  it("discovers the USDC allowance slot by probing", async () => {
    const found = await findErc20Slot(client, USDC, "allowance", {
      owner: WHALE,
      spender: RECEIVER,
    });
    expect(found).not.toBeNull();
  });

  it("flips a no-allowance transferFrom from revert to success via override", async () => {
    // baseline: reverts, no allowance
    const before = await simulateCall(client, {
      from: RECEIVER,
      to: USDC,
      data: transferFromData(),
    });
    expect(before.status).toBe("revert");

    // decode → suggest → build override → re-simulate
    const revert =
      before.status === "revert"
        ? await decodeRevert(before.revertData, {})
        : null;
    expect(revert).not.toBeNull();

    const [suggestion] = suggestProbes(revert!, {
      token: USDC,
      owner: WHALE,
      spender: RECEIVER,
    });
    expect(suggestion?.kind).toBe("allowance");

    const override = await buildProbeOverride(client, suggestion!, AMOUNT * 2n);
    expect(override).not.toBeNull();

    const after = await simulateCall(client, {
      from: RECEIVER,
      to: USDC,
      data: transferFromData(),
      stateOverride: [override!],
    });
    expect(after.status).toBe("success");
  });

  it("also succeeds when the holder balance is topped up via override", async () => {
    // a fresh account with no balance and forced allowance still needs balance
    const poor = "0x00000000000000000000000000000000C0FFEE01" as const;
    const found = await findErc20Slot(client, USDC, "balance", {
      holder: poor,
    });
    expect(found).not.toBeNull();
  });
});
