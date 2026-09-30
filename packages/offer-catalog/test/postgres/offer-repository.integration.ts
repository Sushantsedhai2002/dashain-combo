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

  it("preserves identity and fallback expiry when rediscovered", async () => {
    const repository = new PostgresOfferRepository(pool);
    const firstPublisher = buildOfferPublisher(repository, {
      clock: () => new Date("2026-09-01T06:00:00.000Z"),
      idGenerator: () => "d960c846-ac77-45ab-a1ea-58c0b856fb99",
    });
    const laterPublisher = buildOfferPublisher(repository, {
      clock: () => new Date("2026-09-06T06:00:00.000Z"),
      idGenerator: () => "db9b9f11-0ee2-4971-aa6e-35f43b337b15",
    });

    const first = await firstPublisher.publishOffer(textOnlyOffer);
    const updated = await laterPublisher.publishOffer({
      ...textOnlyOffer,
      title: "Updated Dashain sale",
    });

    expect(first.ok).toBe(true);
    expect(updated.ok).toBe(true);
    if (first.ok && updated.ok) {
      expect(updated.value.id).toBe(first.value.id);
      expect(updated.value.title).toBe("Updated Dashain sale");
      expect(updated.value.firstDiscoveredAt).toBe("2026-09-01T06:00:00.000Z");
      expect(updated.value.expiresAt).toBe("2026-09-21T06:00:00.000Z");
      expect(updated.value.updatedAt).toBe("2026-09-06T06:00:00.000Z");
    }
  });

  it("recalculates expiry when explicit validity appears later", async () => {
    const repository = new PostgresOfferRepository(pool);
    await buildOfferPublisher(repository, {
      clock: () => new Date("2026-09-01T06:00:00.000Z"),
      idGenerator: () => "c185e350-b558-4b07-b11a-f20d596563af",
    }).publishOffer(textOnlyOffer);

    const updated = await buildOfferPublisher(repository, {
      clock: () => new Date("2026-09-06T06:00:00.000Z"),
      idGenerator: () => "06a4ce8c-f09b-489a-8223-31d2e866106e",
    }).publishOffer({
      ...textOnlyOffer,
      explicitValidityEnd: {
        kind: "KATHMANDU_DATE",
        value: "2026-10-05",
      },
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.firstDiscoveredAt).toBe("2026-09-01T06:00:00.000Z");
      expect(updated.value.expiresAt).toBe("2026-10-05T18:15:00.000Z");
    }
  });

  it("creates one identity under concurrent retries", async () => {
    const repository = new PostgresOfferRepository(pool);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        buildOfferPublisher(repository, {
          clock: () => now,
          idGenerator: () => `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`,
        }).publishOffer(textOnlyOffer),
      ),
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const ids = results.flatMap((result) => (result.ok ? [result.value.id] : []));
    expect(new Set(ids).size).toBe(1);

    const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM offers");
    expect(count.rows).toEqual([{ count: "1" }]);
  });
});
