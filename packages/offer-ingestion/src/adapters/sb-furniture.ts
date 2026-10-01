import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";

export const SB_CAMPAIGN_URL = "https://sbfurniturenepal.com/shop/category/dashain-sale-2083-10442";

export function extractSbCampaign(
  html: string,
  url: string,
  fetchedAt: string,
): {
  offers: readonly CandidateOffer[];
  next: string | null;
  total: number;
} | null {
  const $ = load(html);
  const season = new Date(fetchedAt).getUTCFullYear();
  if (
    season !== 2026 ||
    !$("title").text().includes("Dashain Sale - 2083") ||
    !$("body").text().includes("Dashain Sale - 2026")
  )
    return null;
  const totals = [
    ...$("body")
      .text()
      .matchAll(/(\d+) items found\./g),
  ].map((m) => Number(m[1]));
  const total = totals[0];
  if (!total || total > 500 || totals.some((n) => n !== total)) return null;
  const hash = createHash("sha256").update(html).digest("hex");
  const offers: CandidateOffer[] = [];
  let invalid = false;
  $("#products_grid .tp-product-item").each((_i, element) => {
    const card = $(element);
    const title = card.find(".tp-product-title a").text().trim();
    const href = card.find(".tp-product-title a").attr("href");
    const id = card.attr("data-product-template-id");
    const original = parseNprPrice(card.find('[aria-label="Original price"]').text());
    const sale = parseNprPrice(card.find('[aria-label="Sale price"]').text());
    if (
      !href ||
      !id ||
      !/^\d+$/.test(id) ||
      !title ||
      title.length > 300 ||
      !card.find(".tp-product-label").text().includes("Dashain Sale")
    ) {
      invalid = true;
      return;
    }
    const destination = new URL(href, url);
    if (
      destination.origin !== new URL(SB_CAMPAIGN_URL).origin ||
      !destination.pathname.startsWith("/shop/dashain-sale-2083-10442/") ||
      destination.search ||
      destination.hash ||
      original === null ||
      sale === null ||
      sale <= 0 ||
      sale >= original
    ) {
      invalid = true;
      return;
    }
    offers.push({
      sourceOfferKey: `sb-dashain-2026:${id}`,
      title,
      productName: title.length <= 200 ? title : null,
      category: "HOME_AND_FURNITURE",
      brandName: "SB Furniture",
      destinationUrl: destination.href,
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["CURRENT_SEASON_COLLECTION", "EXPLICIT_DASHAIN_PRODUCT_BADGE"],
        campaign: {
          key: "sb-dashain-2026",
          title: "SB Furniture Dashain Sale 2083",
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: "2083",
          publishedAt: null,
          startsAt: null,
          endsAt: null,
          originalDateText: "Dashain Sale - 2083; Dashain Sale - 2026",
          dateCalendar: "BS",
          evidenceUrl: SB_CAMPAIGN_URL,
          membership: "EXPLICIT_PRODUCT",
        },
        product: { key: id, model: title, variant: title, gtin: null, attributes: {} },
        merchant: "SB Furniture Nepal",
        availability: /out of stock/i.test(card.text()) ? "OUT_OF_STOCK" : "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url,
            fetchedAt,
            contentHash: hash,
            excerpt: `${title}; ${card.find('[aria-label="Sale price"]').text().trim()}; reference ${card.find('[aria-label="Original price"]').text().trim()}; Dashain Sale 2083/2026`,
            path: `#products_grid template=${id}`,
            extractorVersion: "sb-furniture-v1",
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
  });
  const links = $("a.tp-load-more-btn");
  if (links.length > 1) return null;
  const next = links.attr("href");
  if (next && !/^\/shop\/category\/dashain-sale-2083-10442\/page\/(?:[2-9]|1\d|2[0-5])$/.test(next))
    return null;
  return invalid || !offers.length
    ? null
    : { offers, next: next ? new URL(next, url).href : null, total };
}

export function createSbFurnitureAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "sb-furniture",
    async scan(source) {
      if (source.id !== "sb-furniture" || !source.campaignEntryPoints?.includes(SB_CAMPAIGN_URL))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString();
        const offers: CandidateOffer[] = [];
        const visited = new Set<string>();
        let url: string | null = SB_CAMPAIGN_URL;
        let total: number | null = null;
        while (url) {
          if (visited.has(url) || visited.size >= 25)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          visited.add(url);
          const response = await fetchPage(url, source);
          if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const page = extractSbCampaign(response.body, url, fetchedAt);
          if (!page || (total !== null && page.total !== total))
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          total = page.total;
          offers.push(...page.offers);
          url = page.next;
        }
        if (offers.length !== total || new Set(offers.map((o) => o.sourceOfferKey)).size !== total)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        return { ok: true, offers, authoritative: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
