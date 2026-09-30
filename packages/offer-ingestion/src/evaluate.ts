import type { CandidateOffer } from "./runner.ts";

export type ExtractionAnnotation = Readonly<{
  sourceId: string;
  title: string;
  destinationUrl: string;
  originalMinor: number | null;
  saleMinor: number | null;
  category: string;
  brandName: string | null;
  imageUrl?: string | null;
  sourcePublishedAt?: Readonly<{ kind: string; value: string }> | null;
  explicitValidityEnd?: Readonly<{ kind: string; value: string }> | null;
  terms?: string | null;
  discountLabel?: string | null;
}>;
export type NegativeAnnotation = Readonly<{
  sourceId: string;
  destinationUrl: string;
  reason: string;
}>;

const optionalFields = [
  "imageUrl",
  "sourcePublishedAt",
  "explicitValidityEnd",
  "terms",
  "discountLabel",
] as const;
function identity(value: Readonly<{ sourceId: string; destinationUrl: string }>): string {
  return JSON.stringify([value.sourceId, value.destinationUrl]);
}
export function evaluateExtraction(
  annotations: readonly ExtractionAnnotation[],
  candidates: ReadonlyMap<string, readonly CandidateOffer[]>,
  negatives: readonly NegativeAnnotation[] = [],
) {
  const reviewed = new Set<string>();
  for (const entry of [...annotations, ...negatives]) {
    const key = identity(entry);
    if (reviewed.has(key)) throw new Error("Duplicate or conflicting extraction annotation");
    reviewed.add(key);
  }
  let matchedOffers = 0;
  let fieldChecks = 0;
  let fieldMatches = 0;
  let falsePositives = 0;
  const mismatches: string[] = [];
  for (const [sourceId, offers] of candidates) {
    const urls = new Set<string>();
    const keys = new Set<string>();
    for (const offer of offers) {
      if (urls.has(offer.destinationUrl) || keys.has(offer.sourceOfferKey))
        mismatches.push(`${sourceId}: duplicate extracted promotion ${offer.destinationUrl}`);
      urls.add(offer.destinationUrl);
      keys.add(offer.sourceOfferKey);
    }
  }
  for (const expected of annotations) {
    const actual = candidates
      .get(expected.sourceId)
      ?.find((offer) => offer.destinationUrl === expected.destinationUrl);
    const checks: readonly (readonly [string, unknown, unknown])[] = [
      ["title", expected.title, actual?.title],
      ["destinationUrl", expected.destinationUrl, actual?.destinationUrl],
      ["originalMinor", expected.originalMinor, actual?.originalPrice?.amountMinor ?? null],
      ["saleMinor", expected.saleMinor, actual?.salePrice?.amountMinor ?? null],
      ["category", expected.category, actual?.category],
      ["brandName", expected.brandName, actual?.brandName ?? null],
      [
        "currency",
        expected.originalMinor === null && expected.saleMinor === null ? null : "NPR",
        actual?.originalPrice?.currency ?? actual?.salePrice?.currency ?? null,
      ],
      ...optionalFields
        .filter((field) => Object.hasOwn(expected, field))
        .map((field) => [field, expected[field], actual?.[field] ?? null] as const),
    ];
    fieldChecks += checks.length;
    if (actual === undefined) {
      mismatches.push(`${expected.sourceId}: missing ${expected.destinationUrl}`);
      continue;
    }
    matchedOffers += 1;
    for (const [field, wanted, found] of checks) {
      if (JSON.stringify(wanted) === JSON.stringify(found)) fieldMatches += 1;
      else mismatches.push(`${expected.sourceId}: ${expected.destinationUrl} ${field} differs`);
    }
    if (
      actual.originalPrice &&
      actual.salePrice &&
      actual.originalPrice.currency !== actual.salePrice.currency
    )
      mismatches.push(`${expected.sourceId}: mixed currencies ${expected.destinationUrl}`);
  }
  for (const negative of negatives) {
    if (
      candidates
        .get(negative.sourceId)
        ?.some((offer) => offer.destinationUrl === negative.destinationUrl)
    ) {
      falsePositives += 1;
      mismatches.push(
        `${negative.sourceId}: false positive ${negative.destinationUrl} (${negative.reason})`,
      );
    }
  }
  return Object.freeze({
    annotatedOffers: annotations.length,
    matchedOffers,
    fieldChecks,
    fieldMatches,
    fieldAccuracy: fieldChecks === 0 ? 0 : fieldMatches / fieldChecks,
    negativeChecks: negatives.length,
    falsePositives,
    mismatches: Object.freeze(mismatches),
  });
}
