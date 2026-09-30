import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { evaluateExtraction } from "../src/evaluate.ts";
import { createWebsiteAdapters } from "../src/adapters/websites.ts";
import type { CandidateOffer } from "../src/runner.ts";
import annotations from "./fixtures/annotations.json" with { type: "json" };

describe("recorded extraction evaluation", () => {
  it("compares normalized fields against reviewed annotations from every supported source", async () => {
    const registry = parseSourceRegistry(
      JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
    );
    if (!registry.ok) throw new Error("Invalid registry");
    const candidates = new Map<string, readonly CandidateOffer[]>();
    const fetchPage = async (_url: string, source: { id: string }) => ({
      status: 200,
      body: await readFile(new URL(`./fixtures/${source.id}.html`, import.meta.url), "utf8"),
    });
    for (const adapter of createWebsiteAdapters(fetchPage)) {
      const source = registry.sources.find((s) => s.id === adapter.sourceId);
      if (!source) throw new Error("Missing source");
      const result = await adapter.scan(source);
      if (!result.ok) throw new Error("Failed fixture scan");
      candidates.set(adapter.sourceId, result.offers);
    }
    expect(evaluateExtraction(annotations.offers, candidates)).toEqual({
      annotatedOffers: annotations.offers.length,
      matchedOffers: annotations.offers.length,
      fieldChecks: annotations.offers.length * 7,
      fieldMatches: annotations.offers.length * 7,
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
