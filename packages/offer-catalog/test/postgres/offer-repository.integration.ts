import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildOfferPublisher } from "../../src/catalog.ts";
import { runMigrations } from "../../src/postgres/migrate.ts";
import { PostgresOfferRepository } from "../../src/postgres/offer-repository.ts";
import { textOnlyOffer } from "../fixtures/offers.ts";
import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
const now = new Date("2026-09-01T06:00:00.000Z");

beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations({ pool, migrationsDirectory });
});

afterAll(async () => {
  await pool.end();
});

describe("PostgresOfferRepository publication", () => {
  it("persists and returns a text-only offer", async () => {
    const publisher = buildOfferPublisher(new PostgresOfferRepository(pool), {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });

    const result = await publisher.publishOffer(textOnlyOffer);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(
        expect.objectContaining({
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Dashain sale up to 50%",
          sellerDisplayName: "Daraz Nepal",
          sourcePublishedAt: null,
          explicitValidityEnd: null,
          firstDiscoveredAt: "2026-09-01T06:00:00.000Z",
          expiresAt: "2026-09-21T06:00:00.000Z",
          lifecycleStatus: "ACTIVE",
        }),
      );
    }

    const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM offers");
    expect(count.rows).toEqual([{ count: "1" }]);
  });

  it("persists prices and explicit Kathmandu validity", async () => {
    const publisher = buildOfferPublisher(new PostgresOfferRepository(pool), {
      clock: () => now,
      idGenerator: () => "40df2a87-7d4f-4479-b140-61c78a536ab9",
    });

    const result = await publisher.publishOffer({
      ...textOnlyOffer,
      sourceOfferKey: "priced-offer",
      originalPrice: { currency: "NPR", amountMinor: 100_000 },
      salePrice: { currency: "NPR", amountMinor: 80_000 },
      explicitValidityEnd: {
        kind: "KATHMANDU_DATE",
        value: "2026-10-05",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.originalPrice).toEqual({
        currency: "NPR",
        amountMinor: 100_000,
      });
      expect(result.value.explicitValidityEnd).toEqual({
        kind: "KATHMANDU_DATE",
        value: "2026-10-05",
      });
      expect(result.value.expiresAt).toBe("2026-10-05T18:15:00.000Z");
    }
  });
});
