import { expect, test } from "@playwright/test";
import { startAnvil, type AnvilInstance } from "../fork/anvil";

test("chain selection persists across reloads", async ({ page }) => {
  await page.goto("/");
  const select = page.getByTestId("chain-select");
  await expect(select).toContainText("Ethereum");

  await select.click();
  await page.getByRole("option", { name: "Base" }).click();
  await expect(select).toContainText("Base");

  await page.reload();
  await expect(page.getByTestId("chain-select")).toContainText("Base");
});

test.describe("custom chain via BYO-RPC", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    anvil = await startAnvil();
  });

  test.afterAll(() => anvil?.stop());

  test("adding a local anvil chain shows accurate capability badges", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("31337");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByLabel("Name (optional)").fill("Anvil Fork");
    await page.getByTestId("add-chain-submit").click();

    await expect(page.getByTestId("chain-select")).toContainText("Anvil Fork");
    const trace = page.getByTestId("capability-trace");
    await expect(trace).toHaveAttribute("data-on", "true", {
      timeout: 30_000,
    });
    const estimateGas = page.getByTestId("capability-estimateGas");
    await expect(estimateGas).toHaveAttribute("data-on", "true");
  });

  test("rejects an invalid RPC URL", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("31337");
    await page.getByLabel("RPC URL").fill("not-a-url");
    await page.getByTestId("add-chain-submit").click();
    await expect(page.getByRole("alert")).toContainText("http");
  });
});
