import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY, type OfferDiscovery } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";

export const LG_CAMPAIGN_URL =
  "https://cgdigital.com.np/offers/lg-dashain-tihar-offer-83/index.html";
// A reviewed season label, not a general BS-to-AD conversion.
const CAMPAIGN_KEY = "lg-dashain-tihar-2083";
function productImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.origin === new URL(LG_CAMPAIGN_URL).origin &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/api/images/products/") &&
      url.pathname.length > "/api/images/products/".length &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function extractLgCampaign(
  html: string,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  const $ = load(html);
  const heading = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (!/LG.*Dashain.*Tihar.*2083/i.test(heading) || $("table.table-wm tbody tr").length === 0)
    return null;
  const hash = createHash("sha256").update(html).digest("hex");
  const offers: CandidateOffer[] = [];
  const structuredPrices = new Map<string, Set<number>>();
  const structuredImages = new Map<string, Set<string>>();
  $("script[type='application/ld+json']").each((_index, script) => {
    try {
      const value: unknown = JSON.parse($(script).text());
      if (
        typeof value !== "object" ||
        value === null ||
        !("@graph" in value) ||
        !Array.isArray(value["@graph"])
      )
        return;
      for (const product of value["@graph"] as unknown[]) {
        if (
          typeof product !== "object" ||
          product === null ||
          !("model" in product) ||
          typeof product.model !== "string" ||
          !("offers" in product) ||
          typeof product.offers !== "object" ||
          product.offers === null ||
          !("price" in product.offers) ||
          !("priceCurrency" in product.offers) ||
          product.offers.priceCurrency !== "NPR"
        )
          continue;
        const price = parseNprPrice(`NPR ${String(product.offers.price)}`);
        if (price === null) continue;
        const prices = structuredPrices.get(product.model) ?? new Set<number>();
        prices.add(price);
        structuredPrices.set(product.model, prices);
        const image = "image" in product ? productImage(product.image) : null;
        if (image !== null) {
          const images = structuredImages.get(product.model) ?? new Set<string>();
          images.add(image);
          structuredImages.set(product.model, images);
        }
      }
    } catch {
      /* The visible table remains the primary evidence when JSON is malformed. */
    }
  });
  const giftRules = [
    {
      type: /^Front Loading Washing Machine$/i,
      anchor: "frontload",
      quantity: 6,
      phrase: /6\s*kg\s*surf excel.*free/i,
    },
    {
      type: /^Top Loading Washing Machine$/i,
      anchor: "topload",
      quantity: 4,
      phrase: /free\s*4\s*kg\s*surf excel/i,
    },
    {
      type: /^(?:Twin Tub|Semi.Automatic) Washing Machine$/i,
      anchor: "topload",
      quantity: 2,
      phrase: /free\s*2\s*kg\s*surf excel/i,
    },
  ];
  $("table.table-wm tbody tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length !== 5) return;
    const type = cells.eq(0).text().trim();
    const title = cells.eq(1).text().trim().replace(/\s+/g, " ");
    const model = cells.eq(2).text().trim();
    const href = cells.eq(1).find("a").attr("href");
    if (!href || !model || !title) return;
    let destination: URL;
    try {
      destination = new URL(href, LG_CAMPAIGN_URL);
    } catch {
      return;
    }
    if (
      destination.origin !== new URL(LG_CAMPAIGN_URL).origin ||
      destination.username ||
      destination.password ||
      !destination.pathname.startsWith("/api/product-")
    )
      return;
    const original = parseNprPrice(`NPR ${cells.eq(3).text().trim()}`);
    const sale = parseNprPrice(`NPR ${cells.eq(4).text().trim()}`);
    if (sale === null || sale <= 0 || original === null || original < sale) return;
    const otherPrices = structuredPrices.get(model);
    if (otherPrices && [...otherPrices].some((price) => price !== sale)) return;
    const images = structuredImages.get(model);
    const imageUrl = images?.size === 1 ? (images.values().next().value ?? null) : null;
    const rule = giftRules.find((entry) => entry.type.test(type));
    const giftText = rule
      ? $("li")
          .filter(
            (_i, li) =>
              $(li).find(`a[href='#${rule.anchor}']`).length > 0 && rule.phrase.test($(li).text()),
          )
          .first()
          .text()
          .trim()
          .replace(/\s+/g, " ")
      : "";
    // Washer/dryer and ambiguous category eligibility receive no inferred gift.
    const hasGift = giftText.length > 0;
    const productKey = destination.pathname;
    const excerpt = cells.text().replace(/\s+/g, " ").trim();
    const discovery: OfferDiscovery = {
      offerType: hasGift ? "GIFT_WITH_PURCHASE" : "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "campaign-v1",
      reasons: ["EXPLICIT_CAMPAIGN_TABLE", ...(hasGift ? ["CATEGORY_GIFT_RULE"] : [])],
      campaign: {
        key: CAMPAIGN_KEY,
        title: heading,
        festivals: ["DASHAIN", "TIHAR"],
        seasonAD: 2026,
        seasonBS: "2083",
        publishedAt: null,
        startsAt: null,
        endsAt: null,
        originalDateText: "Limited time only; contact CG Digital for exact expiry",
        dateCalendar: "UNKNOWN",
        evidenceUrl: LG_CAMPAIGN_URL,
        membership: "EXPLICIT_PRODUCT",
      },
      product: { key: productKey, model, variant: model, gtin: null, attributes: { type } },
      merchant: "CG Digital",
      availability: "UNKNOWN",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [
        { description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" },
        ...(hasGift && rule
          ? [
              {
                description: "Surf Excel detergent",
                quantity: rule.quantity,
                unit: "kg",
                role: "GIFT" as const,
              },
            ]
          : []),
      ],
      benefits:
        hasGift && rule
          ? [
              {
                type: "GIFT_WITH_PURCHASE",
                description: `${rule.quantity} kg Surf Excel detergent`,
                status: "CONDITIONAL",
                amountMinor: null,
                percent: null,
                capMinor: null,
                eligibleProductKeys: [productKey],
                conditions:
                  "Gifts may vary by product and stock availability; confirm with CG Digital.",
              },
            ]
          : [],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      evidence: [
        {
          url: LG_CAMPAIGN_URL,
          fetchedAt,
          contentHash: hash,
          excerpt: `${heading}; ${excerpt}; ${giftText}`.slice(0, 2000),
          path: `table.table-wm model=${model}`,
          extractorVersion: "cg-lg-v1",
          fields: [
            "offerType",
            "campaign",
            "membership",
            "product",
            "salePrice",
            "originalPrice",
            "components",
            ...(hasGift ? ["benefits"] : []),
          ],
        },
      ],
    };
    offers.push({
      sourceOfferKey: `${CAMPAIGN_KEY}:${model}`,
      title: `LG ${title}`,
      productName: title,
      brandName: "LG",
      category: "HOME_APPLIANCES",
      imageUrl,
      destinationUrl: destination.href,
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round(((original - sale) / original) * 100),
      discovery,
    });
  });
  // Duplicate model rows with conflicting prices must not publish either claim.
  return offers.filter(
    (offer) => offers.filter((other) => other.sourceOfferKey === offer.sourceOfferKey).length === 1,
  );
}
export function createCgDigitalAdapter(
  fetchPage: PageFetcher,
  clock: () => Date = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "cg-digital",
    async scan(source) {
      if (!source.campaignEntryPoints?.includes(LG_CAMPAIGN_URL))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const response = await fetchPage(LG_CAMPAIGN_URL, source);
        if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const offers = extractLgCampaign(response.body, clock().toISOString());
        return offers === null || offers.length === 0
          ? { ok: false, reason: "STRUCTURE_CHANGED" }
          : { ok: true, offers, authoritative: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
