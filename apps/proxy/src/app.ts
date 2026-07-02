import { Hono } from "hono";

/**
 * The RPC proxy (PLAN §5.7). Framework-agnostic Hono app: served standalone
 * via @hono/node-server in dev, mounted into apps/web for the Vercel deploy.
 * Allowlist, rate limit, and caching land in Phase 2.
 */
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));
