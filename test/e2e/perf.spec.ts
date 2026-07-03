import { expect, test } from "@playwright/test";
import { startAnvil, type AnvilInstance } from "../fork/anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const BALANCE_OF = `0x70a08231000000000000000000000000${WHALE.slice(2).toLowerCase()}`;

test.describe("performance budget", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    anvil = await startAnvil();
  });

  test.afterAll(() => anvil?.stop());

  test("first simulation result renders under 2.5s (warm)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("1");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByTestId("add-chain-submit").click();

    await page.getByTestId("input-box").fill(BALANCE_OF);
    await page.getByTestId("to-input").fill(USDC);

    // warm the app (dev-mode compile happens on first load; a prior run
    // already compiled the route) then measure the result round-trip
    const start = Date.now();
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("sim-status")).toBeVisible({
      timeout: 5_000,
    });
    const elapsed = Date.now() - start;
    // excludes node latency: anvil is local. Budget from PLAN §1.
    expect(elapsed).toBeLessThan(2_500);
  });
});
