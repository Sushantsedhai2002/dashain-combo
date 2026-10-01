import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import { runMigrations } from "../../../offer-catalog/src/postgres/migrate.ts";
import { runIngestionCli } from "../../src/cli/ingest.ts";
import { createIngestionRuntime } from "../../src/cli/runtime.ts";
import { createWebsiteAdapters } from "../../src/adapters/websites.ts";
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
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
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
  await pool.query(
    "TRUNCATE ingestion_observations, ingestion_source_health, ingestion_quarantine, offer_price_observations, offers",
  );
});

afterAll(async () => {
  await pool.end();
});

describe("ingestion runtime with PostgreSQL", () => {
  const campaignIds = ["fonepay", "yamaha-nepal", "khalti"];
  const expandedSourceIds = [
    "it-monster",
    "maxell",
    "proud-nepal",
    "sb-furniture",
    "sukumart",
    "infotechs-nepal",
    "wild-yak-gear",
    "ac-ghar",
    "mudita-store",
    "sabko-phone",
    "dealayo",
    "mask-queen-nepal",
    "maake-beauty-nepal",
    "giftmandu",
    "sugandha-griha",
    "mypower",
    "s3-tech",
  ];
  const priceSourceIds = createWebsiteAdapters(async () => ({ status: 503, body: "" }))
    .map((a) => a.sourceId)
    .filter((id) => !campaignIds.includes(id) && !expandedSourceIds.includes(id));
  // Real crawl spacing is retained. Each group verifies both publication and rediscovery
  // without overlapping database resets. The complete multi-page collectors need a scoped 60s budget.
  it.each([
    { name: "priced listings", sourceIds: priceSourceIds, offerCount: 359 },
    {
      name: "new dated campaign showcases",
      sourceIds: ["it-monster", "maxell", "proud-nepal", "infotechs-nepal"],
      offerCount: 240,
    },
    { name: "SB Furniture paginated collection", sourceIds: ["sb-furniture"], offerCount: 210 },
    { name: "Sabko exact refurbished units", sourceIds: ["sabko-phone"], offerCount: 2 },
    { name: "Dealayo complete Dashain collection", sourceIds: ["dealayo"], offerCount: 324 },
    { name: "Mask Queen available variants", sourceIds: ["mask-queen-nepal"], offerCount: 61 },
    { name: "MyPower dated bundle SKUs", sourceIds: ["mypower"], offerCount: 3 },
    { name: "S3 TECH exact Dashain products", sourceIds: ["s3-tech"], offerCount: 3 },
    { name: "Sugandha Griha dated product", sourceIds: ["sugandha-griha"], offerCount: 1 },
    { name: "Giftmandu priced Dashain products", sourceIds: ["giftmandu"], offerCount: 4 },
    { name: "Maake observed discounts", sourceIds: ["maake-beauty-nepal"], offerCount: 3 },
    { name: "Mudita dated Dashain section", sourceIds: ["mudita-store"], offerCount: 233 },
    { name: "AC Ghar festive models", sourceIds: ["ac-ghar"], offerCount: 6 },
    { name: "Wild Yak selected variants", sourceIds: ["wild-yak-gear"], offerCount: 40 },
    { name: "Sukumart paginated collection", sourceIds: ["sukumart"], offerCount: 24 },
    { name: "Fonepay campaigns", sourceIds: ["fonepay"], offerCount: 4 },
    { name: "Yamaha and Khalti campaigns", sourceIds: ["yamaha-nepal", "khalti"], offerCount: 4 },
  ])(
    "publishes $name and preserves identities on rediscovery",
    async ({ sourceIds, offerCount }) => {
      const pages: Readonly<Record<string, string>> = JSON.parse(
        await readFile(new URL("../fixtures/pages.json", import.meta.url), "utf8"),
      );
      const runtime = createIngestionRuntime(databaseUrl, io, {
        sourceIds,
        fetchPage: async (url, source) => {
          if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /" };
          const id = source.id;
          return {
            status: 200,
            body: await readFile(
              new URL(`../fixtures/${pages[url] ?? `${id}.html`}`, import.meta.url),
              "utf8",
            ),
          };
        },
      });
      try {
        expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
        const before = await pool.query<{
          id: string;
          source_id: string;
          first_discovered_at: Date;
        }>("SELECT id, source_id, first_discovered_at FROM offers ORDER BY id");
        expect(before.rows).toHaveLength(offerCount);
        expect(new Set(before.rows.map((row) => row.source_id)).size).toBe(sourceIds.length);
        expect(await runIngestionCli([], runtime.dependencies)).toBe(0);
        const after = await pool.query(
          "SELECT id, source_id, first_discovered_at FROM offers ORDER BY id",
        );
        expect(after.rows).toEqual(before.rows);
      } finally {
        await runtime.close();
      }
    },
    60_000,
  );
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
