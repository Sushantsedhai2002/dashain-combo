import { describe, expect, it } from "vitest";

import {
  buildOfferLifecycleCatalog,
  buildOfferPublisher,
  type CatalogRepository,
  type LifecycleCatalogRepository,
  type PublishCommand,
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

  it("rethrows storage failures without the underlying message", async () => {
    const repository: CatalogRepository = {
      publish: async () => {
        throw new Error("password=database-secret");
      },
    };
    const publisher = buildOfferPublisher(repository, {
      clock: () => now,
      idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
    });

    await expect(publisher.publishOffer(textOnlyOffer)).rejects.toEqual(new CatalogStorageError());
  });
});
