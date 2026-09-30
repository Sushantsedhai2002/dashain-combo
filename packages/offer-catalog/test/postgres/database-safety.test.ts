import { describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl, databaseNameFromUrl } from "./integration-environment.ts";

describe("integration database safety", () => {
  it("extracts a URL-encoded test database name", () => {
    expect(databaseNameFromUrl("postgresql://user:pass@127.0.0.1:55432/catalog%5Ftest")).toBe(
      "catalog_test",
    );
  });

  it("accepts a database whose name contains test", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://user:pass@127.0.0.1:55432/dashain_catalog_test"),
    ).not.toThrow();
  });

  it.each([
    "postgresql://user:pass@127.0.0.1:5432/dashain_catalog",
    "postgresql://user:pass@127.0.0.1:5432/postgres",
    "not-a-url",
  ])("rejects unsafe database URL %s", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(
      "Integration database name must contain test",
    );
  });
});
