import { describe, expect, it } from "vitest";

import * as offerCatalog from "@dashain-offer/offer-catalog";

describe("@dashain-offer/offer-catalog", () => {
  it("resolves through its public entry point", () => {
    expect(Object.keys(offerCatalog)).toEqual([]);
  });
});
