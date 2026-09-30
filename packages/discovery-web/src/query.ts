import type { OfferCategory, OfferSort, SearchOffersQuery } from "@dashain-offer/offer-catalog";

export type SourceOption = Readonly<{ id: string; displayName: string }>;
export const CATEGORIES: Readonly<Record<OfferCategory, string>> = Object.freeze({
  GENERAL_RETAIL: "Everyday shopping",
  MOBILE_AND_TABLETS: "Phones & tablets",
  COMPUTERS_AND_ACCESSORIES: "Computers & accessories",
  CONSUMER_ELECTRONICS: "Electronics",
  HOME_APPLIANCES: "Home appliances",
  FASHION_AND_LIFESTYLE: "Fashion & lifestyle",
  AUTOMOTIVE: "Automotive",
  TRAVEL: "Travel",
  FOOD_AND_DELIVERY: "Food & delivery",
  PAYMENTS_AND_FINANCE: "Payments & finance",
  OTHER: "More offers",
});
export const SORTS: Readonly<Record<OfferSort, string>> = Object.freeze({
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
      (key) => !["q", "category", "source", "sort", "cursor"].includes(key),
    ) ||
    ["q", "sort", "cursor"].some((key) => params.getAll(key).length > 1)
  )
    return { ok: false };
  const text = params.get("q")?.trim() || null;
  const categories = [...new Set(params.getAll("category"))];
  const sourceIds = [...new Set(params.getAll("source"))];
  const selectedSort = params.get("sort") || "NEWEST";
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
      text,
      categories,
      sourceIds,
      sort: selectedSort,
      limit: 24,
      cursor,
      ...(selectedSort.startsWith("PRICE_") ? { currency: "NPR" } : {}),
    },
  };
}
