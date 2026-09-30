import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });

beforeAll(async () => {
  await pool.query("SELECT 1");
});

afterAll(async () => {
  await pool.end();
});

describe("catalog PostgreSQL integration environment", () => {
  it("connects only to the dedicated test database", async () => {
    const result = await pool.query<{ current_database: string }>("SELECT current_database()");

    expect(result.rows).toEqual([{ current_database: "dashain_offer_catalog_test" }]);
  });
});
