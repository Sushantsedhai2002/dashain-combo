import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createWebsiteAdapters } from "../src/adapters/websites.ts";

const cases = [
  ["nagmani", 1],
  ["gadget-house-nepal", 4],
  ["khudra", 6],
  ["aadima-nepal", 20],
  ["shoes4less-nepal", 1],
  ["ekjor", 27],
  ["ishop-nepal", 8],
  ["moto-world-nepal", 6],
  ["yantra-nepal", 10],
] as const;

describe("verified replacement sources", () => {
  it.each(cases)("collects explicit discounted products from %s", async (id, minimum) => {
    const registry = parseSourceRegistry(
      JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
    );
    if (!registry.ok) throw new Error("Invalid registry");
    const source = registry.sources.find((s) => s.id === id);
    const adapter = createWebsiteAdapters(async () => ({
      status: 200,
      body: await readFile(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8"),
    })).find((a) => a.sourceId === id);
    expect(source).toBeDefined();
    expect(adapter).toBeDefined();
    if (!source || !adapter) throw new Error("Replacement not implemented");
    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers.length).toBeGreaterThanOrEqual(minimum);
    expect(new Set(result.offers.map((o) => o.sourceOfferKey)).size).toBe(result.offers.length);
    for (const offer of result.offers) {
      expect(offer.originalPrice?.currency).toBe("NPR");
      expect(offer.salePrice?.amountMinor).toBeLessThan(offer.originalPrice?.amountMinor ?? 0);
      expect((offer.productName ?? "").length).toBeLessThanOrEqual(200);
    }
  });
});
