import { expect, test } from "@playwright/test";
import { encodeFunctionData, erc20Abi } from "viem";
import { startAnvil, type AnvilInstance } from "../fork/anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const RECEIVER = "0x000000000000000000000000000000000000dEaD";

const TRANSFER_FROM = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transferFrom",
  args: [WHALE, RECEIVER, 1_000_000n],
});

test.describe("state-override probes (§8 scenario 2)", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    anvil = await startAnvil();
  });

  test.afterAll(() => anvil?.stop());

  test("prove-the-fix flips a no-allowance revert to success", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("1");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByTestId("add-chain-submit").click();

    await page.getByTestId("input-box").fill(TRANSFER_FROM);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("from-input").fill(RECEIVER);
    await page.getByTestId("run-button").click();

    // reverts, and the probe panel offers a suggestion
    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "revert",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("probe-panel")).toBeVisible();

    // prove the fix: override the allowance slot → success
    await page.getByTestId("prove-fix").first().click();
    await expect(page.getByTestId("proof-status")).toContainText("succeeds", {
      timeout: 30_000,
    });
  });

  test("read probes report allowance state", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("1");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByTestId("add-chain-submit").click();

    await page.getByTestId("input-box").fill(TRANSFER_FROM);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("from-input").fill(RECEIVER);
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("probe-panel")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId("probe-allowance").click();
    await expect(page.getByTestId("probe-reads")).toContainText("allowance", {
      timeout: 20_000,
    });
  });
});
