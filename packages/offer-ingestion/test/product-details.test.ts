import { describe, expect, it } from "vitest";
import { inferProductDetails } from "../src/adapters/product-details.ts";
describe("product category specificity", () => {
  it("does not treat a graphics card fan as an appliance or a smartwatch strap as clothing", () => {
    expect(inferProductDetails("PNY GeForce RTX 5050 8GB GDDR6 Dual Fan").category).toBe(
      "COMPUTERS_AND_ACCESSORIES",
    );
    expect(
      inferProductDetails(
        "Green Orbit Pro Smart Watch | Metallic Body With Stainless Steel & Leather Strap",
      ).category,
    ).toBe("CONSUMER_ELECTRONICS");
    expect(inferProductDetails("Magcubic HY320 Projector | Android 11 | 1080P").category).toBe(
      "CONSUMER_ELECTRONICS",
    );
    expect(inferProductDetails("Caliber Leather Shoes").category).toBe("FASHION_AND_LIFESTYLE");
  });
});
