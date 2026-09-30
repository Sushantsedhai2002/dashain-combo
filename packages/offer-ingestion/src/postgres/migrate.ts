import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import type { Pool } from "pg";

const LOCK_ID = 1_846_273_912;
const MIGRATION_URL = new URL("../../migrations/", import.meta.url);
const MIGRATION_NAME = /^\d{4}-[a-z0-9-]+\.sql$/;

export async function runIngestionMigrations(pool: Pool): Promise<boolean> {
  const names = (await readdir(MIGRATION_URL)).filter((name) => MIGRATION_NAME.test(name)).sort();
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = (await readFile(new URL(name, MIGRATION_URL), "utf8")).replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      return { name, sql, checksum };
    }),
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _offer_ingestion_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const result = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM _offer_ingestion_migrations ORDER BY name",
    );
    const applied = new Map(result.rows.map((row) => [row.name, row.checksum]));
    if (result.rows.some((row) => !names.includes(row.name))) {
      throw new Error("Applied ingestion migration is missing");
    }
    let appliedAny = false;
    for (const migration of migrations) {
      const previous = applied.get(migration.name);
      if (previous !== undefined) {
        if (previous !== migration.checksum)
          throw new Error("Ingestion migration checksum changed");
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO _offer_ingestion_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      appliedAny = true;
    }
    await client.query("COMMIT");
    return appliedAny;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("Ingestion migration failed");
  } finally {
    client.release();
  }
}
