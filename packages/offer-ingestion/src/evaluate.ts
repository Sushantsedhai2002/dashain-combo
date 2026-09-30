import type { CandidateOffer } from "./runner.ts";

export type ExtractionAnnotation = Readonly<{
  sourceId: string;
  title: string;
  destinationUrl: string;
  originalMinor: number;
  saleMinor: number;
  category: string;
  brandName: string | null;
}>;
export function evaluateExtraction(
  annotations: readonly ExtractionAnnotation[],
  candidates: ReadonlyMap<string, readonly CandidateOffer[]>,
): Readonly<{
  annotatedOffers: number;
  matchedOffers: number;
  fieldChecks: number;
  fieldMatches: number;
  fieldAccuracy: number;
  mismatches: readonly string[];
}> {
  let matchedOffers = 0;
  let fieldMatches = 0;
  const mismatches: string[] = [];
  const fields = [
    "title",
    "destinationUrl",
    "originalMinor",
    "saleMinor",
    "category",
    "brandName",
    "currency",
  ] as const;
  for (const expected of annotations) {
    const actual = candidates
      .get(expected.sourceId)
      ?.find((offer) => offer.destinationUrl === expected.destinationUrl);
    if (actual === undefined) {
      mismatches.push(`${expected.sourceId}: missing ${expected.destinationUrl}`);
      continue;
    }
    matchedOffers += 1;
    const actualFields = {
      title: actual.title,
      destinationUrl: actual.destinationUrl,
      originalMinor: actual.originalPrice?.amountMinor,
      saleMinor: actual.salePrice?.amountMinor,
      category: actual.category,
      brandName: actual.brandName ?? null,
      currency:
        actual.originalPrice?.currency === "NPR" && actual.salePrice?.currency === "NPR"
          ? "NPR"
          : null,
    };
    const expectedFields = { ...expected, currency: "NPR" };
    for (const field of fields) {
      if (actualFields[field] === expectedFields[field]) fieldMatches += 1;
      else mismatches.push(`${expected.sourceId}: ${expected.destinationUrl} ${field} differs`);
    }
  }
  const fieldChecks = annotations.length * fields.length;
  return Object.freeze({
    annotatedOffers: annotations.length,
    matchedOffers,
    fieldChecks,
    fieldMatches,
    fieldAccuracy: fieldChecks === 0 ? 0 : fieldMatches / fieldChecks,
    mismatches: Object.freeze(mismatches),
  });
}
