import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import { runMigrations } from "../../../offer-catalog/src/postgres/migrate.ts";
import { runIngestionCli } from "../../src/cli/ingest.ts";
import { createIngestionRuntime } from "../../src/cli/runtime.ts";
import { runIngestionMigrations } from "../../src/postgres/migrate.ts";

const databaseUrl =
  process.env.CATALOG_TEST_DATABASE_URL ??
  "postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test";
if (!new URL(databaseUrl).pathname.toLowerCase().includes("test")) {
  throw new Error("Integration database name must contain test");
}
const pool = new pg.Pool({ connectionString: databaseUrl });
const output: string[] = [];
const io = {
  stdout: (message: string) => output.push(message),
  stderr: (message: string) => output.push(message),
};
const html = `<div class="products-list-container"><div class="common-item grey-white"><a href="https://evostore.com.np/speaker"><div class="name"><p>Speaker sale</p></div><div class="price"><p>NPR 4,000<s>NPR 5,000</s></p></div></a></div></div>`;

beforeAll(async () => {
  await runMigrations({
    pool,
    migrationsDirectory: fileURLToPath(
      new URL("../../../offer-catalog/migrations/", import.meta.url),
    ),
  });
  await runIngestionMigrations(pool);
});

beforeEach(async () => {
  output.length = 0;
  await pool.query("TRUNCATE ingestion_observations, offers");
});

afterAll(async () => {
  await pool.end();
});

describe("ingestion runtime with PostgreSQL", () => {
  it("publishes all nine recorded sources and preserves their identities on a repeated run", async () => {
    const origins: Readonly<Record<string, string>> = {
      "https://evostore.com.np": "evostore",
      "https://onlinesaathi.com": "online-saathi",
      "https://midea.com.np": "midea-nepal",
      "https://www.neostore.com.np": "neo-store",
      "https://calibershoes.com": "caliber-shoes",
      "https://itti.com.np": "itti",
      "https://choicemandu.com": "choicemandu",
      "https://bigdigital.com.np": "big-digital",
      "https://www.daraz.com.np": "daraz-nepal",
    };
    const runtime = createIngestionRuntime(databaseUrl, io, {
      fetchPage: async (url) => {
        if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /" };
        const id = origins[new URL(url).origin];
        if (id === undefined) throw new Error("Unexpected fixture origin");
        return {
          status: 200,
          body: await readFile(new URL(`../fixtures/${id}.html`, import.meta.url), "utf8"),
        };
      },
    });
    try {
      expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
      const before = await pool.query<{ id: string; source_id: string; first_discovered_at: Date }>(
        "SELECT id, source_id, first_discovered_at FROM offers ORDER BY id",
      );
      expect(before.rows).toHaveLength(112);
      expect(new Set(before.rows.map((row) => row.source_id)).size).toBe(9);
      expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
      const after = await pool.query(
        "SELECT id, source_id, first_discovered_at FROM offers ORDER BY id",
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      await runtime.close();
    }
  });
  it("publishes an active source offer idempotently across runs", async () => {
    const runtime = createIngestionRuntime(databaseUrl, io, {
      fetchPage: async (url) => ({
        status: 200,
        body: url.endsWith("/robots.txt") ? "User-agent: *\nAllow: /" : html,
      }),
      sourceIds: ["evostore"],
    });
    try {
      expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
      expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
      const result = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM offers WHERE source_id = $1",
        ["evostore"],
      );
      expect(result.rows[0]?.count).toBe("1");
    } finally {
      await runtime.close();
    }
  });

  it("skips a run while another process holds the advisory lock", async () => {
    const client = await pool.connect();
    await client.query("SELECT pg_advisory_lock($1)", [1_846_273_913]);
    const runtime = createIngestionRuntime(databaseUrl, io, {
      fetchPage: async (url) => ({
        status: 200,
        body: url.endsWith("/robots.txt") ? "User-agent: *\nAllow: /" : html,
      }),
      sourceIds: ["evostore"],
    });
    try {
      expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
      expect(output.join(" ")).toMatch(/another ingestion run/i);
      const result = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM offers",
      );
      expect(result.rows[0]?.count).toBe("0");
    } finally {
      await runtime.close();
      await client.query("SELECT pg_advisory_unlock($1)", [1_846_273_913]);
      client.release();
    }
  });
});
