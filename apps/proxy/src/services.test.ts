import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const TRANSFER_SIG = "transfer(address,uint256)";
const ERC20_ABI_JSON = JSON.stringify([
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
]);

function serviceMock(handlers: {
  openchain?: (url: URL) => unknown;
  sourcify?: (url: URL) => { status: number; body: unknown };
  etherscan?: (url: URL) => unknown;
}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "api.openchain.xyz") {
      return Response.json(handlers.openchain?.(url) ?? { ok: false });
    }
    if (url.hostname === "sourcify.dev") {
      const res = handlers.sourcify?.(url) ?? { status: 404, body: {} };
      return Response.json(res.body, { status: res.status });
    }
    if (url.hostname === "api.etherscan.io") {
      return Response.json(
        handlers.etherscan?.(url) ?? { status: "0", result: "" },
      );
    }
    throw new Error(`unexpected host ${url.hostname}`);
  });
}

describe("GET /api/selectors/:kind/:selector", () => {
  it("returns openchain candidates and caches them", async () => {
    const fetchFn = serviceMock({
      openchain: () => ({
        ok: true,
        result: {
          function: {
            "0xa9059cbb": [{ name: TRANSFER_SIG, filtered: false }],
          },
        },
      }),
    });
    const app = createApp({ fetchFn });

    const res = await app.request("/api/selectors/function/0xa9059cbb");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [TRANSFER_SIG] });

    const again = await app.request("/api/selectors/function/0xa9059cbb");
    expect(again.headers.get("x-proxy-cache")).toBe("HIT");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("validates the selector and kind", async () => {
    const app = createApp({ fetchFn: serviceMock({}) });
    expect((await app.request("/api/selectors/function/nothex")).status).toBe(
      400,
    );
    expect((await app.request("/api/selectors/banana/0xa9059cbb")).status).toBe(
      400,
    );
  });

  it("returns an empty list when openchain has nothing", async () => {
    const app = createApp({
      fetchFn: serviceMock({
        openchain: () => ({ ok: true, result: { function: {} } }),
      }),
    });
    const res = await app.request("/api/selectors/function/0x12345678");
    expect(await res.json()).toEqual({ results: [] });
  });
});

describe("GET /api/abi/:chainId/:address", () => {
  const ADDR = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  it("serves a Sourcify-verified ABI and caches it", async () => {
    const fetchFn = serviceMock({
      sourcify: () => ({
        status: 200,
        body: { abi: JSON.parse(ERC20_ABI_JSON) },
      }),
    });
    const app = createApp({ fetchFn });

    const res = await app.request(`/api/abi/1/${ADDR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { abi: unknown[]; source: string };
    expect(body.source).toBe("sourcify");
    expect(body.abi).toHaveLength(1);

    await app.request(`/api/abi/1/${ADDR}`);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("falls back to Etherscan V2 with the server-side key", async () => {
    const fetchFn = serviceMock({
      sourcify: () => ({ status: 404, body: {} }),
      etherscan: (url) => {
        expect(url.searchParams.get("apikey")).toBe("server-key");
        expect(url.searchParams.get("chainid")).toBe("1");
        return { status: "1", result: ERC20_ABI_JSON };
      },
    });
    const app = createApp({
      fetchFn,
      env: { ETHERSCAN_API_KEY: "server-key" },
    });

    const res = await app.request(`/api/abi/1/${ADDR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { abi: unknown[]; source: string };
    expect(body.source).toBe("etherscan");
    // the key must never leak into the response
    expect(JSON.stringify(body)).not.toContain("server-key");
  });

  it("skips Etherscan without a key and 404s when unverified", async () => {
    const fetchFn = serviceMock({
      sourcify: () => ({ status: 404, body: {} }),
    });
    const app = createApp({ fetchFn, env: {} });
    const res = await app.request(`/api/abi/1/${ADDR}`);
    expect(res.status).toBe(404);
    // only sourcify was tried
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("validates the address", async () => {
    const app = createApp({ fetchFn: serviceMock({}) });
    expect((await app.request("/api/abi/1/0x1234")).status).toBe(400);
  });
});
