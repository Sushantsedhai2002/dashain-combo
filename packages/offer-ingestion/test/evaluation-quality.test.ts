import { describe, expect, it } from "vitest";
import { evaluateExtraction } from "../src/evaluate.ts";
import type { CandidateOffer } from "../src/runner.ts";
const expected = {
  sourceId: "source",
  title: "Promotion",
  destinationUrl: "https://source.test/promotion",
  originalMinor: 200,
  saleMinor: 100,
  category: "OTHER",
  brandName: null,
};
const actual: CandidateOffer = {
  sourceOfferKey: "one",
  title: expected.title,
  destinationUrl: expected.destinationUrl,
  category: "OTHER",
  originalPrice: { currency: "NPR", amountMinor: 200 },
  salePrice: { currency: "NPR", amountMinor: 100 },
};
describe("evaluation quality gates", () => {
  it("rejects repeated annotations instead of counting one promotion twice", () => {
    expect(() => evaluateExtraction([expected, expected], new Map())).toThrow(/duplicate/i);
  });
  it("counts a known non-promotion accidentally extracted as a false positive", () => {
    const report = evaluateExtraction(
      [expected],
      new Map([
        ["source", [actual, { ...actual, destinationUrl: "https://source.test/ordinary" }]],
      ]),
      [
        {
          sourceId: "source",
          destinationUrl: "https://source.test/ordinary",
          reason: "No discount evidence",
        },
      ],
    );
    expect(report).toMatchObject({ negativeChecks: 1, falsePositives: 1 });
    expect(report.mismatches.join(" ")).toMatch(/false positive/i);
  });
  it("detects invented campaign dates, terms and images", () => {
    const report = evaluateExtraction(
      [
        {
          ...expected,
          sourcePublishedAt: null,
          explicitValidityEnd: null,
          terms: null,
          imageUrl: null,
        },
      ],
      new Map([
        [
          "source",
          [
            {
              ...actual,
              terms: "Invented",
              imageUrl: "https://source.test/made-up.jpg",
              explicitValidityEnd: { kind: "KATHMANDU_DATE", value: "2026-12-31" },
            },
          ],
        ],
      ]),
    );
    expect(report.mismatches).toHaveLength(3);
  });
  it("detects duplicate extracted promotions even when their fields agree", () => {
    expect(
      evaluateExtraction([expected], new Map([["source", [actual, actual]]])).mismatches.join(" "),
    ).toMatch(/duplicate/i);
  });
});
