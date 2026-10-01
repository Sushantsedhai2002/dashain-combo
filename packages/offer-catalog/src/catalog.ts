import { randomUUID } from "node:crypto";

import type {
  CatalogIssue,
  CatalogResult,
  Offer,
  OfferCatalog,
  OfferPage,
  PublishOfferInput,
  SearchOffersQuery,
  WithdrawOfferInput,
} from "./contract.ts";
import { decodeCursor, encodeCursor, queryFingerprint, type OfferCursorKeyset } from "./cursor.ts";
import { calculateExpiry } from "./lifecycle.ts";
import { CatalogStorageError } from "./postgres/errors.ts";
import {
  parseOfferId,
  parsePublishOfferInput,
  parseSearchOffersQuery,
  parseWithdrawOfferInput,
  type NormalizedPublishOfferInput,
  type NormalizedSearchOffersQuery,
  type NormalizedWithdrawOfferInput,
} from "./schema.ts";

export type PublishCommand = Readonly<{
  id: string;
  offer: NormalizedPublishOfferInput;
  discoveredAt: Date;
  expiresAt: Date;
}>;

export interface CatalogRepository {
  publish(command: PublishCommand): Promise<Offer>;
}

export interface LifecycleCatalogRepository extends CatalogRepository {
  withdraw(input: NormalizedWithdrawOfferInput, withdrawnAt: Date): Promise<Offer | null>;
  findVisibleById(id: string, now: Date): Promise<Offer | null>;
}

export type SearchCommand = Readonly<{
  query: NormalizedSearchOffersQuery;
  keyset: OfferCursorKeyset | null;
}>;

export interface SearchCatalogRepository extends LifecycleCatalogRepository {
  search(command: SearchCommand, now: Date): Promise<readonly Offer[]>;
}

type PublisherOptions = Readonly<{
  clock?: () => Date;
  idGenerator?: () => string;
}>;

export type OfferPublisher = Readonly<{
  publishOffer(input: PublishOfferInput): Promise<CatalogResult<Offer>>;
}>;

export type OfferLifecycleCatalog = OfferPublisher &
  Readonly<{
    withdrawOffer(input: WithdrawOfferInput): Promise<CatalogResult<Offer>>;
    getVisibleOffer(id: string): Promise<CatalogResult<Offer>>;
  }>;

function notFound(path: string): CatalogResult<Offer> {
  const issue: CatalogIssue = Object.freeze({
    code: "OFFER_NOT_FOUND",
    path,
    message: "Offer not found",
  });
  return Object.freeze({ ok: false, issues: Object.freeze([issue]) });
}

async function sanitizeStorage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CatalogStorageError) throw error;
    throw new CatalogStorageError();
  }
}

function publisherMethod(
  repository: CatalogRepository,
  clock: () => Date,
  idGenerator: () => string,
): OfferPublisher["publishOffer"] {
  return async (input) => {
    const parsed = parsePublishOfferInput(input);
    if (!parsed.ok) return parsed;

    const discoveredAt = new Date(clock().getTime());
    if (
      parsed.value.discovery &&
      Date.parse(parsed.value.discovery.lastVerifiedAt) > discoveredAt.getTime() + 60000
    )
      return {
        ok: false,
        issues: [
          {
            code: "INVALID_INPUT",
            path: "discovery.lastVerifiedAt",
            message: "Verification time cannot be in the future",
          },
        ],
      };
    const expiresAt = calculateExpiry({
      explicitValidityEnd: parsed.value.explicitValidityEnd,
      sourcePublishedAt: parsed.value.sourcePublishedAt,
      firstDiscoveredAt: discoveredAt,
    });
    const command = Object.freeze({
      id: idGenerator(),
      offer: parsed.value,
      discoveredAt,
      expiresAt,
    });

    const value = await sanitizeStorage(() => repository.publish(command));
    return Object.freeze({ ok: true, value });
  };
}

function cursorKeyset(offer: Offer, query: NormalizedSearchOffersQuery): OfferCursorKeyset {
  switch (query.sort) {
    case "RELEVANCE":
      return { sort: "RELEVANCE", relevance: offer.relevance ?? 0, id: offer.id };
    case "NEWEST":
      return Object.freeze({
        sort: query.sort,
        firstDiscoveredAt: offer.firstDiscoveredAt,
        id: offer.id,
      });
    case "EXPIRING_SOON":
      return Object.freeze({
        sort: query.sort,
        expiresAt: offer.expiresAt,
        id: offer.id,
      });
    case "DISCOUNT_DESC":
      return Object.freeze({
        sort: query.sort,
        discountPercent: offer.discountPercent,
        id: offer.id,
      });
    case "PRICE_ASC":
    case "PRICE_DESC": {
      if (query.currency === null) throw new CatalogStorageError();
      const price = offer.salePrice ?? offer.originalPrice;
      return Object.freeze({
        sort: query.sort,
        currency: query.currency,
        amountMinor: price?.amountMinor ?? null,
        id: offer.id,
      });
    }
  }
}

export function buildOfferPublisher(
  repository: CatalogRepository,
  options: PublisherOptions = {},
): OfferPublisher {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;

  return Object.freeze({
    publishOffer: publisherMethod(repository, clock, idGenerator),
  });
}

export function buildOfferLifecycleCatalog(
  repository: LifecycleCatalogRepository,
  options: PublisherOptions = {},
): OfferLifecycleCatalog {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;

  return Object.freeze({
    publishOffer: publisherMethod(repository, clock, idGenerator),

    async withdrawOffer(input: WithdrawOfferInput): Promise<CatalogResult<Offer>> {
      const parsed = parseWithdrawOfferInput(input);
      if (!parsed.ok) return parsed;

      const withdrawnAt = new Date(clock().getTime());
      const offer = await sanitizeStorage(() => repository.withdraw(parsed.value, withdrawnAt));
      return offer === null
        ? notFound("sourceOfferKey")
        : Object.freeze({ ok: true, value: offer });
    },

    async getVisibleOffer(id: string): Promise<CatalogResult<Offer>> {
      const parsed = parseOfferId(id);
      if (!parsed.ok) return parsed;

      const now = new Date(clock().getTime());
      const offer = await sanitizeStorage(() => repository.findVisibleById(parsed.value, now));
      return offer === null ? notFound("id") : Object.freeze({ ok: true, value: offer });
    },
  });
}

export function buildOfferCatalog(
  repository: SearchCatalogRepository,
  options: PublisherOptions = {},
): OfferCatalog {
  const lifecycleCatalog = buildOfferLifecycleCatalog(repository, options);
  const clock = options.clock ?? (() => new Date());

  return Object.freeze({
    ...lifecycleCatalog,

    async searchVisibleOffers(input: SearchOffersQuery): Promise<CatalogResult<OfferPage>> {
      const parsed = parseSearchOffersQuery(input);
      if (!parsed.ok) return parsed;

      let keyset: OfferCursorKeyset | null = null;
      if (parsed.value.cursor !== null) {
        const decoded = decodeCursor(
          parsed.value.cursor,
          parsed.value.sort,
          parsed.value.currency ?? undefined,
          queryFingerprint(parsed.value),
        );
        if (!decoded.ok) return decoded;
        keyset = decoded.value;
      }

      const now = new Date(clock().getTime());
      const offers = await sanitizeStorage(() =>
        repository.search(Object.freeze({ query: parsed.value, keyset }), now),
      );
      const hasNextPage = offers.length > parsed.value.limit;
      const items = Object.freeze(offers.slice(0, parsed.value.limit));
      const lastItem = items.at(-1);
      const nextCursor =
        hasNextPage && lastItem !== undefined
          ? encodeCursor(cursorKeyset(lastItem, parsed.value), queryFingerprint(parsed.value))
          : null;

      return Object.freeze({
        ok: true,
        value: Object.freeze({ items, nextCursor }),
      });
    },
  });
}
