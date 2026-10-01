import type { SourceDefinition } from "@dashain-offer/source-registry";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createOfferCatalog, type PublishOfferInput } from "@dashain-offer/offer-catalog";

import { activeSource, textOnlyOffer } from "./fixtures/offers.ts";

describe("offer-catalog public package contract", () => {
  it("exports catalog and shared discovery contracts at runtime", async () => {
    const publicModule = await import("@dashain-offer/offer-catalog");

    expect(Object.keys(publicModule)).toEqual([
      "createOfferCatalog",
      "OFFER_TYPES",
      "DiscoverySchema",
      "UNKNOWN_ELIGIBILITY",
      "parseBudgetIntent",
    ]);
  });

  it("composes publication input with source-registry definitions", () => {
    expectTypeOf<PublishOfferInput["source"]>().toEqualTypeOf<SourceDefinition>();
  });

  it("creates a frozen catalog without exposing database objects", () => {
    const catalog = createOfferCatalog({
      databaseUrl: "postgresql://catalog-user:catalog-secret@localhost/catalog",
    });

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.keys(catalog).sort()).toEqual([
      "getVisibleOffer",
      "publishOffer",
      "searchVisibleOffers",
      "withdrawOffer",
    ]);
    expect(JSON.stringify(catalog)).not.toContain("catalog-secret");
    expect(JSON.stringify(catalog)).not.toContain("pool");
  });

  it("returns immutable structured issues without mutating caller input", async () => {
    const catalog = createOfferCatalog({
      databaseUrl: "postgresql://catalog-user:catalog-secret@localhost/catalog",
    });
    const input = {
      ...textOnlyOffer,
      source: { ...activeSource },
      destinationUrl: "http://example.com/not-https",
    };
    const snapshot = structuredClone(input);

    const result = await catalog.publishOffer(input);

    expect(input).toEqual(snapshot);
    expect(result.ok).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    if (!result.ok) {
      expect(Object.isFrozen(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(Object.isFrozen(result.issues[0])).toBe(true);
      expect(Object.keys(result.issues[0] ?? {}).sort()).toEqual(["code", "message", "path"]);
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Zod");
    expect(serialized).not.toContain("catalog-secret");
    expect(serialized).not.toContain("connectionString");
  });
});
