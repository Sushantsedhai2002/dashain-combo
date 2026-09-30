import { randomUUID } from "node:crypto";

import type { CatalogResult, Offer, PublishOfferInput } from "./contract.ts";
import { calculateExpiry } from "./lifecycle.ts";
import { CatalogStorageError } from "./postgres/errors.ts";
import { parsePublishOfferInput, type NormalizedPublishOfferInput } from "./schema.ts";

export type PublishCommand = Readonly<{
  id: string;
  offer: NormalizedPublishOfferInput;
  discoveredAt: Date;
  expiresAt: Date;
}>;

export interface CatalogRepository {
  publish(command: PublishCommand): Promise<Offer>;
}

type PublisherOptions = Readonly<{
  clock?: () => Date;
  idGenerator?: () => string;
}>;

export type OfferPublisher = Readonly<{
  publishOffer(input: PublishOfferInput): Promise<CatalogResult<Offer>>;
}>;

export function buildOfferPublisher(
  repository: CatalogRepository,
  options: PublisherOptions = {},
): OfferPublisher {
  const clock = options.clock ?? (() => new Date());
  const idGenerator = options.idGenerator ?? randomUUID;

  return Object.freeze({
    async publishOffer(input: PublishOfferInput): Promise<CatalogResult<Offer>> {
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

      try {
        const value = await repository.publish(command);
        return Object.freeze({ ok: true, value });
      } catch (error) {
        if (error instanceof CatalogStorageError) throw error;
        throw new CatalogStorageError();
      }
    },
  });
}
