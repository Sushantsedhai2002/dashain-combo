import type { Pool } from "pg";

import type { CatalogRepository, PublishCommand } from "../catalog.ts";
import type { Money, Offer, SourceTime } from "../contract.ts";
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

export class PostgresOfferRepository implements CatalogRepository {
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
}
