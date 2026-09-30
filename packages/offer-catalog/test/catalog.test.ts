import { describe, expect, it } from "vitest";

import {
  buildOfferCatalog,
  buildOfferLifecycleCatalog,
  buildOfferPublisher,
  type CatalogRepository,
  type LifecycleCatalogRepository,
  type PublishCommand,
  type SearchCatalogRepository,
  type SearchCommand,
} from "../src/catalog.ts";
import type { Offer } from "../src/contract.ts";
import { CatalogStorageError } from "../src/postgres/errors.ts";
import { textOnlyOffer } from "./fixtures/offers.ts";

const now = new Date("2026-09-01T06:00:00.000Z");

function offerFromCommand(command: PublishCommand): Offer {
  return Object.freeze({
    id: command.id,
    sourceId: command.offer.source.id,
    sourceOfferKey: command.offer.sourceOfferKey,
    sellerDisplayName: command.offer.source.displayName,
    title: command.offer.title,
    summary: command.offer.summary,
    productName: command.offer.productName,
    brandName: command.offer.brandName,
    category: command.offer.category,
    imageUrl: command.offer.imageUrl,
    destinationUrl: command.offer.destinationUrl,
    originalPrice: command.offer.originalPrice,
    salePrice: command.offer.salePrice,
    discountPercent: command.offer.discountPercent,
    discountLabel: command.offer.discountLabel,
    terms: command.offer.terms,
    sourcePublishedAt: command.offer.sourcePublishedAt,
    validityStartsAt: command.offer.validityStartsAt,
    explicitValidityEnd: command.offer.explicitValidityEnd,
    firstDiscoveredAt: command.discoveredAt.toISOString(),
    expiresAt: command.expiresAt.toISOString(),
    withdrawnAt: null,
    lifecycleStatus: "ACTIVE",
    createdAt: command.discoveredAt.toISOString(),
    updatedAt: command.discoveredAt.toISOString(),
  });
}

class FakeRepository implements CatalogRepository {
  readonly commands: PublishCommand[] = [];

  async publish(command: PublishCommand): Promise<Offer> {
    this.commands.push(command);
    return offerFromCommand(command);
  }
}

class FakeSearchRepository extends FakeRepository implements SearchCatalogRepository {
  searchResults: readonly Offer[] = [];
  readonly searches: SearchCommand[] = [];

  async withdraw(): Promise<Offer | null> {
    return null;
  }

  async findVisibleById(): Promise<Offer | null> {
    return null;
  }

  async search(command: SearchCommand): Promise<readonly Offer[]> {
    this.searches.push(command);
    return this.searchResults;
  }
}

describe("offer lifecycle catalog", () => {
  it("returns structured not-found failures from lifecycle operations", async () => {
    const repository: LifecycleCatalogRepository = {
      publish: async (command) => offerFromCommand(command),
      withdraw: async () => null,
      findVisibleById: async () => null,
    };
    const catalog = buildOfferLifecycleCatalog(repository, {
      clock: () => now,
    });

    await expect(
      catalog.withdrawOffer({
        sourceId: "daraz-nepal",
        sourceOfferKey: "missing",
      }),
    ).resolves.toEqual({
      ok: false,
      issues: [
        {
          code: "OFFER_NOT_FOUND",
          path: "sourceOfferKey",
          message: "Offer not found",
        },
      ],
    });
    await expect(catalog.getVisibleOffer("550e8400-e29b-41d4-a716-446655440000")).resolves.toEqual({
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

  it("rejects malformed lookup IDs before storage", async () => {
    let lookupCount = 0;
    const repository: LifecycleCatalogRepository = {
      publish: async (command) => offerFromCommand(command),
      withdraw: async () => null,
      findVisibleById: async () => {
        lookupCount += 1;
        return null;
      },
    };
    const catalog = buildOfferLifecycleCatalog(repository, {
      clock: () => now,
    });

    const result = await catalog.getVisibleOffer("not-a-uuid");

    expect(result.ok).toBe(false);
    expect(lookupCount).toBe(0);
  });
});

describe("offer search orchestration", () => {
  it.each([
    { sort: "NEWEST" as const },
    { sort: "EXPIRING_SOON" as const },
    { sort: "DISCOUNT_DESC" as const },
    { sort: "PRICE_ASC" as const, currency: "NPR" },
    { sort: "PRICE_DESC" as const, currency: "NPR" },
  ])("creates a continuation cursor for $sort", async (query) => {
    const repository = new FakeSearchRepository();
    const catalog = buildOfferCatalog(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    const published = await catalog.publishOffer({
      ...textOnlyOffer,
      salePrice: { currency: "NPR", amountMinor: 80_000 },
      discountPercent: 20,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    repository.searchResults = [
      published.value,
      {
        ...published.value,
        id: "40df2a87-7d4f-4479-b140-61c78a536ab9",
      },
    ];
    const page = await catalog.searchVisibleOffers({
      ...query,
      limit: 1,
    });

    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.value.items).toHaveLength(1);
      expect(page.value.nextCursor).not.toBeNull();
    }
  });

  it("decodes a continuation cursor before searching", async () => {
    const repository = new FakeSearchRepository();
    const catalog = buildOfferCatalog(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });
    const published = await catalog.publishOffer(textOnlyOffer);
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    repository.searchResults = [
      published.value,
      {
        ...published.value,
        id: "40df2a87-7d4f-4479-b140-61c78a536ab9",
      },
    ];
    const first = await catalog.searchVisibleOffers({ limit: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok || first.value.nextCursor === null) return;

    repository.searchResults = [];
    const second = await catalog.searchVisibleOffers({
      limit: 1,
      cursor: first.value.nextCursor,
    });

    expect(second.ok).toBe(true);
    expect(repository.searches[1]?.keyset).toEqual({
      sort: "NEWEST",
      firstDiscoveredAt: published.value.firstDiscoveredAt,
      id: published.value.id,
    });
  });

  it("rejects an invalid cursor before searching", async () => {
    const repository = new FakeSearchRepository();
    const catalog = buildOfferCatalog(repository, { clock: () => now });

    const result = await catalog.searchVisibleOffers({ cursor: "invalid*" });

    expect(result.ok).toBe(false);
    expect(repository.searches).toEqual([]);
  });
});

describe("offer publisher", () => {
  it("publishes a text-only offer with discovery fallback expiry", async () => {
    const repository = new FakeRepository();
    const publisher = buildOfferPublisher(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });

    const result = await publisher.publishOffer(textOnlyOffer);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(
        expect.objectContaining({
          sourceId: "daraz-nepal",
          sellerDisplayName: "Daraz Nepal",
          originalPrice: null,
          salePrice: null,
          firstDiscoveredAt: "2026-09-01T06:00:00.000Z",
          expiresAt: "2026-09-21T06:00:00.000Z",
        }),
      );
    }
    expect(repository.commands).toHaveLength(1);
  });

  it("does not access storage for invalid input", async () => {
    const repository = new FakeRepository();
    const publisher = buildOfferPublisher(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });

    const result = await publisher.publishOffer({
      ...textOnlyOffer,
      destinationUrl: "http://example.com/offer",
    });

    expect(result.ok).toBe(false);
    expect(repository.commands).toEqual([]);
  });

  it("rethrows storage failures without PostgreSQL details", async () => {
    const driverError = Object.assign(new Error("password=database-secret"), {
      code: "08006",
      query: "SELECT * FROM offers",
      connectionString: "postgresql://user:database-secret@localhost/catalog",
    });
    const repository: CatalogRepository = {
      publish: async () => {
        throw driverError;
      },
    };
    const publisher = buildOfferPublisher(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });

    await expect(publisher.publishOffer(textOnlyOffer)).rejects.toEqual(new CatalogStorageError());
  });
});
