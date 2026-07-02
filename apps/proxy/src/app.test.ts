import { describe, expect, it } from "vitest";
import { app } from "./app";

describe("proxy app", () => {
  it("responds on /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
