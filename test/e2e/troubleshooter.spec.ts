import { expect, test } from "@playwright/test";
import { rpc, startAnvil, type AnvilInstance } from "../fork/anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
// balanceOf(WHALE)
const BALANCE_OF = `0x70a08231000000000000000000000000${WHALE.slice(2).toLowerCase()}`;
// transferFrom(WHALE, dead, 1e6) — reverts: no allowance
const TRANSFER_FROM =
  "0x23b872dd" +
  `000000000000000000000000${WHALE.slice(2).toLowerCase()}` +
  "000000000000000000000000000000000000000000000000000000000000dead" +
  "00000000000000000000000000000000000000000000000000000000000f4240";

test.describe("troubleshooter flows on a mainnet fork", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    anvil = await startAnvil();
  });

  test.afterAll(() => anvil?.stop());

  async function useAnvilChain(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByTestId("add-chain-button").click();
    await page.getByLabel("Chain ID").fill("1");
    await page.getByLabel("RPC URL").fill(anvil.rpcUrl);
    await page.getByTestId("add-chain-submit").click();
  }

  test("calldata simulation succeeds for balanceOf", async ({ page }) => {
    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(BALANCE_OF);
    await expect(page.getByTestId("input-kind")).toContainText("calldata");
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "success",
      { timeout: 20_000 },
    );
    await page.getByTestId("tab-result").click();
    await expect(page.getByTestId("return-data")).toContainText("0x");
  });

  test("calldata simulation shows revert + data for transferFrom without allowance", async ({
    page,
  }) => {
    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(TRANSFER_FROM);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "revert",
      { timeout: 20_000 },
    );
    // Error(string) selector visible in the raw revert data
    await page.getByTestId("tab-result").click();
    await expect(page.getByTestId("revert-data")).toContainText("0x08c379a0");
  });

  test("tx hash lookup renders the tx, receipt and replays it", async ({
    page,
  }) => {
    // create a real tx on the fork using an unlocked anvil dev account
    const [sender] = (await rpc(anvil.rpcUrl, "eth_accounts")) as string[];
    const hash = (await rpc(anvil.rpcUrl, "eth_sendTransaction", [
      {
        from: sender,
        to: "0x000000000000000000000000000000000000dEaD",
        value: "0xde0b6b3a7640000", // 1 ether
      },
    ])) as string;

    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(hash);
    await expect(page.getByTestId("input-kind")).toContainText(
      "transaction hash",
    );
    await page.getByTestId("run-button").click();

    await expect(page.getByTestId("tx-status")).toContainText("Confirmed", {
      timeout: 20_000,
    });
    // plain value transfer: details live in the Details tab
    await page.getByTestId("tab-result").click();
    await expect(page.getByTestId("tx-card")).toContainText("1 native");

    await page.getByTestId("replay-button").click();
    await expect(page.getByTestId("sim-status")).toHaveAttribute(
      "data-status",
      "success",
      { timeout: 20_000 },
    );
  });

  test("unknown tx hash shows a clear not-found message", async ({ page }) => {
    await useAnvilChain(page);
    await page.getByTestId("input-box").fill("0x" + "ab".repeat(32));
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("result-message")).toContainText(
      "not found",
      { timeout: 20_000 },
    );
  });
});
