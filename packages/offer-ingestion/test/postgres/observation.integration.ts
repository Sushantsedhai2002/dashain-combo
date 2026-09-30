import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import { PostgresObservationStore } from "../../src/postgres/observation-store.ts";
import { runIngestionMigrations } from "../../src/postgres/migrate.ts";

const databaseUrl =
  process.env.CATALOG_TEST_DATABASE_URL ??
  "postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test";
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!databaseName.toLowerCase().includes("test"))
  throw new Error("Integration database name must contain test");

const pool = new pg.Pool({ connectionString: databaseUrl });
const store = new PostgresObservationStore(pool);

beforeAll(async () => {
  await runIngestionMigrations(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE ingestion_observations");
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL observation store", () => {
  it("leaves a verified migration unchanged and rejects checksum drift", async () => {
    expect(await runIngestionMigrations(pool)).toBe(false);
    const name = "0002-add-removal-confirmations.sql";
    const previous = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM _offer_ingestion_migrations WHERE name = $1",
      [name],
    );
    const checksum = previous.rows[0]?.checksum;
    expect(checksum).toBeDefined();
    await pool.query(
      "UPDATE _offer_ingestion_migrations SET checksum = 'invalid' WHERE name = $1",
      [name],
    );
    try {
      await expect(runIngestionMigrations(pool)).rejects.toThrow("Ingestion migration failed");
    } finally {
      await pool.query("UPDATE _offer_ingestion_migrations SET checksum = $1 WHERE name = $2", [
        checksum,
        name,
      ]);
    }
  });

  it("keeps a stable key while active and rotates after confirmed withdrawal", async () => {
    const baseKey = "evostore:abc";
    const destinationUrl = "https://evostore.com.np/item";
    expect(await store.resolveKey("evostore", baseKey)).toBe(baseKey);
    await store.remember("evostore", baseKey, { sourceOfferKey: baseKey, destinationUrl });
    await store.remember("evostore", baseKey, { sourceOfferKey: baseKey, destinationUrl });
    expect(await store.resolveKey("evostore", baseKey)).toBe(baseKey);
    expect(await store.list("evostore")).toEqual([{ sourceOfferKey: baseKey, destinationUrl }]);

    expect(await store.recordPresence("evostore", baseKey, "REMOVED")).toBe(false);
    expect(await store.recordPresence("evostore", baseKey, "UNKNOWN")).toBe(false);
    expect(await store.recordPresence("evostore", baseKey, "REMOVED")).toBe(false);
    expect(await store.recordPresence("evostore", baseKey, "REMOVED")).toBe(true);
    await store.markWithdrawn("evostore", baseKey);
    expect(await store.list("evostore")).toEqual([]);
    expect(await store.resolveKey("evostore", baseKey)).toBe(`${baseKey}:g2`);
    await store.remember("evostore", baseKey, { sourceOfferKey: `${baseKey}:g2`, destinationUrl });
    expect(await store.list("evostore")).toEqual([
      { sourceOfferKey: `${baseKey}:g2`, destinationUrl },
    ]);
  });

  it("does not mix observations from different sources", async () => {
    await store.remember("evostore", "offer", {
      sourceOfferKey: "offer",
      destinationUrl: "https://evostore.com.np/item",
    });
    expect(await store.list("hukut")).toEqual([]);
    expect(await store.resolveKey("hukut", "offer")).toBe("offer");
  });
});
