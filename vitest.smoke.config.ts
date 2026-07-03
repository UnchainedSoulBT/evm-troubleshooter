import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/smoke/**/*.test.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    // hits live public RPCs; keep sequential and tolerant
    fileParallelism: false,
    retry: 2,
  },
});
