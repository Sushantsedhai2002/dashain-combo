import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.{ts,mjs}"],
    passWithNoTests: true,
    coverage: {
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/offer-catalog/src/postgres/migrate.ts",
        "packages/offer-catalog/src/postgres/offer-repository.ts",
        "packages/offer-catalog/src/postgres/row-mapper.ts",
      ],
      thresholds: { lines: 80, perFile: true },
    },
  },
});
