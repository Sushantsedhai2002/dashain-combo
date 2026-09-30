import { fileURLToPath } from "node:url";

import type { SourceDefinition } from "@dashain-offer/source-registry";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildOfferCatalog, buildOfferLifecycleCatalog } from "../../src/catalog.ts";
import { runMigrations } from "../../src/postgres/migrate.ts";
import { PostgresOfferRepository } from "../../src/postgres/offer-repository.ts";
import { activeSource, textOnlyOffer } from "../fixtures/offers.ts";
import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
const queryNow = new Date("2026-09-10T06:00:00.000Z");

const automotiveSource: SourceDefinition = {
  ...activeSource,
  id: "hyundai-nepal",
  displayName: "Hyundai Nepal",
};

beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations({ pool, migrationsDirectory });
});

afterAll(async () => {
  await pool.end();
});

async function publishAt(
  id: string,
  discoveredAt: string,
  input: Parameters<ReturnType<typeof buildOfferLifecycleCatalog>["publishOffer"]>[0],
): Promise<void> {
  const result = await buildOfferLifecycleCatalog(new PostgresOfferRepository(pool), {
    clock: () => new Date(discoveredAt),
    idGenerator: () => id,
  }).publishOffer(input);
  expect(result.ok).toBe(true);
}

describe("visible offer search", () => {
  it("matches approved fields and treats SQL wildcard characters literally", async () => {
    await publishAt("00000000-0000-4000-8000-000000000001", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      sourceOfferKey: "literal-wildcards",
      title: "Save 50%_today",
      brandName: "Acme",
      productName: "Festival phone",
    });
    await publishAt("00000000-0000-4000-8000-000000000002", "2026-09-02T00:00:00Z", {
      ...textOnlyOffer,
      sourceOfferKey: "other-offer",
      title: "Save 50 percent today",
    });

    const catalog = buildOfferCatalog(new PostgresOfferRepository(pool), {
      clock: () => queryNow,
    });
    const literal = await catalog.searchVisibleOffers({ text: "%_" });
    const brand = await catalog.searchVisibleOffers({ text: "acm" });
    const product = await catalog.searchVisibleOffers({ text: "PHONE" });
    const seller = await catalog.searchVisibleOffers({ text: "daraz" });
    const category = await catalog.searchVisibleOffers({ text: "general_ret" });

    for (const result of [literal, brand, product]) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items.map((offer) => offer.sourceOfferKey)).toEqual([
          "literal-wildcards",
        ]);
      }
    }
    for (const result of [seller, category]) {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.items).toHaveLength(2);
    }
  });

  it("combines category and source filters and excludes hidden offers", async () => {
    await publishAt("00000000-0000-4000-8000-000000000010", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      source: automotiveSource,
      sourceOfferKey: "active-car",
      title: "Dashain vehicle offer",
      category: "AUTOMOTIVE",
    });
    await publishAt("00000000-0000-4000-8000-000000000011", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      sourceOfferKey: "wrong-category",
    });
    await publishAt("00000000-0000-4000-8000-000000000012", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      source: automotiveSource,
      sourceOfferKey: "expired-car",
      category: "AUTOMOTIVE",
      explicitValidityEnd: {
        kind: "INSTANT",
        value: "2026-09-10T06:00:00.000Z",
      },
    });

    const result = await buildOfferCatalog(new PostgresOfferRepository(pool), {
      clock: () => queryNow,
    }).searchVisibleOffers({
      categories: ["AUTOMOTIVE"],
      sourceIds: ["hyundai-nepal"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.map((offer) => offer.sourceOfferKey)).toEqual(["active-car"]);
    }
  });

  it("paginates newest offers without gaps across tied values", async () => {
    const ids = [
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000022",
      "00000000-0000-4000-8000-000000000023",
      "00000000-0000-4000-8000-000000000024",
      "00000000-0000-4000-8000-000000000025",
    ];
    await Promise.all(
      ids.map((id, index) =>
        publishAt(id, "2026-09-01T00:00:00Z", {
          ...textOnlyOffer,
          sourceOfferKey: `page-${index}`,
        }),
      ),
    );

    const catalog = buildOfferCatalog(new PostgresOfferRepository(pool), {
      clock: () => queryNow,
    });
    const collected: string[] = [];
    let cursor: string | null = null;

    do {
      const page = await catalog.searchVisibleOffers({
        sort: "NEWEST",
        limit: 2,
        cursor,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      collected.push(...page.value.items.map((offer) => offer.id));
      cursor = page.value.nextCursor;
    } while (cursor !== null);

    expect(collected).toEqual([...ids].reverse());
    expect(new Set(collected).size).toBe(ids.length);
  });

  it("orders expiring offers by expiry and stable ID", async () => {
    await publishAt("00000000-0000-4000-8000-000000000031", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      sourceOfferKey: "later",
      explicitValidityEnd: {
        kind: "INSTANT",
        value: "2026-09-13T00:00:00Z",
      },
    });
    await publishAt("00000000-0000-4000-8000-000000000032", "2026-09-01T00:00:00Z", {
      ...textOnlyOffer,
      sourceOfferKey: "sooner",
      explicitValidityEnd: {
        kind: "INSTANT",
        value: "2026-09-12T00:00:00Z",
      },
    });

    const result = await buildOfferCatalog(new PostgresOfferRepository(pool), {
      clock: () => queryNow,
    }).searchVisibleOffers({ sort: "EXPIRING_SOON" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.map((offer) => offer.sourceOfferKey)).toEqual(["sooner", "later"]);
    }
  });
});
