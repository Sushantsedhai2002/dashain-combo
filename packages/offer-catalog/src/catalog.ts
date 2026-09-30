import { randomUUID } from "node:crypto";

import type {
  CatalogIssue,
  CatalogResult,
  Offer,
  PublishOfferInput,
  WithdrawOfferInput,
} from "./contract.ts";
import { calculateExpiry } from "./lifecycle.ts";
import { CatalogStorageError } from "./postgres/errors.ts";
import {
  parseOfferId,
  parsePublishOfferInput,
  parseWithdrawOfferInput,
  type NormalizedPublishOfferInput,
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
