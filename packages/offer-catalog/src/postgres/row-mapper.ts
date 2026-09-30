import type { Money, Offer, OfferCategory, SourceTime } from "../contract.ts";
import { deriveLifecycleStatus } from "../lifecycle.ts";
import { CatalogStorageError } from "./errors.ts";

export type OfferRow = Readonly<{
  id: string;
  source_id: string;
  source_offer_key: string;
  seller_display_name: string;
  title: string;
  summary: string | null;
  product_name: string | null;
  brand_name: string | null;
  category: OfferCategory;
  image_url: string | null;
  destination_url: string;
  original_currency: string | null;
  original_amount_minor: string | null;
  sale_currency: string | null;
  sale_amount_minor: string | null;
  discount_percent: number | null;
  discount_label: string | null;
  terms: string | null;
  source_published_kind: "INSTANT" | "KATHMANDU_DATE" | null;
  source_published_at: Date | null;
  source_published_date: string | null;
  validity_starts_at: Date | null;
  explicit_validity_end_kind: "INSTANT" | "KATHMANDU_DATE" | null;
  explicit_validity_end_at: Date | null;
  explicit_validity_end_date: string | null;
  first_discovered_at: Date;
  expires_at: Date;
  withdrawn_at: Date | null;
  created_at: Date;
  updated_at: Date;
}>;

function money(currency: string | null, value: string | null): Money | null {
  if (currency === null && value === null) return null;
  if (currency === null || value === null) throw new CatalogStorageError();

  const amountMinor = Number(value);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new CatalogStorageError();
  }

  return Object.freeze({ currency, amountMinor });
}

function sourceTime(
  kind: "INSTANT" | "KATHMANDU_DATE" | null,
  instantValue: Date | null,
  dateValue: string | null,
): SourceTime | null {
  if (kind === null && instantValue === null && dateValue === null) return null;

  if (kind === "INSTANT" && instantValue !== null && dateValue === null) {
    return Object.freeze({ kind, value: instantValue.toISOString() });
  }

  if (kind === "KATHMANDU_DATE" && instantValue === null && dateValue !== null) {
    return Object.freeze({ kind, value: dateValue });
  }

  throw new CatalogStorageError();
}

export function rowToOffer(row: OfferRow, now: Date): Offer {
  const expiresAt = row.expires_at.toISOString();
  const validityStartsAt = row.validity_starts_at?.toISOString() ?? null;
  const withdrawnAt = row.withdrawn_at?.toISOString() ?? null;

  return Object.freeze({
    id: row.id,
    sourceId: row.source_id,
    sourceOfferKey: row.source_offer_key,
    sellerDisplayName: row.seller_display_name,
    title: row.title,
    summary: row.summary,
    productName: row.product_name,
    brandName: row.brand_name,
    category: row.category,
    imageUrl: row.image_url,
    destinationUrl: row.destination_url,
    originalPrice: money(row.original_currency, row.original_amount_minor),
    salePrice: money(row.sale_currency, row.sale_amount_minor),
    discountPercent: row.discount_percent,
    discountLabel: row.discount_label,
    terms: row.terms,
    sourcePublishedAt: sourceTime(
      row.source_published_kind,
      row.source_published_at,
      row.source_published_date,
    ),
    validityStartsAt,
    explicitValidityEnd: sourceTime(
      row.explicit_validity_end_kind,
      row.explicit_validity_end_at,
      row.explicit_validity_end_date,
    ),
    firstDiscoveredAt: row.first_discovered_at.toISOString(),
    expiresAt,
    withdrawnAt,
    lifecycleStatus: deriveLifecycleStatus({
      now,
      validityStartsAt,
      expiresAt,
      withdrawnAt,
    }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
