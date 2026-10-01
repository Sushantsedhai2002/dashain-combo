import { describe, expect, it } from "vitest";
import type { Offer } from "../src/contract.ts";
import { isCurrentDashainDiscount } from "../src/dashain-eligibility.ts";
import { discovery } from "./fixtures/discovery.ts";

const now = new Date("2026-10-01T07:00:00Z");
import { discountedProduct } from "./fixtures/discounted-product.ts";

describe("Dashain discounted products", () => {
  it("retains discounted products with gifts, bundles or service benefits", () => {
    for (const offerType of [
      "PRODUCT_DISCOUNT",
      "GIFT_WITH_PURCHASE",
      "BUNDLE",
      "SERVICE_BENEFIT",
    ] as const)
      expect(
        isCurrentDashainDiscount(
          { ...discountedProduct, discovery: discovery({ offerType }) },
          now,
        ),
      ).toBe(true);
  });
  it.each([
    { discovery: null },
    { originalPrice: null },
    { salePrice: null },
    { salePrice: { currency: "NPR", amountMinor: 6000000 } },
    { salePrice: { currency: "NPR", amountMinor: 0 } },
    { salePrice: { currency: "USD", amountMinor: 1 } },
    { withdrawnAt: now.toISOString() },
    { expiresAt: now.toISOString() },
    { validityStartsAt: "2026-10-02T07:00:00Z" },
    { discovery: discovery({ qualification: "QUARANTINED" }) },
    { discovery: discovery({ product: null }) },
    { discovery: discovery({ campaign: null }) },
    { discovery: discovery({ offerType: "PRIZE_DRAW" }) },
    { discovery: discovery({ offerType: "COUPON" }) },
    { discovery: discovery({ offerType: "CASHBACK" }) },
    { discovery: discovery({ availability: "OUT_OF_STOCK" }) },
    { discovery: discovery({ priceObservedAt: null }) },
    { discovery: discovery({ priceObservedAt: "2026-09-29T07:00:00Z" }) },
    { discovery: discovery({ lastVerifiedAt: "2026-09-29T07:00:00Z" }) },
    { discovery: discovery({ priceObservedAt: "2026-10-02T07:00:00Z" }) },
    { discovery: discovery({ campaign: { ...discovery().campaign!, seasonAD: 2025 } }) },
    { discovery: discovery({ campaign: { ...discovery().campaign!, festivals: ["TIHAR"] } }) },
    {
      discovery: discovery({
        campaign: { ...discovery().campaign!, startsAt: "2026-10-02T07:00:00Z" },
      }),
    },
    { discovery: discovery({ campaign: { ...discovery().campaign!, endsAt: now.toISOString() } }) },
    {
      discovery: discovery({
        evidence: discovery().evidence.map((e) => ({ ...e, fetchedAt: "2026-09-25T00:00:00Z" })),
      }),
    },
    {
      discovery: discovery({
        evidence: discovery().evidence.map((e) => ({
          ...e,
          fields: e.fields.filter((field) => field !== "salePrice"),
        })),
      }),
    },
  ] satisfies Partial<Offer>[])("excludes unsupported or stale claims %#", (overrides) => {
    expect(isCurrentDashainDiscount({ ...discountedProduct, ...overrides }, now)).toBe(false);
  });
  it("uses the Nepal year at the season boundary", () => {
    expect(isCurrentDashainDiscount(discountedProduct, new Date("2026-12-31T18:15:00Z"))).toBe(
      false,
    );
  });
});
