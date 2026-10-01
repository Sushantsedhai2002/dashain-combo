import type { Offer, OfferCatalog } from "./contract.ts";
import { isCurrentDashainDiscount } from "./dashain-eligibility.ts";

export const COVERAGE_TARGET = { sellers: 20, categories: 5, offers: 500 } as const;

/** Count only reviewed seller identities and unique, currently publishable products.
 * Multiple channels and campaigns for one seller/product cannot inflate coverage.
 */
export function measureCoverage(
  offers: readonly Offer[],
  sellerIdentities: Readonly<Record<string, string>>,
  now = new Date(),
) {
  const products = new Map<string, Offer>();
  const conflicts = new Set<string>();
  for (const offer of offers) {
    const seller = sellerIdentities[offer.sourceId];
    if (!seller || !isCurrentDashainDiscount(offer, now)) continue;
    const product = offer.discovery!.product!;
    const key = JSON.stringify([seller, new URL(offer.destinationUrl).pathname, product.variant]);
    const previous = products.get(key);
    if (
      previous &&
      (previous.salePrice!.amountMinor !== offer.salePrice!.amountMinor ||
        previous.originalPrice!.amountMinor !== offer.originalPrice!.amountMinor ||
        previous.category !== offer.category)
    )
      conflicts.add(key);
    products.set(key, offer);
  }
  for (const key of conflicts) products.delete(key);
  const bySeller: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const offer of products.values()) {
    const seller = sellerIdentities[offer.sourceId]!;
    bySeller[seller] = (bySeller[seller] ?? 0) + 1;
    byCategory[offer.category] = (byCategory[offer.category] ?? 0) + 1;
  }
  // Unclassified or mixed general retail does not demonstrate category breadth.
  const actual = {
    sellers: Object.keys(bySeller).length,
    categories: Object.keys(byCategory).filter((c) => c !== "OTHER" && c !== "GENERAL_RETAIL")
      .length,
    offers: products.size,
  };
  const remaining = {
    sellers: Math.max(0, COVERAGE_TARGET.sellers - actual.sellers),
    categories: Math.max(0, COVERAGE_TARGET.categories - actual.categories),
    offers: Math.max(0, COVERAGE_TARGET.offers - actual.offers),
  };
  return {
    checkedAt: now.toISOString(),
    target: COVERAGE_TARGET,
    actual,
    remaining,
    achieved: Object.values(remaining).every((n) => n === 0),
    conflictingProducts: conflicts.size,
    bySeller,
    byCategory,
  };
}

export async function readCoverage(
  catalog: Pick<OfferCatalog, "searchVisibleOffers">,
  sellerIdentities: Readonly<Record<string, string>>,
  now = new Date(),
) {
  const offers: Offer[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await catalog.searchVisibleOffers({ scope: "DASHAIN", limit: 100, cursor });
    if (!result.ok) throw new Error("Coverage catalog query failed");
    offers.push(...result.value.items);
    cursor = result.value.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error("Coverage pagination repeated a cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return measureCoverage(offers, sellerIdentities, now);
}
