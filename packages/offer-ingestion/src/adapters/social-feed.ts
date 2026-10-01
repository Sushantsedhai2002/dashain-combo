import { createHash } from "node:crypto";
import { z } from "zod";
import { UNKNOWN_ELIGIBILITY, type OfferCategory } from "@dashain-offer/offer-catalog";
import { isRegisteredSocialPost, type SourceDefinition } from "@dashain-offer/source-registry";
import type { CandidateOffer, SourceAdapter, ScanResult } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";

const text = (max: number) => z.string().trim().min(1).max(max);
const url = z
  .url()
  .startsWith("https://")
  .max(2048)
  .refine((value) => {
    const u = new URL(value);
    return !u.username && !u.password;
  });
const instant = z.iso.datetime({ offset: true });
const Feed = z
  .object({
    version: z.literal(1),
    offers: z
      .array(
        z
          .object({
            socialPost: z.object({ accountUrl: url, url }).strict(),
            publishedAt: instant,
            verifiedAt: instant,
            campaign: z
              .object({
                key: text(100),
                title: text(300),
                festivals: z
                  .array(z.enum(["DASHAIN", "TIHAR"]))
                  .min(1)
                  .max(2)
                  .refine((festivals) => festivals.includes("DASHAIN")),
                seasonAD: z.number().int().min(2000).max(2200),
                startsAt: instant.nullable(),
                endsAt: instant.nullable(),
              })
              .strict(),
            product: z
              .object({
                key: text(90),
                model: text(200),
                variant: text(200),
                title: text(200),
                brand: text(200),
                destinationUrl: url,
                category: z.enum([
                  "GENERAL_RETAIL",
                  "MOBILE_AND_TABLETS",
                  "COMPUTERS_AND_ACCESSORIES",
                  "CONSUMER_ELECTRONICS",
                  "HOME_APPLIANCES",
                  "FASHION_AND_LIFESTYLE",
                  "AUTOMOTIVE",
                  "OTHER",
                ]),
              })
              .strict(),
            originalPriceMinor: z.number().int().positive().safe(),
            salePriceMinor: z.number().int().positive().safe(),
            availability: z.enum(["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]),
            terms: text(2000).nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();

/** Read merchant-attested structured promotions; never infer prices from captions. */
export function extractSocialFeed(
  body: string,
  feedUrl: string,
  source: SourceDefinition,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = Feed.safeParse(input);
  if (!parsed.success || !source.socialPromotionFeeds?.includes(feedUrl)) return null;
  const now = Date.parse(fetchedAt);
  const offers: CandidateOffer[] = [];
  const keys = new Set<string>();
  for (const row of parsed.data.offers) {
    const key = `${row.campaign.key}:${row.product.key}`;
    const approvedProduct = source.channels.some(
      (channel) =>
        channel.kind === "WEBSITE" &&
        channel.isEnabled &&
        new URL(channel.url).origin === new URL(row.product.destinationUrl).origin,
    );
    if (
      keys.has(key) ||
      !approvedProduct ||
      row.salePriceMinor >= row.originalPriceMinor ||
      !isRegisteredSocialPost(source, row.socialPost.accountUrl, row.socialPost.url) ||
      Date.parse(row.publishedAt) > now ||
      Date.parse(row.verifiedAt) > now ||
      Date.parse(row.verifiedAt) < Date.parse(row.publishedAt) ||
      (row.campaign.startsAt &&
        row.campaign.endsAt &&
        Date.parse(row.campaign.startsAt) >= Date.parse(row.campaign.endsAt))
    )
      return null;
    keys.add(key);
    offers.push({
      sourceOfferKey: key,
      title: row.product.title,
      productName: row.product.title,
      brandName: row.product.brand,
      category: row.product.category as OfferCategory,
      destinationUrl: row.product.destinationUrl,
      originalPrice: { currency: "NPR", amountMinor: row.originalPriceMinor },
      salePrice: { currency: "NPR", amountMinor: row.salePriceMinor },
      discountPercent: Math.round((1 - row.salePriceMinor / row.originalPriceMinor) * 100),
      sourcePublishedAt: { kind: "INSTANT", value: row.publishedAt },
      validityStartsAt: row.campaign.startsAt,
      explicitValidityEnd: row.campaign.endsAt
        ? { kind: "INSTANT", value: row.campaign.endsAt }
        : null,
      terms: row.terms,
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["MERCHANT_SOCIAL_FEED", "EXPLICIT_PRODUCT_PRICE"],
        campaign: {
          ...row.campaign,

          seasonBS: null,
          publishedAt: row.publishedAt,
          originalDateText: null,
          dateCalendar: "AD",
          evidenceUrl: feedUrl,
          membership: "EXPLICIT_PRODUCT",
        },
        product: {
          key: row.product.key,
          model: row.product.model,
          variant: row.product.variant,
          gtin: null,
          attributes: {},
        },
        merchant: source.displayName,
        availability: row.availability,
        lastVerifiedAt: row.verifiedAt,
        priceObservedAt: row.verifiedAt,
        components: [
          { description: row.product.title, quantity: 1, unit: "item", role: "MAIN_ITEM" },
        ],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: feedUrl,
            fetchedAt,
            contentHash: createHash("sha256").update(body).digest("hex"),
            excerpt: JSON.stringify(row).slice(0, 2000),
            path: `offers product=${row.product.key}`,
            extractorVersion: "social-feed-v1",
            socialPost: row.socialPost,
            fields: [
              "campaign",
              "membership",
              "product",
              "salePrice",
              "originalPrice",
              "offerType",
              "components",
            ],
          },
        ],
      },
    });
  }
  return offers;
}

export function createSocialFeedAdapter(
  sourceId: string,
  fetchPage: PageFetcher,
  clock: () => Date = () => new Date(),
): SourceAdapter {
  return {
    sourceId,
    async scan(source) {
      if (!source.socialPromotionFeeds?.length) return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      const offers: CandidateOffer[] = [];
      for (const url of source.socialPromotionFeeds) {
        try {
          const response = await fetchPage(url, source);
          if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const result = extractSocialFeed(response.body, url, source, clock().toISOString());
          if (!result) return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push(...result);
        } catch {
          return { ok: false, reason: "NETWORK_ERROR" };
        }
      }
      return mergeScans([{ ok: true, offers, authoritative: true }]);
    },
  };
}

function mergeScans(results: readonly ScanResult[]): ScanResult {
  const policy = (offer: CandidateOffer) => {
    const d = offer.discovery;
    const campaign = d?.campaign;
    return JSON.stringify([
      offer.originalPrice ?? null,
      offer.salePrice ?? null,
      offer.destinationUrl,
      offer.brandName ?? null,
      d?.product ?? null,
      campaign
        ? [
            campaign.key,
            campaign.membership,
            campaign.seasonAD,
            campaign.seasonBS,
            [...campaign.festivals].sort(),
            campaign.startsAt,
            campaign.endsAt,
          ]
        : null,
      offer.validityStartsAt ?? null,
      offer.explicitValidityEnd ?? null,
      offer.sourcePublishedAt ?? null,
      d?.qualification ?? null,
      d?.offerType ?? null,
      d?.availability ?? "UNKNOWN",
      d?.eligibility ?? null,
      d?.components ?? null,
      d?.benefits ?? null,
      offer.terms ?? null,
    ]);
  };
  const offers = new Map<string, CandidateOffer>();
  for (const result of results) {
    if (!result.ok) continue;
    for (const offer of result.offers) {
      const previous = offers.get(offer.sourceOfferKey);
      if (previous && policy(previous) !== policy(offer))
        return { ok: false, reason: "STRUCTURE_CHANGED" };
      if (!previous) offers.set(offer.sourceOfferKey, offer);
    }
  }
  if (results.every((result) => !result.ok)) return results[0]!;
  return {
    ok: true,
    offers: [...offers.values()],
    partial: results.some((result) => !result.ok || result.partial),
    authoritative: results.every((result) => result.ok && result.authoritative === true),
  };
}

export function withSocialFeed(adapter: SourceAdapter, fetchPage: PageFetcher): SourceAdapter {
  return {
    sourceId: adapter.sourceId,
    async scan(source) {
      if (!source.socialPromotionFeeds?.length) return adapter.scan(source);
      // One scan per identity keeps removal confirmation scoped to all collection channels.
      const website = await adapter.scan(source);
      const social = await createSocialFeedAdapter(source.id, fetchPage).scan(source);
      return mergeScans([website, social]);
    },
  };
}
