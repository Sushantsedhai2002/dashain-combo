import { z } from "zod";

export const OFFER_TYPES = [
  "PRODUCT_DISCOUNT",
  "BUNDLE",
  "GIFT_WITH_PURCHASE",
  "CASHBACK",
  "COUPON",
  "SERVICE_BENEFIT",
  "PRIZE_DRAW",
  // A product the merchant placed in a Dashain collection, with no evidenced price cut.
  "FESTIVE_LISTING",
] as const;
const text = z.string().trim().min(1).max(2000);
const instant = z.iso.datetime({ offset: true });
const url = z
  .url()
  .startsWith("https://")
  .refine((value) => !new URL(value).username && !new URL(value).password);
const minor = z.number().int().nonnegative().safe();
export const DiscoverySchema = z
  .object({
    offerType: z.enum(OFFER_TYPES),
    qualification: z.enum(["QUALIFIED", "QUARANTINED", "UNCLASSIFIED"]),
    ruleVersion: text,
    reasons: z.array(text).max(50),
    campaign: z
      .object({
        key: text,
        title: text,
        festivals: z.array(z.enum(["DASHAIN", "TIHAR"])),
        seasonAD: z.number().int().min(2000).max(2200),
        seasonBS: text.nullable(),
        publishedAt: instant.nullable(),
        startsAt: instant.nullable(),
        endsAt: instant.nullable(),
        originalDateText: text.nullable(),
        dateCalendar: z.enum(["AD", "BS", "UNKNOWN"]),
        evidenceUrl: url,
        membership: z.enum(["EXPLICIT_PRODUCT", "ELIGIBLE_CATEGORY"]),
      })
      .strict()
      .nullable(),
    product: z
      .object({
        key: text,
        model: text,
        variant: text,
        gtin: text.nullable(),
        attributes: z.record(z.string(), text),
      })
      .strict()
      .nullable(),
    merchant: text.nullable(),
    availability: z.enum(["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]),
    lastVerifiedAt: instant,
    priceObservedAt: instant.nullable(),
    components: z
      .array(
        z
          .object({
            description: text,
            quantity: z.number().positive().nullable(),
            unit: text.nullable(),
            role: z.enum(["MAIN_ITEM", "INCLUDED_ITEM", "GIFT"]),
          })
          .strict(),
      )
      .max(100),
    benefits: z
      .array(
        z
          .object({
            type: z.enum(OFFER_TYPES),
            description: text,
            status: z.enum(["GUARANTEED", "CONDITIONAL", "CHANCE"]),
            amountMinor: minor.nullable(),
            percent: z.number().min(0).max(100).nullable(),
            capMinor: minor.nullable(),
            eligibleProductKeys: z.array(text).min(1),
            conditions: text.nullable(),
          })
          .strict(),
      )
      .max(100),
    eligibility: z
      .object({
        minimumSpendMinor: minor.nullable(),
        coupon: text.nullable(),
        paymentMethod: text.nullable(),
        bankOrCard: text.nullable(),
        channel: text.nullable(),
        location: text.nullable(),
        usageLimit: text.nullable(),
        combinability: z.enum(["ALLOWED", "FORBIDDEN", "UNKNOWN"]),
        cashbackBasis: z.enum(["PAYABLE_NOW", "LISTED_PRICE"]).nullable(),
        cashbackTiming: text.nullable(),
        mandatoryChargesMinor: minor.nullable(),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            url,
            fetchedAt: instant,
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            excerpt: text,
            path: text,
            extractorVersion: text,
            fields: z.array(text).min(1),
            socialPost: z.object({ accountUrl: url, url }).strict().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.qualification !== "QUALIFIED") return;
    const fields = new Set(value.evidence.flatMap((entry) => entry.fields));
    for (const field of [
      "offerType",
      ...(value.product ? ["product"] : ["eligibility"]),
      ...(value.campaign ? ["campaign", "membership"] : []),
      ...(value.benefits.length ? ["benefits"] : []),
      ...(value.components.length ? ["components"] : []),
    ]) {
      if (!fields.has(field))
        ctx.addIssue({
          code: "custom",
          message: `Missing evidence for ${field}`,
          path: ["evidence"],
        });
    }
    if (
      (value.product === null && !["CASHBACK", "COUPON", "PRIZE_DRAW"].includes(value.offerType)) ||
      (value.product !== null &&
        value.benefits.some(
          (benefit) => !benefit.eligibleProductKeys.includes(value.product?.key ?? ""),
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "Benefits must apply to this exact product",
        path: ["product"],
      });
  });
export type OfferDiscovery = z.infer<typeof DiscoverySchema>;
export type OfferType = (typeof OFFER_TYPES)[number];
export const UNKNOWN_ELIGIBILITY: OfferDiscovery["eligibility"] = {
  minimumSpendMinor: null,
  coupon: null,
  paymentMethod: null,
  bankOrCard: null,
  channel: null,
  location: null,
  usageLimit: null,
  combinability: "UNKNOWN",
  cashbackBasis: null,
  cashbackTiming: null,
  mandatoryChargesMinor: null,
};

export function normalizeSearch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim();
}
const aliases = [
  ["fridge", "refrigerator", "फ्रिज"],
  ["tv", "television", "टिभी"],
  ["washing machine", "washer", "लुगा धुने मेसिन", "washing meshin"],
  ["combo", "bundle", "gift", "free", "उपहार"],
];
export function searchTokens(text: string): string[][] {
  let normalized = normalizeSearch(text);
  aliases.forEach((group, index) => {
    for (const alias of group)
      normalized = normalized.replace(
        new RegExp(`(?<![\\p{L}\\p{N}])${alias}(?![\\p{L}\\p{N}])`, "gu"),
        ` alias${index} `,
      );
  });
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      /^alias\d$/.test(token) ? [...(aliases[Number(token.slice(5))] ?? [token])] : [token],
    );
}
export function parseBudgetIntent(text: string): { text: string; maxPriceMinor: number | null } {
  const normalized = normalizeSearch(text);
  const match =
    /\b(?:under|below|up to)\s+(?:rs\.?\s*|npr\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(k)?\b/.exec(
      normalized,
    );
  if (!match) return { text: normalized, maxPriceMinor: null };
  const budget = Math.round(Number(match[1]?.replaceAll(",", "")) * (match[2] ? 1000 : 1) * 100);
  return {
    text: normalized.replace(match[0], "").trim(),
    maxPriceMinor: Number.isSafeInteger(budget) ? budget : null,
  };
}
