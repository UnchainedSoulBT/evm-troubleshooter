import { expect, test } from "@playwright/test";
import { encodeFunctionData, parseAbi } from "viem";
import { startAnvil, type AnvilInstance } from "../fork/anvil";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const TRANSFER_FROM = encodeFunctionData({
  abi: ERC20,
  functionName: "transferFrom",
  args: [WHALE, DEAD, 1_000_000n],
});

const MULTICALL = encodeFunctionData({
  abi: parseAbi(["function multicall(bytes[] data)"]),
  functionName: "multicall",
  args: [
    [
      encodeFunctionData({
        abi: ERC20,
        functionName: "approve",
        args: [DEAD, 500n],
      }),
      encodeFunctionData({
        abi: ERC20,
        functionName: "transfer",
        args: [DEAD, 123n],
      }),
    ],
  ],
});

test.describe("decoding flows on a mainnet fork", () => {
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

  test("revert decodes to a human-readable reason in the Decoded tab", async ({
    page,
  }) => {
    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(TRANSFER_FROM);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("run-button").click();

    await expect(page.getByTestId("decoded-revert-message")).toContainText(
      "ERC20: transfer amount exceeds allowance",
      { timeout: 20_000 },
    );
    // the call itself decodes with named args from the builtin seed
    await expect(page.getByTestId("decoded-call")).toContainText(
      "transferFrom(address,address,uint256)",
    );
  });

  test("multicall expands into decoded sub-calls (§8 scenario 3)", async ({
    page,
  }) => {
    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(MULTICALL);
    await page.getByTestId("to-input").fill(USDC);
    await page.getByTestId("run-button").click();

    const subcalls = page.getByTestId("decoded-subcall");
    await expect(subcalls).toHaveCount(2, { timeout: 20_000 });
    await expect(subcalls.nth(0)).toContainText("approve(address,uint256)");
    await expect(subcalls.nth(1)).toContainText("transfer(address,uint256)");
  });

  test("pasted ABI decodes an unknown custom function", async ({ page }) => {
    const abi = parseAbi(["function frobnicate(uint256 magic, address who)"]);
    const data = encodeFunctionData({
      abi,
      functionName: "frobnicate",
      args: [42n, DEAD as `0x${string}`],
    });

    await useAnvilChain(page);
    await page.getByTestId("input-box").fill(data);
    await page.getByTestId("to-input").fill(USDC);
    await page
      .getByTestId("abi-input")
      .fill("function frobnicate(uint256 magic, address who)");
    await page.getByTestId("run-button").click();

    await expect(page.getByTestId("decoded-call")).toContainText(
      "frobnicate(uint256,address)",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("decoded-call")).toContainText("magic");
  });
});
