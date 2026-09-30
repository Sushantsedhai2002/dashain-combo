import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/postgres/migrate.ts";
import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 2 });
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

const insertOffer = `
  INSERT INTO offers (
    id,
    source_id,
    source_offer_key,
    seller_display_name,
    title,
    category,
    destination_url,
    first_discovered_at,
    expires_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations({ pool, migrationsDirectory });
});

afterAll(async () => {
  await pool.end();
});

describe("offer catalog schema", () => {
  it("stores a valid text-only offer", async () => {
    const id = randomUUID();

    await pool.query(insertOffer, [
      id,
      "daraz-nepal",
      "dashain-2026",
      "Daraz Nepal",
      "Dashain sale up to 50%",
      "GENERAL_RETAIL",
      "https://www.daraz.com.np/dashain",
      "2026-09-01T00:00:00Z",
      "2026-09-21T00:00:00Z",
    ]);

    const result = await pool.query<{
      id: string;
      original_amount_minor: string | null;
      sale_amount_minor: string | null;
    }>("SELECT id, original_amount_minor, sale_amount_minor FROM offers WHERE id = $1", [id]);
    expect(result.rows).toEqual([
      {
        id,
        original_amount_minor: null,
        sale_amount_minor: null,
      },
    ]);
  });

  it("enforces one stable identity per source", async () => {
    const values = [
      randomUUID(),
      "daraz-nepal",
      "same-key",
      "Daraz Nepal",
      "Dashain sale",
      "GENERAL_RETAIL",
      "https://www.daraz.com.np/dashain",
      "2026-09-01T00:00:00Z",
      "2026-09-21T00:00:00Z",
    ];
    await pool.query(insertOffer, values);

    await expect(pool.query(insertOffer, [randomUUID(), ...values.slice(1)])).rejects.toEqual(
      expect.objectContaining({ code: "23505" }),
    );
  });

  it.each([
    {
      name: "unsupported category",
      column: "category",
      value: "PHONES",
    },
    {
      name: "non-HTTPS destination",
      column: "destination_url",
      value: "http://example.com/offer",
    },
    {
      name: "discount above one hundred",
      column: "discount_percent",
      value: 101,
    },
  ])("rejects $name", async ({ column, value }) => {
    const id = randomUUID();
    await pool.query(insertOffer, [
      id,
      "daraz-nepal",
      `offer-${id}`,
      "Daraz Nepal",
      "Dashain sale",
      "GENERAL_RETAIL",
      "https://www.daraz.com.np/dashain",
      "2026-09-01T00:00:00Z",
      "2026-09-21T00:00:00Z",
    ]);

    await expect(
      pool.query(`UPDATE offers SET ${column} = $1 WHERE id = $2`, [value, id]),
    ).rejects.toEqual(expect.objectContaining({ code: "23514" }));
  });

  it("rejects mismatched price currencies atomically", async () => {
    const id = randomUUID();
    await pool.query(insertOffer, [
      id,
      "daraz-nepal",
      "currency-mismatch",
      "Daraz Nepal",
      "Dashain sale",
      "GENERAL_RETAIL",
      "https://www.daraz.com.np/dashain",
      "2026-09-01T00:00:00Z",
      "2026-09-21T00:00:00Z",
    ]);

    await expect(
      pool.query(
        `UPDATE offers
         SET original_currency = 'NPR', original_amount_minor = 10000,
             sale_currency = 'USD', sale_amount_minor = 8000
         WHERE id = $1`,
        [id],
      ),
    ).rejects.toEqual(expect.objectContaining({ code: "23514" }));

    const result = await pool.query<{
      original_currency: string | null;
      sale_currency: string | null;
    }>("SELECT original_currency, sale_currency FROM offers WHERE id = $1", [id]);
    expect(result.rows).toEqual([{ original_currency: null, sale_currency: null }]);
  });
});
