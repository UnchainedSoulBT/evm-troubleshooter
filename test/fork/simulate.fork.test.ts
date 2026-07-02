import { createClientForChain, simulateCall } from "@evm-troubleshooter/core";
import { encodeFunctionData, erc20Abi, hexToBigInt } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rpc, startAnvil, type AnvilInstance } from "./anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
// Binance 8 hot wallet — reliably holds USDC on any recent mainnet block
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC" as const;
const RECEIVER = "0x000000000000000000000000000000000000dEaD" as const;

describe("simulateCall on a mainnet fork", () => {
  let anvil: AnvilInstance;
  let client: ReturnType<typeof createClientForChain>;
  let forkBlock: bigint;

  beforeAll(async () => {
    anvil = await startAnvil();
    client = createClientForChain({ chainId: 1, rpcUrl: anvil.rpcUrl });
    forkBlock = hexToBigInt(
      (await rpc(anvil.rpcUrl, "eth_blockNumber")) as `0x${string}`,
    );
  }, 90_000);

  afterAll(() => anvil?.stop());

  it("returns data for a latest-block balanceOf", async () => {
    const outcome = await simulateCall(client, {
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [WHALE],
      }),
    });
    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(hexToBigInt(outcome.returnData)).toBeGreaterThan(0n);
    }
  });

  it("captures revert data for a transferFrom with no allowance (§8 scenario 1)", async () => {
    const outcome = await simulateCall(client, {
      from: RECEIVER,
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [WHALE, RECEIVER, 1_000_000n],
      }),
    });
    expect(outcome.status).toBe("revert");
    if (outcome.status === "revert") {
      // USDC reverts with Error("ERC20: transfer amount exceeds allowance")
      expect(outcome.revertData.startsWith("0x08c379a0")).toBe(true);
    }
  });

  it("replays pinned to the fork block (historical replay)", async () => {
    const outcome = await simulateCall(client, {
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [WHALE],
      }),
      blockNumber: forkBlock,
    });
    expect(outcome.status).toBe("success");
  });

  it("degrades to a clear error for unavailable deep-historical state", async () => {
    const outcome = await simulateCall(client, {
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [WHALE],
      }),
      // far beyond the upstream full node's ~128-block state window
      blockNumber: forkBlock - 1_000_000n,
    });
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message.length).toBeGreaterThan(0);
    }
  });
});
