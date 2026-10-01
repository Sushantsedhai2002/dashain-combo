import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { evaluateExtraction } from "../src/evaluate.ts";
import { createWebsiteAdapters } from "../src/adapters/websites.ts";
import type { CandidateOffer } from "../src/runner.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const fixturePages: Readonly<Record<string, string>> = pages;
import annotations from "./fixtures/annotations.json" with { type: "json" };

describe("recorded extraction evaluation", () => {
  it("compares normalized fields against reviewed annotations from every supported source", async () => {
    const registry = parseSourceRegistry(
      JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
    );
    if (!registry.ok) throw new Error("Invalid registry");
    const candidates = new Map<string, readonly CandidateOffer[]>();
    const fetchPage = async (url: string, source: { id: string }) => ({
      status: 200,
      ...(url === "https://saraworldwide.com.np/wp-json/wc/store/v1/cart"
        ? { cartToken: "recorded-anonymous-session" }
        : {}),
      body: await readFile(
        new URL(`./fixtures/${fixturePages[url] ?? `${source.id}.html`}`, import.meta.url),
        "utf8",
      ),
    });
    for (const adapter of createWebsiteAdapters(
      fetchPage,
      [],
      () => new Date("2026-10-01T19:00:00Z"),
    )) {
      const source = registry.sources.find((s) => s.id === adapter.sourceId);
      if (!source) throw new Error("Missing source");
      const result = await adapter.scan(source);
      if (!result.ok) throw new Error("Failed fixture scan");
      candidates.set(adapter.sourceId, result.offers);
    }
    expect(annotations.offers.length).toBeGreaterThanOrEqual(100);
    const report = evaluateExtraction(annotations.offers, candidates, annotations.negatives);
    expect(report.fieldMatches).toBe(report.fieldChecks);
    expect(report.fieldChecks).toBeGreaterThanOrEqual(1000);
    expect(new Set(annotations.offers.map((o) => o.sourceId)).size).toBe(candidates.size);
    expect(report).toMatchObject({
      annotatedOffers: annotations.offers.length,
      matchedOffers: annotations.offers.length,
      fieldAccuracy: 1,
      negativeChecks: annotations.negatives.length,
      falsePositives: 0,
      mismatches: [],
    });
  }, 15_000);
  it("counts missing offers and wrong fields as failures without inflating accuracy", () => {
    const expected = annotations.offers[0];
    if (!expected) throw new Error("Missing annotation");
    expect(evaluateExtraction([expected], new Map())).toMatchObject({
      matchedOffers: 0,
      fieldChecks: 10,
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
    expect(report.fieldMatches).toBe(5);
    expect(evaluateExtraction([], new Map()).fieldAccuracy).toBe(0);
  });
});
