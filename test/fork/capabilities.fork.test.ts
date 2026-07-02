import {
  createClientForChain,
  probeCapabilities,
} from "@evm-troubleshooter/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAnvil, type AnvilInstance } from "./anvil";

describe("capability probe against a real anvil fork", () => {
  let anvil: AnvilInstance;

  beforeAll(async () => {
    anvil = await startAnvil();
  }, 90_000);

  afterAll(() => anvil?.stop());

  it("reports debug + estimateGas on anvil", async () => {
    const client = createClientForChain({ chainId: 1, rpcUrl: anvil.rpcUrl });
    const caps = await probeCapabilities(client);
    expect(caps.latestBlock).not.toBeNull();
    expect(caps.debug).toBe(true);
    // archive on a fork mirrors the upstream RPC (false for public full
    // nodes) — asserting only that the probe settles on a boolean
    expect(typeof caps.archive).toBe("boolean");
    expect(caps.estimateGas).toBe(true);
    expect(caps.clientVersion).toMatch(/anvil/i);
  });
});

describe("live Ethereum smoke", () => {
  it("default registry RPC answers the probe", async () => {
    const caps = await probeCapabilities(createClientForChain(1));
    expect(caps.latestBlock).not.toBeNull();
    expect(caps.latestBlock! > 20_000_000n).toBe(true);
    expect(caps.estimateGas).toBe(true);
  });
});
