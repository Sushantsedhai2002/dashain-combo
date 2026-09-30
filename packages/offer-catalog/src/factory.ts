import pg from "pg";

import { buildOfferCatalog } from "./catalog.ts";
import type { OfferCatalog } from "./contract.ts";
import { PostgresOfferRepository } from "./postgres/offer-repository.ts";

export type CreateOfferCatalogOptions = Readonly<{
  databaseUrl: string;
}>;

export function createOfferCatalog(options: CreateOfferCatalogOptions): OfferCatalog {
  const pool = new pg.Pool({
    connectionString: options.databaseUrl,
    allowExitOnIdle: true,
  });
  return buildOfferCatalog(new PostgresOfferRepository(pool));
}
