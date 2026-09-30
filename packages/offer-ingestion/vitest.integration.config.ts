import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/offer-ingestion/test/postgres/**/*.integration.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      include: [
        "packages/offer-ingestion/src/cli/runtime.ts",
        "packages/offer-ingestion/src/postgres/migrate.ts",
        "packages/offer-ingestion/src/postgres/observation-store.ts",
      ],
      thresholds: { lines: 80, perFile: true },
    },
  },
});
