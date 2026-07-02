import {
  assetDiffFromPrestate,
  createClientForChain,
  traceCall,
} from "@evm-troubleshooter/core";
import { encodeFunctionData, erc20Abi, parseEther } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilInstance } from "./anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC" as const;
const RECEIVER = "0x000000000000000000000000000000000000dEaD" as const;

describe("trace tree on a mainnet fork", () => {
  let anvil: AnvilInstance;
  let client: ReturnType<typeof createClientForChain>;

  beforeAll(async () => {
    anvil = await startAnvil();
    client = createClientForChain({ chainId: 1, rpcUrl: anvil.rpcUrl });
  }, 90_000);

  afterAll(() => anvil?.stop());

  it("traces a successful transfer and reports the tree", async () => {
    const result = await traceCall(client, {
      from: WHALE,
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [RECEIVER, 1_000_000n],
      }),
    });
    // anvil supports debug_traceCall
    expect(result.source).toBe("debug_traceCall");
    expect(result.root?.to?.toLowerCase()).toBe(USDC.toLowerCase());
    expect(result.root?.reverted).toBe(false);
  });

  it("flags the reverting leg on a no-allowance transferFrom", async () => {
    const result = await traceCall(client, {
      from: RECEIVER,
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [WHALE, RECEIVER, 1_000_000n],
      }),
    });
    expect(result.source).toBe("debug_traceCall");
    expect(result.root?.reverted).toBe(true);
    expect(result.root?.error).toBeDefined();
  });

  it("reports a native-balance asset diff for an ETH transfer", async () => {
    const diffs = await assetDiffFromPrestate(client, {
      from: WHALE,
      to: RECEIVER,
      value: parseEther("1"),
    });
    // the receiver gains ~1 ETH; sender loses 1 ETH + gas
    const receiver = diffs.find(
      (d) => d.address.toLowerCase() === RECEIVER.toLowerCase(),
    );
    expect(receiver?.delta).toBe(parseEther("1"));
  });
});
