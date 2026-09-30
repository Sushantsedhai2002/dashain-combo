import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.{ts,mjs}"],
    passWithNoTests: true,
    coverage: {
      include: ["packages/*/src/**/*.{ts,mjs}"],
      exclude: ["packages/*/src/cli/*-entry.mjs"],
      thresholds: { lines: 80, perFile: true },
    },
  },
});
