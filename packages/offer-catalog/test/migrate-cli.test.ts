import { describe, expect, it } from "vitest";

import { runMigrateCli } from "../src/cli/migrate.ts";
import { CatalogMigrationError } from "../src/postgres/errors.ts";

describe("runMigrateCli", () => {
  it("fails safely when DATABASE_URL is absent", async () => {
    const stderr: string[] = [];

    const exitCode = await runMigrateCli(
      {},
      {
        migrate: async () => [],
        stdout: () => undefined,
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toEqual(["DATABASE_URL is required.\n"]);
  });

  it("reports applied migration names", async () => {
    const stdout: string[] = [];

    const exitCode = await runMigrateCli(
      { DATABASE_URL: "postgresql://example.invalid/catalog" },
      {
        migrate: async () => ["0001-create.sql"],
        stdout: (message) => stdout.push(message),
        stderr: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["Applied 1 migration: 0001-create.sql\n"]);
  });

  it("does not expose an underlying migration message", async () => {
    const stderr: string[] = [];

    const exitCode = await runMigrateCli(
      { DATABASE_URL: "postgresql://user:secret@example.invalid/catalog" },
      {
        migrate: async () => {
          throw new CatalogMigrationError(
            "MIGRATION_FAILED",
            "driver included postgresql://user:secret@example.invalid/catalog",
          );
        },
        stdout: () => undefined,
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toEqual(["Catalog migration failed.\n"]);
    expect(stderr.join("")).not.toContain("secret");
  });
});
