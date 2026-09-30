import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/postgres/migrate.ts";
import { CatalogMigrationError } from "../../src/postgres/errors.ts";
import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const temporaryDirectories: string[] = [];

async function migrationsDirectory(files: Readonly<Record<string, string>>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "offer-catalog-migrations-"));
  temporaryDirectories.push(directory);

  await Promise.all(
    Object.entries(files).map(([name, sql]) => writeFile(join(directory, name), sql, "utf8")),
  );

  return directory;
}

beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
});

afterAll(async () => {
  await pool.end();
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("runMigrations", () => {
  it("applies ordered migrations once", async () => {
    const directory = await migrationsDirectory({
      "0001-create-example.sql": "CREATE TABLE example (id integer PRIMARY KEY);",
      "0002-seed-example.sql": "INSERT INTO example (id) VALUES (1);",
    });

    await expect(runMigrations({ pool, migrationsDirectory: directory })).resolves.toEqual([
      "0001-create-example.sql",
      "0002-seed-example.sql",
    ]);
    await expect(runMigrations({ pool, migrationsDirectory: directory })).resolves.toEqual([]);

    const result = await pool.query<{ id: number }>("SELECT id FROM example");
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it("rejects a changed applied migration before applying a later file", async () => {
    const directory = await migrationsDirectory({
      "0001-create-example.sql": "CREATE TABLE example (id integer PRIMARY KEY);",
    });
    await runMigrations({ pool, migrationsDirectory: directory });

    await writeFile(
      join(directory, "0001-create-example.sql"),
      "CREATE TABLE changed_example (id integer PRIMARY KEY);",
      "utf8",
    );
    await writeFile(
      join(directory, "0002-should-not-run.sql"),
      "CREATE TABLE should_not_run (id integer PRIMARY KEY);",
      "utf8",
    );

    try {
      await runMigrations({ pool, migrationsDirectory: directory });
      expect.unreachable("Expected the changed checksum to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogMigrationError);
      if (error instanceof CatalogMigrationError) {
        expect(error.code).toBe("MIGRATION_CHECKSUM_MISMATCH");
      }
    }

    const result = await pool.query<{ exists: string | null }>(
      "SELECT to_regclass('public.should_not_run')::text AS exists",
    );
    expect(result.rows).toEqual([{ exists: null }]);
  });

  it("serializes concurrent migration runners", async () => {
    const directory = await migrationsDirectory({
      "0001-concurrent.sql":
        "SELECT pg_sleep(0.05); CREATE TABLE concurrent_example (id integer PRIMARY KEY);",
    });

    const results = await Promise.all([
      runMigrations({ pool, migrationsDirectory: directory }),
      runMigrations({ pool, migrationsDirectory: directory }),
    ]);

    expect(results.flat()).toEqual(["0001-concurrent.sql"]);
  });
});
