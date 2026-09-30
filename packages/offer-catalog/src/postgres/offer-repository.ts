import type { Pool } from "pg";

import type { PublishCommand, SearchCatalogRepository, SearchCommand } from "../catalog.ts";
import type { Money, Offer, SourceTime } from "../contract.ts";
import type { NormalizedWithdrawOfferInput } from "../schema.ts";
import { CatalogStorageError } from "./errors.ts";
import { rowToOffer, type OfferRow } from "./row-mapper.ts";

const RETURNING_COLUMNS = `
  id,
  source_id,
  source_offer_key,
  seller_display_name,
  title,
  summary,
  product_name,
  brand_name,
  category,
  image_url,
  destination_url,
  original_currency,
  original_amount_minor,
  sale_currency,
  sale_amount_minor,
  discount_percent,
  discount_label,
  terms,
  source_published_kind,
  source_published_at,
  source_published_date::text AS source_published_date,
  validity_starts_at,
  explicit_validity_end_kind,
  explicit_validity_end_at,
  explicit_validity_end_date::text AS explicit_validity_end_date,
  first_discovered_at,
  expires_at,
  withdrawn_at,
  created_at,
  updated_at
`;

function timeKind(value: SourceTime | null): SourceTime["kind"] | null {
  return value?.kind ?? null;
}

function instantValue(value: SourceTime | null): string | null {
  return value?.kind === "INSTANT" ? value.value : null;
}

function dateValue(value: SourceTime | null): string | null {
  return value?.kind === "KATHMANDU_DATE" ? value.value : null;
}

function currency(value: Money | null): string | null {
  return value?.currency ?? null;
}

function amount(value: Money | null): number | null {
  return value?.amountMinor ?? null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type SearchSql = Readonly<{
  text: string;
  values: unknown[];
}>;

function buildSearchSql(command: SearchCommand, now: Date): SearchSql {
  const values: unknown[] = [];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  const clauses = [
    "withdrawn_at IS NULL",
    `(validity_starts_at IS NULL OR validity_starts_at <= ${parameter(now)})`,
    `expires_at > ${parameter(now)}`,
  ];
  const query = command.query;

  if (query.text !== null) {
    const pattern = parameter(`%${escapeLikePattern(query.text)}%`);
    clauses.push(`(
      title ILIKE ${pattern} ESCAPE E'\\\\'
      OR seller_display_name ILIKE ${pattern} ESCAPE E'\\\\'
      OR category ILIKE ${pattern} ESCAPE E'\\\\'
      OR COALESCE(product_name, '') ILIKE ${pattern} ESCAPE E'\\\\'
      OR COALESCE(brand_name, '') ILIKE ${pattern} ESCAPE E'\\\\'
    )`);
  }

  if (query.categories.length > 0) {
    clauses.push(`category = ANY(${parameter([...query.categories])}::text[])`);
  }
  if (query.sourceIds.length > 0) {
    clauses.push(`source_id = ANY(${parameter([...query.sourceIds])}::text[])`);
  }

  const effectivePrice = "COALESCE(sale_amount_minor, original_amount_minor)";
  if (query.currency !== null) {
    clauses.push(`COALESCE(sale_currency, original_currency) = ${parameter(query.currency)}`);
  }

  let orderBy: string;
  const keyset = command.keyset;
  switch (query.sort) {
    case "NEWEST":
      orderBy = "first_discovered_at DESC, id DESC";
      if (keyset !== null) {
        if (keyset.sort !== "NEWEST") throw new CatalogStorageError();
        clauses.push(
          `(first_discovered_at, id) < (${parameter(keyset.firstDiscoveredAt)}, ${parameter(keyset.id)})`,
        );
      }
      break;
    case "EXPIRING_SOON":
      orderBy = "expires_at ASC, id ASC";
      if (keyset !== null) {
        if (keyset.sort !== "EXPIRING_SOON") throw new CatalogStorageError();
        clauses.push(
          `(expires_at, id) > (${parameter(keyset.expiresAt)}, ${parameter(keyset.id)})`,
        );
      }
      break;
    case "DISCOUNT_DESC":
      orderBy = "discount_percent DESC NULLS LAST, id DESC";
      if (keyset !== null) {
        if (keyset.sort !== "DISCOUNT_DESC") throw new CatalogStorageError();
        if (keyset.discountPercent === null) {
          clauses.push(`(discount_percent IS NULL AND id < ${parameter(keyset.id)})`);
        } else {
          const discount = parameter(keyset.discountPercent);
          const id = parameter(keyset.id);
          clauses.push(`(
            discount_percent IS NULL
            OR discount_percent < ${discount}
            OR (discount_percent = ${discount} AND id < ${id})
          )`);
        }
      }
      break;
    case "PRICE_ASC":
      orderBy = `${effectivePrice} ASC NULLS LAST, id ASC`;
      if (keyset !== null) {
        if (keyset.sort !== "PRICE_ASC") throw new CatalogStorageError();
        if (keyset.amountMinor === null) {
          clauses.push(`(${effectivePrice} IS NULL AND id > ${parameter(keyset.id)})`);
        } else {
          const price = parameter(keyset.amountMinor);
          const id = parameter(keyset.id);
          clauses.push(`(
            ${effectivePrice} IS NULL
            OR ${effectivePrice} > ${price}
            OR (${effectivePrice} = ${price} AND id > ${id})
          )`);
        }
      }
      break;
    case "PRICE_DESC":
      orderBy = `${effectivePrice} DESC NULLS LAST, id DESC`;
      if (keyset !== null) {
        if (keyset.sort !== "PRICE_DESC") throw new CatalogStorageError();
        if (keyset.amountMinor === null) {
          clauses.push(`(${effectivePrice} IS NULL AND id < ${parameter(keyset.id)})`);
        } else {
          const price = parameter(keyset.amountMinor);
          const id = parameter(keyset.id);
          clauses.push(`(
            ${effectivePrice} IS NULL
            OR ${effectivePrice} < ${price}
            OR (${effectivePrice} = ${price} AND id < ${id})
          )`);
        }
      }
      break;
  }

  const limit = parameter(query.limit + 1);
  return Object.freeze({
    text: `
      SELECT ${RETURNING_COLUMNS}
      FROM offers
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `,
    values,
  });
}

export class PostgresOfferRepository implements SearchCatalogRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async publish(command: PublishCommand): Promise<Offer> {
    const offer = command.offer;
    const now = command.discoveredAt;
    const values = [
      command.id,
      offer.source.id,
      offer.sourceOfferKey,
      offer.source.displayName,
      offer.title,
      offer.summary,
      offer.productName,
      offer.brandName,
      offer.category,
      offer.imageUrl,
      offer.destinationUrl,
      currency(offer.originalPrice),
      amount(offer.originalPrice),
      currency(offer.salePrice),
      amount(offer.salePrice),
      offer.discountPercent,
      offer.discountLabel,
      offer.terms,
      timeKind(offer.sourcePublishedAt),
      instantValue(offer.sourcePublishedAt),
      dateValue(offer.sourcePublishedAt),
      offer.validityStartsAt,
      timeKind(offer.explicitValidityEnd),
      instantValue(offer.explicitValidityEnd),
      dateValue(offer.explicitValidityEnd),
      command.discoveredAt,
      command.expiresAt,
      now,
      now,
    ];

    try {
      const result = await this.#pool.query<OfferRow>(
        `
          INSERT INTO offers (
            id,
            source_id,
            source_offer_key,
            seller_display_name,
            title,
            summary,
            product_name,
            brand_name,
            category,
            image_url,
            destination_url,
            original_currency,
            original_amount_minor,
            sale_currency,
            sale_amount_minor,
            discount_percent,
            discount_label,
            terms,
            source_published_kind,
            source_published_at,
            source_published_date,
            validity_starts_at,
            explicit_validity_end_kind,
            explicit_validity_end_at,
            explicit_validity_end_date,
            first_discovered_at,
            expires_at,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29
          )
          ON CONFLICT (source_id, source_offer_key) DO UPDATE SET
            seller_display_name = EXCLUDED.seller_display_name,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            product_name = EXCLUDED.product_name,
            brand_name = EXCLUDED.brand_name,
            category = EXCLUDED.category,
            image_url = EXCLUDED.image_url,
            destination_url = EXCLUDED.destination_url,
            original_currency = EXCLUDED.original_currency,
            original_amount_minor = EXCLUDED.original_amount_minor,
            sale_currency = EXCLUDED.sale_currency,
            sale_amount_minor = EXCLUDED.sale_amount_minor,
            discount_percent = EXCLUDED.discount_percent,
            discount_label = EXCLUDED.discount_label,
            terms = EXCLUDED.terms,
            source_published_kind = EXCLUDED.source_published_kind,
            source_published_at = EXCLUDED.source_published_at,
            source_published_date = EXCLUDED.source_published_date,
            validity_starts_at = EXCLUDED.validity_starts_at,
            explicit_validity_end_kind = EXCLUDED.explicit_validity_end_kind,
            explicit_validity_end_at = EXCLUDED.explicit_validity_end_at,
            explicit_validity_end_date = EXCLUDED.explicit_validity_end_date,
            expires_at = CASE
              WHEN EXCLUDED.explicit_validity_end_kind IS NULL
                AND EXCLUDED.source_published_kind IS NULL
              THEN offers.first_discovered_at + INTERVAL '20 days'
              ELSE EXCLUDED.expires_at
            END,
            updated_at = EXCLUDED.updated_at
          RETURNING ${RETURNING_COLUMNS}
        `,
        values,
      );

      const row = result.rows[0];
      if (row === undefined) throw new CatalogStorageError();
      return rowToOffer(row, now);
    } catch (error) {
      if (error instanceof CatalogStorageError) throw error;
      throw new CatalogStorageError();
    }
  }

  async withdraw(input: NormalizedWithdrawOfferInput, withdrawnAt: Date): Promise<Offer | null> {
    try {
      const result = await this.#pool.query<OfferRow>(
        `
          UPDATE offers
          SET
            withdrawn_at = COALESCE(withdrawn_at, $3),
            updated_at = CASE
              WHEN withdrawn_at IS NULL THEN $3
              ELSE updated_at
            END
          WHERE source_id = $1 AND source_offer_key = $2
          RETURNING ${RETURNING_COLUMNS}
        `,
        [input.sourceId, input.sourceOfferKey, withdrawnAt],
      );

      const row = result.rows[0];
      return row === undefined ? null : rowToOffer(row, withdrawnAt);
    } catch (error) {
      if (error instanceof CatalogStorageError) throw error;
      throw new CatalogStorageError();
    }
  }

  async findVisibleById(id: string, now: Date): Promise<Offer | null> {
    try {
      const result = await this.#pool.query<OfferRow>(
        `
          SELECT ${RETURNING_COLUMNS}
          FROM offers
          WHERE id = $1
            AND withdrawn_at IS NULL
            AND (validity_starts_at IS NULL OR validity_starts_at <= $2)
            AND expires_at > $2
        `,
        [id, now],
      );

      const row = result.rows[0];
      return row === undefined ? null : rowToOffer(row, now);
    } catch (error) {
      if (error instanceof CatalogStorageError) throw error;
      throw new CatalogStorageError();
    }
  }

  async search(command: SearchCommand, now: Date): Promise<readonly Offer[]> {
    try {
      const query = buildSearchSql(command, now);
      const result = await this.#pool.query<OfferRow>(query.text, query.values);
      return Object.freeze(result.rows.map((row) => rowToOffer(row, now)));
    } catch (error) {
      if (error instanceof CatalogStorageError) throw error;
      throw new CatalogStorageError();
    }
  }
}
