import { describe, expect, it } from "vitest";
import { measureCoverage, readCoverage } from "../src/coverage.ts";
import { discountedProduct } from "./fixtures/discounted-product.ts";
import type { Offer, OfferCatalog, OfferCategory } from "../src/contract.ts";
const now = new Date("2026-10-01T07:00:00Z");
const offer = (
  sourceId: string,
  id: number,
  category: OfferCategory = "HOME_APPLIANCES",
): Offer => ({
  ...discountedProduct,
  sourceId,
  destinationUrl: `https://seller.test/product/${id}`,
  category,
});
describe("published coverage target", () => {
  it("excludes unknown sellers, stale evidence, conflicts, and duplicate seller channels", () => {
    const a = offer("a", 1),
      b = offer("b", 1);
    const report = measureCoverage(
      [
        a,
        b,
        offer("unknown", 2),
        { ...offer("a", 3), expiresAt: now.toISOString() },
        { ...offer("a", 4), salePrice: { currency: "NPR", amountMinor: 2000000 } },
        offer("a", 4),
      ],
      { a: "seller", b: "seller" },
      now,
    );
    expect(report.actual).toEqual({ sellers: 1, categories: 1, offers: 1 });
    expect(report.conflictingProducts).toBe(1);
    expect(report.achieved).toBe(false);
    expect(report.remaining).toEqual({ sellers: 19, categories: 4, offers: 499 });
  });
  it("requires all three targets and excludes OTHER from category breadth", () => {
    const categories: OfferCategory[] = [
      "HOME_APPLIANCES",
      "CONSUMER_ELECTRONICS",
      "COMPUTERS_AND_ACCESSORIES",
      "FASHION_AND_LIFESTYLE",
      "FOOD_AND_DELIVERY",
    ];
    const sellers = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`s${i}`, `s${i}`]));
    const offers = Array.from({ length: 500 }, (_, i) =>
      offer(`s${i % 20}`, i, categories[i % 5]!),
    );
    expect(measureCoverage(offers, sellers, now).achieved).toBe(true);
    expect(measureCoverage(offers.slice(1), sellers, now).achieved).toBe(false);
    expect(
      measureCoverage(
        offers.map((o) => ({ ...o, category: "OTHER" })),
        sellers,
        now,
      ).actual.categories,
    ).toBe(0);
  });
  it("reads every catalog page and rejects failed or cyclic pagination", async () => {
    let call = 0;
    const catalog = {
      searchVisibleOffers: async () => ({
        ok: true,
        value: { items: [offer("a", ++call)], nextCursor: call === 1 ? "next" : null },
      }),
    } as unknown as OfferCatalog;
    expect((await readCoverage(catalog, { a: "a" }, now)).actual.offers).toBe(2);
    const failed = {
      searchVisibleOffers: async () => ({ ok: false, issues: [] }),
    } as unknown as unknown as OfferCatalog;
    await expect(readCoverage(failed, {}, now)).rejects.toThrow("query failed");
    const cyclic = {
      searchVisibleOffers: async () => ({ ok: true, value: { items: [], nextCursor: "next" } }),
    } as unknown as unknown as OfferCatalog;
    await expect(readCoverage(cyclic, {}, now)).rejects.toThrow("repeated a cursor");
  });
});
