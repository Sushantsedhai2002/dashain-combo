import type { SourceDefinition } from "@dashain-offer/source-registry";
import { describe, expect, it } from "vitest";

import {
  parsePublishOfferInput,
  parseSearchOffersQuery,
  parseWithdrawOfferInput,
} from "../src/schema.ts";

const activeSource: SourceDefinition = {
  id: "daraz-nepal",
  displayName: "Daraz Nepal",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["GENERAL_RETAIL"],
  channels: [
    {
      kind: "WEBSITE",
      url: "https://www.daraz.com.np/",
      isEnabled: true,
    },
  ],
  verification: {
    verifiedAt: "2026-09-01T00:00:00Z",
    evidenceUrl: "https://www.daraz.com.np/",
  },
};

const validPublishInput = {
  source: activeSource,
  sourceOfferKey: "dashain-sale-2026",
  title: "Dashain sale up to 50%",
  category: "GENERAL_RETAIL",
  destinationUrl: "https://www.daraz.com.np/dashain-sale",
};

describe("parsePublishOfferInput", () => {
  it("accepts a text-only promotion and normalizes optional fields", () => {
    const result = parsePublishOfferInput(validPublishInput);

    expect(result).toEqual({
      ok: true,
      value: {
        ...validPublishInput,
        summary: null,
        productName: null,
        brandName: null,
        imageUrl: null,
        originalPrice: null,
        salePrice: null,
        discountPercent: null,
        discountLabel: null,
        terms: null,
        sourcePublishedAt: null,
        validityStartsAt: null,
        explicitValidityEnd: null,
      },
    });
  });

  it("rejects source metadata that exceeds persistence limits", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      source: {
        ...activeSource,
        id: "a".repeat(101),
        displayName: "a".repeat(301),
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(["source.displayName", "source.id"]);
    }
  });

  it("rejects publication from an inactive source", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      source: { ...activeSource, status: "PAUSED" },
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "SOURCE_NOT_ACTIVE",
          path: "source.status",
          message: "Source must be ACTIVE",
        },
      ],
    });
  });

  it("rejects unknown publication fields", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      unapproved: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("INVALID_INPUT");
      expect(result.issues[0]?.path).toBe("unapproved");
    }
  });

  it("rejects non-HTTPS destination URLs", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      destinationUrl: "http://example.com/offer",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects impossible Kathmandu calendar dates", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      explicitValidityEnd: {
        kind: "KATHMANDU_DATE",
        value: "2026-02-30",
      },
    });

    expect(result.ok).toBe(false);
  });

  it("accepts safe integer prices using one currency", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      originalPrice: { currency: "NPR", amountMinor: 100_000 },
      salePrice: { currency: "NPR", amountMinor: 80_000 },
      discountPercent: 20,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects mismatched price currencies", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      originalPrice: { currency: "NPR", amountMinor: 100_000 },
      salePrice: { currency: "USD", amountMinor: 800 },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a sale price above the original price", () => {
    const result = parsePublishOfferInput({
      ...validPublishInput,
      originalPrice: { currency: "NPR", amountMinor: 100_000 },
      salePrice: { currency: "NPR", amountMinor: 120_000 },
    });

    expect(result.ok).toBe(false);
  });
});

describe("parseSearchOffersQuery", () => {
  it("provides stable defaults and removes duplicate filters", () => {
    expect(
      parseSearchOffersQuery({
        categories: ["AUTOMOTIVE", "AUTOMOTIVE"],
        sourceIds: ["daraz-nepal", "daraz-nepal"],
      }),
    ).toEqual({
      ok: true,
      value: {
        text: null,
        categories: ["AUTOMOTIVE"],
        sourceIds: ["daraz-nepal"],
        currency: null,
        sort: "NEWEST",
        limit: 20,
        cursor: null,
      },
    });
  });

  it("rejects source filters that exceed persistence limits", () => {
    const result = parseSearchOffersQuery({ sourceIds: ["a".repeat(101)] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(["sourceIds.0"]);
    }
  });

  it("requires one currency for price sorting", () => {
    const result = parseSearchOffersQuery({ sort: "PRICE_ASC" });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: "INVALID_INPUT",
          path: "currency",
          message: "Currency is required for price sorting",
        },
      ],
    });
  });

  it("accepts the maximum page size and a currency price sort", () => {
    const result = parseSearchOffersQuery({
      sort: "PRICE_DESC",
      currency: "NPR",
      limit: 100,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unsupported categories and oversized pages", () => {
    const result = parseSearchOffersQuery({
      categories: ["PHONES"],
      limit: 101,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(["categories.0", "limit"]);
    }
  });
});

describe("parseWithdrawOfferInput", () => {
  it("rejects a source identifier that exceeds persistence limits", () => {
    const result = parseWithdrawOfferInput({
      sourceId: "a".repeat(101),
      sourceOfferKey: "dashain-sale-2026",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(["sourceId"]);
    }
  });
});
