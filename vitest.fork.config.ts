import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/fork/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // fork tests share one upstream RPC; keep them sequential
    fileParallelism: false,
  },
});
