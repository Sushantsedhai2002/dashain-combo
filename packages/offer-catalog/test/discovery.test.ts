import { describe, expect, it } from "vitest";
import {
  DiscoverySchema,
  normalizeSearch,
  parseBudgetIntent,
  searchTokens,
} from "../src/discovery.ts";
import { parsePublishOfferInput, parseSearchOffersQuery } from "../src/schema.ts";
import { calculateCost } from "../src/cost.ts";
import { discovery } from "./fixtures/discovery.ts";
import { textOnlyOffer } from "./fixtures/offers.ts";
describe("evidenced discovery contract", () => {
  it("accepts gift-only and bundle records without inventing prices", () => {
    expect(parsePublishOfferInput({ ...textOnlyOffer, discovery: discovery() }).ok).toBe(true);
    expect(
      parsePublishOfferInput({
        ...textOnlyOffer,
        salePrice: { currency: "NPR", amountMinor: 5000000 },
        discovery: discovery({ offerType: "BUNDLE" }),
      }).ok,
    ).toBe(true);
    expect(
      parsePublishOfferInput({
        ...textOnlyOffer,
        discovery: discovery({ offerType: "BUNDLE", components: [] }),
      }).ok,
    ).toBe(false);
  });
  it("rejects unsupported or outside-source claims and ineligible gifts", () => {
    const d = discovery();
    expect(
      DiscoverySchema.safeParse({ ...d, evidence: [{ ...d.evidence[0], fields: ["product"] }] })
        .success,
    ).toBe(false);
    expect(DiscoverySchema.safeParse({ ...d, product: null }).success).toBe(false);
    expect(
      DiscoverySchema.safeParse({
        ...d,
        benefits: [{ ...d.benefits[0], eligibleProductKeys: ["wrong-model"] }],
      }).success,
    ).toBe(false);
    expect(
      parsePublishOfferInput({
        ...textOnlyOffer,
        discovery: { ...d, evidence: [{ ...d.evidence[0], url: "https://attacker.test/" }] },
      }).ok,
    ).toBe(false);
    expect(
      parsePublishOfferInput({
        ...textOnlyOffer,
        salePrice: { currency: "NPR", amountMinor: 100 },
        discovery: {
          ...d,
          evidence: [
            { ...d.evidence[0], fields: d.evidence[0]!.fields.filter((f) => f !== "salePrice") },
          ],
        },
      }).ok,
    ).toBe(false);
    expect(
      DiscoverySchema.safeParse({ ...d, qualification: "QUARANTINED", product: null }).success,
    ).toBe(true);
  });
  it("normalizes aliases and explicit budget intent, preserving model numbers", () => {
    expect(normalizeSearch("  LG  १२३ ")).toBe("lg 123");
    expect(parseBudgetIntent("washer under 60k")).toEqual({
      text: "washer",
      maxPriceMinor: 6000000,
    });
    expect(parseBudgetIntent("washer below NPR ६०,०००").maxPriceMinor).toBe(6000000);
    expect(parseBudgetIntent("LG 60000")).toEqual({ text: "lg 60000", maxPriceMinor: null });
    expect(searchTokens("LG fridge combo")).toEqual([
      ["lg"],
      ["fridge", "refrigerator", "फ्रिज"],
      ["combo", "bundle", "gift", "free", "उपहार"],
    ]);
    expect(searchTokens("washing machine टिभी")).toHaveLength(2);
    expect(parseSearchOffersQuery({ text: "washer under 60k", currency: "NPR" })).toMatchObject({
      ok: true,
      value: { text: "washer", sort: "RELEVANCE", maxPriceMinor: 6000000 },
    });
    expect(
      parseSearchOffersQuery({ minPriceMinor: 600, maxPriceMinor: 500, currency: "NPR" }).ok,
    ).toBe(false);
    expect(parseSearchOffersQuery({ text: "under 60k" }).ok).toBe(false);
  });
});
it("accepts evidenced payment campaigns without pretending they are priced products", () => {
  const d = discovery({ offerType: "CASHBACK", product: null });
  d.evidence[0]!.fields.push("eligibility");
  expect(DiscoverySchema.safeParse(d).success).toBe(true);
});

describe("cash cost scenarios", () => {
  const d = discovery();
  const cashback = {
    ...d,
    benefits: [{ ...d.benefits[0]!, type: "CASHBACK" as const, percent: 10, capMinor: 50000 }],
    eligibility: {
      ...d.eligibility,
      minimumSpendMinor: 100000,
      paymentMethod: "Khalti",
      cashbackBasis: "LISTED_PRICE" as const,
      cashbackTiming: "Within 7 days",
    },
  };
  it("applies caps only to confirmed eligible cashback and keeps delivery unknown", () => {
    expect(
      calculateCost({
        listedMinor: 1000000,
        instantDiscountMinor: 0,
        eligibilityConfirmed: true,
        discovery: cashback,
      }),
    ).toEqual({
      payableNowMinor: 1000000,
      effectiveCashMinor: 950000,
      cashbackMinor: 50000,
      deliveryUnknown: true,
    });
    expect(
      calculateCost({
        listedMinor: 1000000,
        instantDiscountMinor: 10000,
        eligibilityConfirmed: true,
        discovery: cashback,
      }).cashbackMinor,
    ).toBeNull();
    expect(
      calculateCost({
        listedMinor: 1000,
        instantDiscountMinor: 0,
        eligibilityConfirmed: true,
        discovery: cashback,
      }).cashbackMinor,
    ).toBeNull();
  });
  it("does not subtract gift values or prizes; handles permitted fixed cashback", () => {
    expect(
      calculateCost({
        listedMinor: 1000000,
        instantDiscountMinor: 0,
        eligibilityConfirmed: true,
        discovery: d,
      }).effectiveCashMinor,
    ).toBeNull();
    const confirmed = {
      ...cashback,
      benefits: [{ ...cashback.benefits[0]!, amountMinor: 1000 }],
      eligibility: {
        ...cashback.eligibility,
        combinability: "ALLOWED" as const,
        cashbackBasis: "PAYABLE_NOW" as const,
        mandatoryChargesMinor: 500,
      },
    };
    expect(
      calculateCost({
        listedMinor: 1000000,
        instantDiscountMinor: 10000,
        eligibilityConfirmed: true,
        discovery: confirmed,
      }),
    ).toMatchObject({
      payableNowMinor: 990500,
      effectiveCashMinor: 989500,
      deliveryUnknown: false,
    });
    expect(
      calculateCost({
        listedMinor: 1000000,
        instantDiscountMinor: 0,
        eligibilityConfirmed: true,
        discovery: { ...cashback, benefits: [{ ...cashback.benefits[0]!, status: "CHANCE" }] },
      }).cashbackMinor,
    ).toBeNull();
    expect(() =>
      calculateCost({
        listedMinor: 1,
        instantDiscountMinor: 2,
        eligibilityConfirmed: false,
        discovery: d,
      }),
    ).toThrow();
  });
});
