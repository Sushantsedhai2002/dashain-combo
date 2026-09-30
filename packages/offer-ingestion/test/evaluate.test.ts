import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { evaluateExtraction } from "../src/evaluate.ts";
import { createEvoStoreAdapter } from "../src/adapters/evostore.ts";
import { createListingAdapter, LISTING_PROFILES } from "../src/adapters/listings.ts";
import type { CandidateOffer } from "../src/runner.ts";
import annotations from "./fixtures/annotations.json" with { type: "json" };

describe("recorded extraction evaluation", () => {
  it("compares normalized fields against reviewed annotations from all five sources", async () => {
    const registry = parseSourceRegistry(
      JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
    );
    if (!registry.ok) throw new Error("Invalid registry");
    const candidates = new Map<string, readonly CandidateOffer[]>();
    for (const profile of [{ sourceId: "evostore" }, ...LISTING_PROFILES]) {
      const source = registry.sources.find((s) => s.id === profile.sourceId);
      if (!source) throw new Error("Missing source");
      const body = await readFile(
        new URL(`./fixtures/${profile.sourceId}.html`, import.meta.url),
        "utf8",
      );
      const fetch = async () => ({ status: 200, body });
      const adapter =
        "listingUrl" in profile
          ? createListingAdapter(profile, fetch)
          : createEvoStoreAdapter(fetch);
      const result = await adapter.scan(source);
      if (!result.ok) throw new Error("Failed fixture scan");
      candidates.set(profile.sourceId, result.offers);
    }
    expect(evaluateExtraction(annotations.offers, candidates)).toEqual({
      annotatedOffers: 15,
      matchedOffers: 15,
      fieldChecks: 105,
      fieldMatches: 105,
      fieldAccuracy: 1,
      mismatches: [],
    });
  });
  it("counts missing offers and wrong fields as failures without inflating accuracy", () => {
    const expected = annotations.offers[0];
    if (!expected) throw new Error("Missing annotation");
    expect(evaluateExtraction([expected], new Map())).toMatchObject({
      matchedOffers: 0,
      fieldChecks: 7,
      fieldMatches: 0,
      fieldAccuracy: 0,
    });
    const actual: CandidateOffer = {
      title: "Wrong",
      sourceOfferKey: "key",
      category: "OTHER",
      destinationUrl: expected.destinationUrl,
    };
    const report = evaluateExtraction([expected], new Map([[expected.sourceId, [actual]]]));
    expect(report.mismatches.length).toBeGreaterThan(0);
    expect(report.fieldMatches).toBe(2);
    expect(evaluateExtraction([], new Map()).fieldAccuracy).toBe(0);
  });
});
