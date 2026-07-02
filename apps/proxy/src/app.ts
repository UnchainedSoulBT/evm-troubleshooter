import { Hono, type Context } from "hono";
import { isMethodAllowed } from "./allowlist";
import { cacheKey, createCache, isCacheable } from "./cache";
import { createRateLimiter } from "./rate-limit";
import { isRelayUrlAllowed, resolveUpstream } from "./upstream";

export interface ProxyDeps {
  fetchFn?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  rateLimit?: { perMinute: number; burst: number };
  cache?: { maxEntries: number; ttlMs: number };
}

interface RpcRequest {
  jsonrpc: string;
  id: unknown;
  method: string;
  params?: unknown[];
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * The selective RPC proxy (PLAN §5.7). Two relay routes:
 *   POST /api/rpc/:chainId — shared gateway to the chain's upstream
 *     (env `RPC_URL_<chainId>` overrides the public registry RPC)
 *   POST /api/rpc?url=…    — verbatim relay for CORS-less user RPCs
 * Both enforce the method allowlist and a per-IP rate limit; immutable
 * reads are cached. BYO-RPC users bypass this proxy entirely.
 */
export function createApp(deps: ProxyDeps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const checkRate = createRateLimiter({
    perMinute: deps.rateLimit?.perMinute ?? Number(env.RATE_LIMIT_PER_MIN ?? 120),
    burst: deps.rateLimit?.burst ?? Number(env.RATE_LIMIT_BURST ?? 30),
    now,
  });
  const cache = createCache({
    maxEntries: deps.cache?.maxEntries ?? 2_000,
    ttlMs: deps.cache?.ttlMs ?? 24 * 60 * 60 * 1000,
    now,
  });

  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ ok: true }));

  async function relay(c: Context, upstream: string) {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = checkRate(ip);
    if (!rate.ok) {
      return c.json(rpcError(null, -32005, "rate limit exceeded"), 429, {
        "retry-after": String(rate.retryAfter),
      });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(rpcError(null, -32700, "parse error"), 400);
    }
    if (Array.isArray(body)) {
      return c.json(
        rpcError(null, -32600, "batch requests are not supported"),
        400,
      );
    }
    const req = body as RpcRequest;
    if (req?.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return c.json(rpcError(req?.id, -32600, "invalid request"), 400);
    }
    if (!isMethodAllowed(req.method)) {
      return c.json(
        rpcError(req.id, -32601, `method ${req.method} not allowed by proxy`),
        403,
      );
    }
    const params = Array.isArray(req.params) ? req.params : [];

    const key = cacheKey(upstream, req.method, params);
    const cached = cache.get(key);
    if (cached !== undefined) {
      const parsed = JSON.parse(cached) as { result: unknown };
      return c.json(
        { jsonrpc: "2.0", id: req.id ?? null, result: parsed.result },
        200,
        { "x-proxy-cache": "HIT" },
      );
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetchFn(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: req.id ?? 1,
          method: req.method,
          params,
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return c.json(rpcError(req.id, -32002, "upstream RPC unreachable"), 502);
    }

    let text: string;
    try {
      text = await upstreamRes.text();
    } catch {
      return c.json(rpcError(req.id, -32002, "upstream read failed"), 502);
    }
    if (!upstreamRes.ok) {
      return c.json(
        rpcError(req.id, -32002, `upstream HTTP ${upstreamRes.status}`),
        502,
      );
    }

    try {
      const parsed = JSON.parse(text) as { result?: unknown; error?: unknown };
      if (
        parsed.error === undefined &&
        isCacheable(req.method, params, parsed.result)
      ) {
        cache.set(key, JSON.stringify({ result: parsed.result }));
      }
    } catch {
      return c.json(rpcError(req.id, -32002, "upstream returned non-JSON"), 502);
    }

    return c.body(text, 200, {
      "content-type": "application/json",
      "x-proxy-cache": "MISS",
    });
  }

  app.post("/rpc/:chainId", async (c) => {
    const chainId = Number(c.req.param("chainId"));
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return c.json(rpcError(null, -32602, "invalid chainId"), 400);
    }
    const upstream = resolveUpstream(chainId, env);
    if (!upstream) {
      return c.json(
        rpcError(null, -32602, `chain ${chainId} is not served by this proxy`),
        404,
      );
    }
    return relay(c, upstream);
  });

  app.post("/rpc", async (c) => {
    const url = c.req.query("url");
    if (!url || !isRelayUrlAllowed(url, env)) {
      return c.json(
        rpcError(null, -32602, "missing or disallowed relay url"),
        400,
      );
    }
    return relay(c, url);
  });

  return app;
}

export const app = createApp();
