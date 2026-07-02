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

test.describe("trace tree & asset diff (§8 scenario 4)", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    anvil = await startAnvil();
  });

  test.afterAll(() => anvil?.stop());

  async function useAnvil(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("1");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByTestId("add-chain-submit").click();
  }

  test("trace tab shows the tree and flags the reverting leg", async ({
    page,
  }) => {
    await useAnvil(page);
    await page.getByTestId("input-box").fill(TRANSFER_FROM);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("from-input").fill(RECEIVER);
    await page.getByTestId("run-button").click();

    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "revert",
      { timeout: 20_000 },
    );
    await page.getByTestId("tab-trace").click();
    const tree = page.getByTestId("trace-tree");
    await expect(tree).toBeVisible();
    // the root call is flagged reverted
    await expect(tree.getByTestId("trace-node").first()).toHaveAttribute(
      "data-reverted",
      "true",
    );
  });

  test("asset diff tab renders for a value transfer", async ({ page }) => {
    await useAnvil(page);
    // JSON request: send 1 ETH from whale to receiver
    await page.getByTestId("input-box").fill(
      JSON.stringify({
        from: WHALE,
        to: RECEIVER,
        value: "1000000000000000000",
      }),
    );
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "success",
      { timeout: 20_000 },
    );
    await page.getByTestId("tab-assets").click();
    await expect(page.getByTestId("asset-diff")).toContainText("native", {
      timeout: 10_000,
    });
  });
});
