import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/offer-catalog/test/postgres/**/*.integration.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      include: [
        "packages/offer-catalog/src/postgres/migrate.ts",
        "packages/offer-catalog/src/postgres/offer-repository.ts",
        "packages/offer-catalog/src/postgres/row-mapper.ts",
      ],
      thresholds: { lines: 80, perFile: true },
    },
  },
});
