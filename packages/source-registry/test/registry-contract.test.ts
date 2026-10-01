import { describe, expect, it } from "vitest";

import { getActiveSources, parseSourceRegistry } from "@dashain-offer/source-registry";
import productionRegistry from "../../../config/sources.json" with { type: "json" };

const PORTFOLIO_GROUPS = [
  "automotive",
  "consumer-electronics-appliances",
  "electronics-retail",
  "fashion-lifestyle",
  "general-retail",
  "travel-delivery-payments",
] as const;

describe("production source registry", () => {
  it("contains verified active sources across all six portfolio groups", () => {
    const result = parseSourceRegistry(productionRegistry);

    if (!result.ok) {
      throw new Error(`Production registry is invalid: ${JSON.stringify(result.issues)}`);
    }

    const activeSources = getActiveSources(result.sources);
    const representedGroups = [
      ...new Set(activeSources.flatMap((source) => source.marketSegments)),
    ].sort();

    expect(activeSources.length).toBeGreaterThan(0);
    expect(representedGroups).toEqual(PORTFOLIO_GROUPS);
  });
});
