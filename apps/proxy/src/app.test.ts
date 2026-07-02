import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const UPSTREAM = "https://ethereum-rpc.publicnode.com";

function jsonRpc(method: string, params: unknown[] = [], id: unknown = 1) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  };
}

function upstreamMock(handler: (method: string, params: unknown[]) => unknown) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body)) as {
      id: unknown;
      method: string;
      params: unknown[];
    };
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        result: handler(req.method, req.params),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

describe("health", () => {
  it("responds on /api/health", async () => {
    const res = await createApp().request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("method allowlist", () => {
  it("relays an allowed method to the upstream", async () => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({ fetchFn });
    const res = await app.request("/api/rpc/1", jsonRpc("eth_chainId"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "0x1" });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]?.[0]).toBe(UPSTREAM);
  });

  it.each(["eth_accounts", "admin_peers", "personal_sign", "anvil_setCode"])(
    "rejects %s without touching the upstream",
    async (method) => {
      const fetchFn = upstreamMock(() => "0x1");
      const app = createApp({ fetchFn });
      const res = await app.request("/api/rpc/1", jsonRpc(method));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: number } };
      expect(body.error.code).toBe(-32601);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("rejects batch requests", async () => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({ fetchFn });
    const res = await app.request("/api/rpc/1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "eth_chainId" }]),
    });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("rate limit", () => {
  it("returns 429 past the burst threshold, per IP", async () => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({
      fetchFn,
      rateLimit: { perMinute: 60, burst: 3 },
      now: () => 1_000_000, // frozen clock: no refill
    });

    const call = (ip: string) =>
      app.request("/api/rpc/1", {
        ...jsonRpc("eth_chainId"),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
      });

    for (let i = 0; i < 3; i++)
      expect((await call("1.2.3.4")).status).toBe(200);
    const limited = await call("1.2.3.4");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // a different IP is unaffected
    expect((await call("5.6.7.8")).status).toBe(200);
  });
});

describe("immutable-read cache", () => {
  const MINED_TX = { hash: "0xaa", blockNumber: "0x10" };

  it("serves a repeated mined-tx lookup from cache without an upstream hit", async () => {
    const fetchFn = upstreamMock(() => MINED_TX);
    const app = createApp({ fetchFn });
    const req = () =>
      app.request("/api/rpc/1", jsonRpc("eth_getTransactionByHash", ["0xaa"]));

    const first = await req();
    expect(first.headers.get("x-proxy-cache")).toBe("MISS");
    const second = await req();
    expect(second.headers.get("x-proxy-cache")).toBe("HIT");
    expect((await second.json()) as object).toMatchObject({ result: MINED_TX });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("never caches unmined transactions or latest-tagged reads", async () => {
    const fetchFn = upstreamMock((method) =>
      method === "eth_getTransactionByHash"
        ? { hash: "0xbb", blockNumber: null }
        : "0x99",
    );
    const app = createApp({ fetchFn });

    await app.request(
      "/api/rpc/1",
      jsonRpc("eth_getTransactionByHash", ["0xbb"]),
    );
    await app.request(
      "/api/rpc/1",
      jsonRpc("eth_getTransactionByHash", ["0xbb"]),
    );
    await app.request("/api/rpc/1", jsonRpc("eth_blockNumber"));
    await app.request("/api/rpc/1", jsonRpc("eth_blockNumber"));
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});

describe("upstream resolution & keys", () => {
  it("prefers the server-side RPC_URL_<chainId> env override", async () => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({
      fetchFn,
      env: { RPC_URL_1: "https://paid-provider.example.com/KEY" },
    });
    await app.request("/api/rpc/1", jsonRpc("eth_chainId"));
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://paid-provider.example.com/KEY",
    );
  });

  it("404s for a chain it does not serve", async () => {
    const res = await createApp({ env: {} }).request(
      "/api/rpc/999999",
      jsonRpc("eth_chainId"),
    );
    expect(res.status).toBe(404);
  });
});

describe("verbatim relay (?url=)", () => {
  it("relays to a public CORS-less RPC", async () => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({ fetchFn, env: {} });
    const res = await app.request(
      `/api/rpc?url=${encodeURIComponent("https://rpc.example.com")}`,
      jsonRpc("eth_chainId"),
    );
    expect(res.status).toBe(200);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://rpc.example.com");
  });

  it.each([
    "http://127.0.0.1:8545",
    "http://localhost:8545",
    "http://10.0.0.5",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "not-a-url",
  ])("blocks SSRF target %s", async (url) => {
    const fetchFn = upstreamMock(() => "0x1");
    const app = createApp({ fetchFn, env: {} });
    const res = await app.request(
      `/api/rpc?url=${encodeURIComponent(url)}`,
      jsonRpc("eth_chainId"),
    );
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("allows private hosts only when ALLOW_PRIVATE_RPC=1 (dev/test)", async () => {
    const fetchFn = upstreamMock(() => "0x7a69");
    const app = createApp({ fetchFn, env: { ALLOW_PRIVATE_RPC: "1" } });
    const res = await app.request(
      `/api/rpc?url=${encodeURIComponent("http://127.0.0.1:8545")}`,
      jsonRpc("eth_chainId"),
    );
    expect(res.status).toBe(200);
  });
});

describe("upstream failure", () => {
  it("maps fetch failure to a 502 JSON-RPC error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const app = createApp({ fetchFn: fetchFn as unknown as typeof fetch });
    const res = await app.request("/api/rpc/1", jsonRpc("eth_chainId"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("unreachable");
  });
});
