import {
  OFFER_TYPES,
  parseBudgetIntent,
  type OfferType,
  type OfferCategory,
  type OfferSort,
  type SearchOffersQuery,
} from "@dashain-offer/offer-catalog";

export type SourceOption = Readonly<{ id: string; displayName: string }>;
export const CATEGORIES: Readonly<Record<OfferCategory, string>> = Object.freeze({
  GENERAL_RETAIL: "Everyday shopping",
  MOBILE_AND_TABLETS: "Phones & tablets",
  COMPUTERS_AND_ACCESSORIES: "Computers & accessories",
  CONSUMER_ELECTRONICS: "Electronics",
  HOME_APPLIANCES: "Home appliances",
  HOME_AND_FURNITURE: "Home & furniture",
  FASHION_AND_LIFESTYLE: "Fashion & lifestyle",
  AUTOMOTIVE: "Automotive",
  TRAVEL: "Travel",
  FOOD_AND_DELIVERY: "Food & delivery",
  PAYMENTS_AND_FINANCE: "Payments & finance",
  OTHER: "More offers",
});
export const SORTS: Readonly<Record<OfferSort, string>> = Object.freeze({
  RELEVANCE: "Most relevant",
  NEWEST: "Newest first",
  EXPIRING_SOON: "Ending soon",
  DISCOUNT_DESC: "Biggest discount",
  PRICE_ASC: "Price: low to high (NPR)",
  PRICE_DESC: "Price: high to low (NPR)",
});
function category(value: string): value is OfferCategory {
  return Object.hasOwn(CATEGORIES, value);
}
function sort(value: string): value is OfferSort {
  return Object.hasOwn(SORTS, value);
}

export function parseDiscoveryQuery(
  params: URLSearchParams,
  sources: readonly SourceOption[],
): Readonly<{ ok: true; query: SearchOffersQuery }> | Readonly<{ ok: false }> {
  if (
    [...params.keys()].some(
      (key) =>
        ![
          "q",
          "category",
          "source",
          "sort",
          "cursor",
          "scope",
          "brand",
          "type",
          "min",
          "max",
          "stock",
        ].includes(key),
    ) ||
    ["q", "sort", "cursor", "scope", "min", "max", "stock"].some(
      (key) => params.getAll(key).length > 1,
    )
  )
    return { ok: false };
  const text = params.get("q")?.trim() || null;
  const categories = [...new Set(params.getAll("category"))];
  const sourceIds = [...new Set(params.getAll("source"))];
  const intent = parseBudgetIntent(text ?? "");
  const selectedSort = params.get("sort") || (intent.text ? "RELEVANCE" : "NEWEST");
  const scope = params.get("scope") || "ALL";
  const budget = (key: string): number | undefined => {
    const value = params.get(key);
    return value === null || value === ""
      ? undefined
      : /^\d+(?:\.\d{1,2})?$/.test(value)
        ? Math.round(Number(value) * 100)
        : NaN;
  };
  const minPriceMinor = budget("min");
  const maxPriceMinor = budget("max") ?? intent.maxPriceMinor ?? undefined;
  const offerTypes = params.getAll("type") as OfferType[];
  if (
    !["ALL", "DASHAIN", "DASHAIN_OFFERS"].includes(scope) ||
    !offerTypes.every((type) => OFFER_TYPES.includes(type)) ||
    [minPriceMinor, maxPriceMinor].some(
      (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
    ) ||
    (minPriceMinor !== undefined && maxPriceMinor !== undefined && minPriceMinor > maxPriceMinor) ||
    (params.has("stock") && params.get("stock") !== "IN_STOCK")
  )
    return { ok: false };
  const cursor = params.get("cursor") || null;
  if (
    (text?.length ?? 0) > 200 ||
    (cursor?.length ?? 0) > 4096 ||
    !sort(selectedSort) ||
    !categories.every(category) ||
    sourceIds.some((id) => !sources.some((source) => source.id === id))
  )
    return { ok: false };
  return {
    ok: true,
    query: {
      text: intent.text || null,
      scope: scope as "ALL" | "DASHAIN" | "DASHAIN_OFFERS",
      brands: params.getAll("brand").filter(Boolean),
      offerTypes,
      ...(minPriceMinor !== undefined ? { minPriceMinor } : {}),
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
      ...(params.get("stock") === "IN_STOCK" ? { availability: "IN_STOCK" as const } : {}),
      categories,
      sourceIds,
      sort: selectedSort,
      limit: 24,
      cursor,
      ...(selectedSort.startsWith("PRICE_") ||
      minPriceMinor !== undefined ||
      maxPriceMinor !== undefined
        ? { currency: "NPR" }
        : {}),
    },
  };
}
