import type { OfferDiscovery, OfferType } from "./discovery.ts";
import type { SourceDefinition } from "@dashain-offer/source-registry";

export const OFFER_CATEGORIES = [
  "GENERAL_RETAIL",
  "MOBILE_AND_TABLETS",
  "COMPUTERS_AND_ACCESSORIES",
  "CONSUMER_ELECTRONICS",
  "HOME_APPLIANCES",
  "FASHION_AND_LIFESTYLE",
  "AUTOMOTIVE",
  "TRAVEL",
  "FOOD_AND_DELIVERY",
  "PAYMENTS_AND_FINANCE",
  "OTHER",
] as const;

export const OFFER_SORTS = [
  "RELEVANCE",
  "NEWEST",
  "EXPIRING_SOON",
  "DISCOUNT_DESC",
  "PRICE_ASC",
  "PRICE_DESC",
] as const;

export type OfferCategory = (typeof OFFER_CATEGORIES)[number];
export type OfferSort = (typeof OFFER_SORTS)[number];
export type OfferLifecycleStatus = "SCHEDULED" | "ACTIVE" | "EXPIRED" | "WITHDRAWN";

export type Money = Readonly<{
  currency: string;
  amountMinor: number;
}>;

export type SourceTime =
  | Readonly<{ kind: "INSTANT"; value: string }>
  | Readonly<{ kind: "KATHMANDU_DATE"; value: string }>;

export type PublishOfferInput = Readonly<{
  discovery?: OfferDiscovery | null;
  source: SourceDefinition;
  sourceOfferKey: string;
  title: string;
  summary?: string | null;
  productName?: string | null;
  brandName?: string | null;
  category: OfferCategory;
  imageUrl?: string | null;
  destinationUrl: string;
  originalPrice?: Money | null;
  salePrice?: Money | null;
  discountPercent?: number | null;
  discountLabel?: string | null;
  terms?: string | null;
  sourcePublishedAt?: SourceTime | null;
  validityStartsAt?: string | null;
  explicitValidityEnd?: SourceTime | null;
}>;

export type WithdrawOfferInput = Readonly<{
  sourceId: string;
  sourceOfferKey: string;
}>;

export type SearchOffersQuery = Readonly<{
  model?: string;
  variant?: string;
  scope?: "ALL" | "DASHAIN";
  season?: number;
  brands?: readonly string[];
  offerTypes?: readonly OfferType[];
  availability?: "IN_STOCK";
  minPriceMinor?: number;
  maxPriceMinor?: number;
  text?: string | null;
  categories?: readonly OfferCategory[];
  sourceIds?: readonly string[];
  currency?: string | null;
  sort?: OfferSort;
  limit?: number;
  cursor?: string | null;
}>;

export type Offer = Readonly<{
  discovery?: OfferDiscovery | null;
  relevance?: number;
  id: string;
  sourceId: string;
  sourceOfferKey: string;
  sellerDisplayName: string;
  title: string;
  summary: string | null;
  productName: string | null;
  brandName: string | null;
  category: OfferCategory;
  imageUrl: string | null;
  destinationUrl: string;
  originalPrice: Money | null;
  salePrice: Money | null;
  discountPercent: number | null;
  discountLabel: string | null;
  terms: string | null;
  sourcePublishedAt: SourceTime | null;
  validityStartsAt: string | null;
  explicitValidityEnd: SourceTime | null;
  firstDiscoveredAt: string;
  expiresAt: string;
  withdrawnAt: string | null;
  lifecycleStatus: OfferLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type OfferPage = Readonly<{
  items: readonly Offer[];
  nextCursor: string | null;
}>;

export type CatalogIssue = Readonly<{
  code: "INVALID_INPUT" | "SOURCE_NOT_ACTIVE" | "OFFER_NOT_FOUND" | "CURSOR_INVALID";
  path: string;
  message: string;
}>;

export type CatalogResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; issues: readonly CatalogIssue[] }>;

export interface OfferCatalog {
  publishOffer(input: PublishOfferInput): Promise<CatalogResult<Offer>>;
  withdrawOffer(input: WithdrawOfferInput): Promise<CatalogResult<Offer>>;
  getVisibleOffer(id: string): Promise<CatalogResult<Offer>>;
  searchVisibleOffers(query: SearchOffersQuery): Promise<CatalogResult<OfferPage>>;
}
