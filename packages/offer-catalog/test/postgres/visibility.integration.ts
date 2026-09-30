import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildOfferLifecycleCatalog } from "../../src/catalog.ts";
import { runMigrations } from "../../src/postgres/migrate.ts";
import { PostgresOfferRepository } from "../../src/postgres/offer-repository.ts";
import { textOnlyOffer } from "../fixtures/offers.ts";
import { testDatabaseUrl } from "./integration-environment.ts";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations({ pool, migrationsDirectory });
});

afterAll(async () => {
  await pool.end();
});

describe("offer visibility and withdrawal", () => {
  it("retrieves an active offer and hides scheduled and expired offers", async () => {
    const now = new Date("2026-09-10T06:00:00.000Z");
    const catalog = buildOfferLifecycleCatalog(new PostgresOfferRepository(pool), {
      clock: () => now,
      idGenerator: () => "e12c502b-20f6-4610-b3bc-b4a3d633d759",
    });
    const active = await catalog.publishOffer(textOnlyOffer);
    expect(active.ok).toBe(true);
    if (!active.ok) return;

    const visible = await catalog.getVisibleOffer(active.value.id);
    expect(visible).toEqual(active);

    const scheduledCatalog = buildOfferLifecycleCatalog(new PostgresOfferRepository(pool), {
      clock: () => now,
      idGenerator: () => "fdf6955c-dc35-4db2-b5f3-c0cb8de18928",
    });
    const scheduled = await scheduledCatalog.publishOffer({
      ...textOnlyOffer,
      sourceOfferKey: "scheduled",
      validityStartsAt: "2026-09-11T00:00:00Z",
    });
    expect(scheduled.ok).toBe(true);
    if (scheduled.ok) {
      expect(await catalog.getVisibleOffer(scheduled.value.id)).toEqual({
        ok: false,
        issues: [
          {
            code: "OFFER_NOT_FOUND",
            path: "id",
            message: "Offer not found",
          },
        ],
      });
    }

    const expiredCatalog = buildOfferLifecycleCatalog(new PostgresOfferRepository(pool), {
      clock: () => now,
      idGenerator: () => "0e42f9ff-5272-4890-bf50-e986f646024f",
    });
    const expired = await expiredCatalog.publishOffer({
      ...textOnlyOffer,
      sourceOfferKey: "expired",
      explicitValidityEnd: {
        kind: "INSTANT",
        value: "2026-09-10T06:00:00.000Z",
      },
    });
    expect(expired.ok).toBe(true);
    if (expired.ok) {
      expect(await catalog.getVisibleOffer(expired.value.id)).toEqual({
        ok: false,
        issues: [
          {
            code: "OFFER_NOT_FOUND",
            path: "id",
            message: "Offer not found",
          },
        ],
      });
    }
  });

  it("withdraws once and does not reactivate on republication", async () => {
    const repository = new PostgresOfferRepository(pool);
    const published = await buildOfferLifecycleCatalog(repository, {
      clock: () => new Date("2026-09-01T06:00:00.000Z"),
      idGenerator: () => "39996919-3f2a-4ff2-a7de-922477c475cb",
    }).publishOffer(textOnlyOffer);
    expect(published.ok).toBe(true);

    const firstWithdrawal = await buildOfferLifecycleCatalog(repository, {
      clock: () => new Date("2026-09-02T06:00:00.000Z"),
    }).withdrawOffer({
      sourceId: "daraz-nepal",
      sourceOfferKey: "dashain-sale-2026",
    });
    const repeatedWithdrawal = await buildOfferLifecycleCatalog(repository, {
      clock: () => new Date("2026-09-03T06:00:00.000Z"),
    }).withdrawOffer({
      sourceId: "daraz-nepal",
      sourceOfferKey: "dashain-sale-2026",
    });

    expect(firstWithdrawal.ok).toBe(true);
    expect(repeatedWithdrawal.ok).toBe(true);
    if (firstWithdrawal.ok && repeatedWithdrawal.ok) {
      expect(firstWithdrawal.value.withdrawnAt).toBe("2026-09-02T06:00:00.000Z");
      expect(repeatedWithdrawal.value.withdrawnAt).toBe(firstWithdrawal.value.withdrawnAt);
    }

    const laterCatalog = buildOfferLifecycleCatalog(repository, {
      clock: () => new Date("2026-09-04T06:00:00.000Z"),
      idGenerator: () => "894e9f64-c224-4265-ad8f-107181e78e31",
    });
    const republished = await laterCatalog.publishOffer({
      ...textOnlyOffer,
      title: "Rediscovered title",
    });
    expect(republished.ok).toBe(true);
    if (republished.ok && published.ok) {
      expect(republished.value.id).toBe(published.value.id);
      expect(republished.value.lifecycleStatus).toBe("WITHDRAWN");
      expect(await laterCatalog.getVisibleOffer(published.value.id)).toEqual({
        ok: false,
        issues: [
          {
            code: "OFFER_NOT_FOUND",
            path: "id",
            message: "Offer not found",
          },
        ],
      });
    }
  });

  it("returns the same not-found result for missing and hidden offers", async () => {
    const catalog = buildOfferLifecycleCatalog(new PostgresOfferRepository(pool), {
      clock: () => new Date("2026-09-10T06:00:00.000Z"),
    });

    await expect(catalog.getVisibleOffer("fc2f6774-a26b-41da-bf3a-5e7be25c1b69")).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: "OFFER_NOT_FOUND",
          path: "id",
          message: "Offer not found",
        },
      ],
    });
  });
});
