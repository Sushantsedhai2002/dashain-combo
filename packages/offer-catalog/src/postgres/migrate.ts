import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Pool } from "pg";

import { CatalogMigrationError } from "./errors.ts";

const MIGRATION_FILE_PATTERN = /^\d{4}-[a-z0-9-]+\.sql$/;
const MIGRATION_LOCK_ID = 1_846_273_911;

type Migration = Readonly<{
  name: string;
  checksum: string;
  sql: string;
}>;

type RunMigrationsInput = Readonly<{
  pool: Pool;
  migrationsDirectory: string;
}>;

function normalizeSql(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function checksum(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function loadMigrations(directory: string): Promise<readonly Migration[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const invalidSqlFile = entries.find(
      (entry) =>
        entry.isFile() && entry.name.endsWith(".sql") && !MIGRATION_FILE_PATTERN.test(entry.name),
    );
    if (invalidSqlFile !== undefined) {
      throw new CatalogMigrationError(
        "MIGRATION_DIRECTORY_INVALID",
        `Catalog migration file name is invalid: ${invalidSqlFile.name}`,
      );
    }

    const names = entries
      .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    return await Promise.all(
      names.map(async (name) => {
        const sql = normalizeSql(await readFile(join(directory, name), "utf8"));
        return Object.freeze({ name, checksum: checksum(sql), sql });
      }),
    );
  } catch {
    throw new CatalogMigrationError(
      "MIGRATION_DIRECTORY_INVALID",
      "Catalog migration directory could not be read",
    );
  }
}

export async function runMigrations(input: RunMigrationsInput): Promise<readonly string[]> {
  const migrations = await loadMigrations(input.migrationsDirectory);
  const client = await input.pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _offer_catalog_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query<{
      name: string;
      checksum: string;
    }>("SELECT name, checksum FROM _offer_catalog_migrations ORDER BY name");
    const applied = new Map(
      appliedResult.rows.map((migration) => [migration.name, migration.checksum]),
    );
    const availableNames = new Set(migrations.map((migration) => migration.name));
    const missingMigration = appliedResult.rows.find(
      (migration) => !availableNames.has(migration.name),
    );
    if (missingMigration !== undefined) {
      throw new CatalogMigrationError(
        "MIGRATION_CHECKSUM_MISMATCH",
        `Applied catalog migration is missing: ${missingMigration.name}`,
      );
    }

    const latestAppliedName = appliedResult.rows.at(-1)?.name;
    const outOfOrderMigration = migrations.find(
      (migration) =>
        !applied.has(migration.name) &&
        latestAppliedName !== undefined &&
        migration.name < latestAppliedName,
    );
    if (outOfOrderMigration !== undefined) {
      throw new CatalogMigrationError(
        "MIGRATION_ORDER_INVALID",
        `Catalog migration cannot be inserted before applied history: ${outOfOrderMigration.name}`,
      );
    }

    const appliedNow: string[] = [];

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.name);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== migration.checksum) {
          throw new CatalogMigrationError(
            "MIGRATION_CHECKSUM_MISMATCH",
            `Applied catalog migration checksum changed: ${migration.name}`,
          );
        }
        continue;
      }

      await client.query(migration.sql);
      await client.query("INSERT INTO _offer_catalog_migrations (name, checksum) VALUES ($1, $2)", [
        migration.name,
        migration.checksum,
      ]);
      appliedNow.push(migration.name);
    }

    await client.query("COMMIT");
    return Object.freeze(appliedNow);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof CatalogMigrationError) throw error;
    throw new CatalogMigrationError("MIGRATION_FAILED", "Catalog migration failed");
  } finally {
    client.release();
  }
}
