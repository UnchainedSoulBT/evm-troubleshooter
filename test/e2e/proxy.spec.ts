import { expect, test } from "@playwright/test";

test("mounted proxy responds on /api/health", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ ok: true });
});

test("mounted proxy rejects a disallowed method with a JSON-RPC error", async ({
  request,
}) => {
  const res = await request.post("/api/rpc/1", {
    data: { jsonrpc: "2.0", id: 1, method: "eth_accounts", params: [] },
  });
  expect(res.status()).toBe(403);
  const body = (await res.json()) as { error: { code: number } };
  expect(body.error.code).toBe(-32601);
});

test("mounted proxy blocks SSRF relay targets", async ({ request }) => {
  const res = await request.post(
    `/api/rpc?url=${encodeURIComponent("http://169.254.169.254/latest")}`,
    { data: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] } },
  );
  expect(res.status()).toBe(400);
});

test("default chain capabilities are probed through the proxy", async ({
  page,
}) => {
  const proxied: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/rpc/1")) proxied.push(req.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("capability-estimateGas")).toHaveAttribute(
    "data-on",
    "true",
    { timeout: 30_000 },
  );
  expect(proxied.length).toBeGreaterThan(0);
});
