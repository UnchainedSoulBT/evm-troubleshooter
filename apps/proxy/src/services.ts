import type { Context, Hono } from "hono";
import { createCache } from "./cache";

const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface ServiceDeps {
  fetchFn: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => number;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Key-bearing / third-party API gateway (PLAN §5.7 case 2):
 *   GET /api/selectors/:kind/:selector — openchain signature lookup
 *   GET /api/abi/:chainId/:address     — Sourcify → Etherscan V2 (key stays
 *                                        server-side) ABI resolution
 * Both cache aggressively — signatures and verified ABIs are immutable.
 */
export function registerServices(app: Hono, deps: ServiceDeps) {
  const cache = createCache({
    maxEntries: 5_000,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    now: deps.now,
  });

  function cachedJson(c: Context, key: string, status = 200) {
    const hit = cache.get(key);
    if (hit === undefined) return null;
    return c.body(hit, status as 200, {
      "content-type": "application/json",
      "x-proxy-cache": "HIT",
    });
  }

  async function fetchJson(url: string): Promise<unknown> {
    const res = await deps.fetchFn(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  app.get("/selectors/:kind/:selector", async (c) => {
    const kind = c.req.param("kind");
    const selector = c.req.param("selector").toLowerCase();
    if (
      (kind !== "function" && kind !== "error") ||
      !SELECTOR_RE.test(selector)
    ) {
      return c.json({ error: "invalid selector or kind" }, 400);
    }

    const key = `selectors|${selector}`;
    const hit = cachedJson(c, key);
    if (hit) return hit;

    let results: string[] = [];
    try {
      // custom errors share the 4-byte space with functions — one endpoint
      const data = (await fetchJson(
        `https://api.openchain.xyz/signature-database/v1/lookup?filter=true&function=${selector}`,
      )) as {
        ok?: boolean;
        result?: { function?: Record<string, { name: string }[] | null> };
      };
      results =
        data.result?.function?.[selector]?.map((entry) => entry.name) ?? [];
    } catch {
      return c.json({ error: "signature database unreachable" }, 502);
    }

    const body = JSON.stringify({ results });
    cache.set(key, body);
    return c.body(body, 200, {
      "content-type": "application/json",
      "x-proxy-cache": "MISS",
    });
  });

  app.get("/abi/:chainId/:address", async (c) => {
    const chainId = Number(c.req.param("chainId"));
    const address = c.req.param("address").toLowerCase();
    if (
      !Number.isInteger(chainId) ||
      chainId <= 0 ||
      !ADDRESS_RE.test(address)
    ) {
      return c.json({ error: "invalid chainId or address" }, 400);
    }

    const key = `abi|${chainId}|${address}`;
    const hit = cachedJson(c, key);
    if (hit) return hit;

    // 1. Sourcify (keyless, decentralized verification)
    try {
      const data = (await fetchJson(
        `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi`,
      )) as { abi?: unknown[] };
      if (Array.isArray(data.abi)) {
        const body = JSON.stringify({ abi: data.abi, source: "sourcify" });
        cache.set(key, body);
        return c.body(body, 200, {
          "content-type": "application/json",
          "x-proxy-cache": "MISS",
        });
      }
    } catch {
      // fall through to the explorer
    }

    // 2. Etherscan V2 multichain (server-side key only)
    const apiKey = deps.env.ETHERSCAN_API_KEY;
    if (apiKey) {
      try {
        const data = (await fetchJson(
          `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${apiKey}`,
        )) as { status?: string; result?: string };
        if (data.status === "1" && data.result) {
          const abi = JSON.parse(data.result) as unknown[];
          const body = JSON.stringify({ abi, source: "etherscan" });
          cache.set(key, body);
          return c.body(body, 200, {
            "content-type": "application/json",
            "x-proxy-cache": "MISS",
          });
        }
      } catch {
        // fall through to 404
      }
    }

    return c.json({ error: "no verified ABI found for this contract" }, 404);
  });
}
