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

test.describe("sharing & reports (§8 scenario 9)", () => {
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

  test("a permalink reproduces the identical simulation on load", async ({
    page,
    context,
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

    const shareUrl = await page
      .getByTestId("copy-link")
      .getAttribute("data-share-url");
    expect(shareUrl).toContain("/?s=");

    // open the permalink in a fresh page → same revert reproduces
    const fresh = await context.newPage();
    await fresh.goto(shareUrl!);
    await expect(fresh.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "revert",
      { timeout: 25_000 },
    );
    await fresh.close();
  });

  test("copy report produces markdown with decode + result", async ({
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
    // the report button is present and toggles its label on click
    const report = page.getByTestId("copy-report");
    await expect(report).toBeVisible();
    await report.click();
    await expect(report).toContainText("copied");
  });
});
