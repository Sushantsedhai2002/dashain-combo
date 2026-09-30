import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolConfiguration: null as unknown,
  endPool: vi.fn(async () => undefined),
  runMigrations: vi.fn(async () => ["0001-create.sql"] as const),
}));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      constructor(configuration: unknown) {
        mocks.poolConfiguration = configuration;
      }

      end = mocks.endPool;
    },
  },
}));

vi.mock("../src/postgres/migrate.ts", () => ({
  runMigrations: mocks.runMigrations,
}));

import { migrateDatabase, runMigrateCli } from "../src/cli/migrate.ts";
import { CatalogMigrationError } from "../src/postgres/errors.ts";

describe("migrateDatabase", () => {
  it("uses one pool and always closes it", async () => {
    await expect(migrateDatabase("postgresql://localhost/catalog", "migrations")).resolves.toEqual([
      "0001-create.sql",
    ]);

    expect(mocks.poolConfiguration).toEqual({
      connectionString: "postgresql://localhost/catalog",
      max: 1,
    });
    expect(mocks.runMigrations).toHaveBeenCalledWith({
      pool: expect.any(Object),
      migrationsDirectory: "migrations",
    });
    expect(mocks.endPool).toHaveBeenCalledOnce();
  });
});

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

  it("reports when no migrations are pending", async () => {
    const stdout: string[] = [];

    const exitCode = await runMigrateCli(
      { DATABASE_URL: "postgresql://example.invalid/catalog" },
      {
        migrate: async () => [],
        stdout: (message) => stdout.push(message),
        stderr: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["No pending migrations.\n"]);
  });

  it("uses a plural label for multiple migrations", async () => {
    const stdout: string[] = [];

    const exitCode = await runMigrateCli(
      { DATABASE_URL: "postgresql://example.invalid/catalog" },
      {
        migrate: async () => ["0001-create.sql", "0002-index.sql"],
        stdout: (message) => stdout.push(message),
        stderr: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["Applied 2 migrations: 0001-create.sql, 0002-index.sql\n"]);
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

  it("sanitizes unknown migration failures", async () => {
    const stderr: string[] = [];

    const exitCode = await runMigrateCli(
      { DATABASE_URL: "postgresql://user:secret@example.invalid/catalog" },
      {
        migrate: async () => {
          throw new Error("postgresql://user:secret@example.invalid/catalog");
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
