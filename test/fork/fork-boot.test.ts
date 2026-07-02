import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rpc, startAnvil, type AnvilInstance } from "./anvil.js";

describe("anvil mainnet fork", () => {
  let anvil: AnvilInstance;

  beforeAll(async () => {
    anvil = await startAnvil();
  }, 90_000);

  afterAll(() => anvil?.stop());

  it("boots as a fork of Ethereum mainnet", async () => {
    const chainId = (await rpc(anvil.rpcUrl, "eth_chainId")) as string;
    expect(Number(chainId)).toBe(1);

    const block = (await rpc(anvil.rpcUrl, "eth_blockNumber")) as string;
    expect(BigInt(block)).toBeGreaterThan(0n);
  });
});
