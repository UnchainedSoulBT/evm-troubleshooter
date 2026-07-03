import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/proxy/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      // network-only paths (buildProbeOverride, runReadProbe) are exercised
      // by the forked-Anvil suite, which runs under a separate config
      thresholds: {
        statements: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
