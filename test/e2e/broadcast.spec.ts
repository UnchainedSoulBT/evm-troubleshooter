import { expect, test } from "@playwright/test";
import { startAnvil, type AnvilInstance } from "../fork/anvil";

const DEAD = "0x000000000000000000000000000000000000dEaD";

// This suite needs the mock wallet, which is wired to anvil on the fixed
// port 31337 uses (127.0.0.1:8545). Runs serially to own that port.
test.describe.configure({ mode: "serial" });

test.describe("build & broadcast (§8 scenario 8)", () => {
  let anvil: AnvilInstance;

  test.beforeAll(async () => {
    // chain-id 31337 so the node matches the wagmi anvil chain the mock
    // wallet connects to (anvil keeps the forked id — 1 — otherwise)
    anvil = await startAnvil({ port: 8545, chainId: 31337 });
  });

  test.afterAll(() => anvil?.stop());

  test("mock wallet connects, pre-flight passes, broadcast confirms", async ({
    page,
  }) => {
    await page.goto("/");

    // connect the mock wallet (chain 31337 = anvil @ 8545)
    await page.getByTestId("connect-mock").click();
    await expect(page.getByTestId("wallet-connected")).toBeVisible({
      timeout: 15_000,
    });

    // build a plain value transfer (no ABI needed → empty calldata)
    await page.getByTestId("bcast-to").fill(DEAD);
    await page.getByTestId("bcast-value").fill("1000000000000000000"); // 1 ETH

    // pre-flight all green
    await page.getByTestId("bcast-preflight").click();
    await expect(page.getByTestId("check-simulation")).toHaveAttribute(
      "data-status",
      "pass",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("check-balance")).toHaveAttribute(
      "data-status",
      "pass",
    );

    // broadcast → receipt success
    await page.getByTestId("bcast-send").click();
    await expect(page.getByTestId("receipt-status")).toContainText("success", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("tx-hash")).toContainText("0x");
  });
});
