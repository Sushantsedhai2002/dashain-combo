import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";

export const SUKUMART_HOME = "https://www.sukumart.com/?v=4cc62c62baa2";
export const SUKUMART_CAMPAIGN =
  "https://www.sukumart.com/product-category/offer/dashain-offer/?orderby=date&v=4cc62c62baa2";

export function extractSukumartPage(
  html: string,
  homepage: string,
  url: string,
  fetchedAt: string,
): { offers: readonly CandidateOffer[]; next: string | null } | null {
  const $ = load(html);
  const home = load(homepage);
  if (
    new Date(fetchedAt).getUTCFullYear() !== 2026 ||
    !home('img[src*="/2026/09/dashain-offer-2083-"]').length ||
    !$("title").text().includes("Dashain Offer")
  )
    return null;
  const cards = $("ul.products > li.product");
  if (!cards.length) return null;
  const offers: CandidateOffer[] = [];
  let invalid = false;
  const hash = createHash("sha256").update(html).digest("hex");
  const campaignHash = createHash("sha256").update(homepage).digest("hex");
  cards.each((_i, element) => {
    const card = $(element);
    if (!card.find(".price del").length) return;
    const title = card.find("h2.woocommerce-loop-product__title").text().trim();
    const href = card.find("a.woocommerce-loop-product__link").attr("href");
    const id = card.find("a[data-product_id]").attr("data-product_id");
    const original = parseNprPrice(card.find(".price del .amount").text());
    const sale = parseNprPrice(card.find(".price ins .amount").text());
    if (
      !href ||
      !id ||
      !title ||
      title.length > 300 ||
      !/^\d+$/.test(id) ||
      !card.find(".product_type_simple").length
    ) {
      invalid = true;
      return;
    }
    const destination = new URL(href);
    if (
      destination.origin !== new URL(SUKUMART_HOME).origin ||
      !destination.pathname.startsWith("/product/") ||
      destination.search ||
      destination.hash ||
      original === null ||
      sale === null ||
      sale <= 0 ||
      original <= sale
    ) {
      invalid = true;
      return;
    }
    offers.push({
      sourceOfferKey: `sukumart-dashain-2026:${id}`,
      title,
      productName: title.length <= 200 ? title : null,
      ...inferProductDetails(title, "GENERAL_RETAIL"),
      destinationUrl: destination.href,
      imageUrl: sellerImageUrl(card.find("img").first().attr("src"), url),
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["CURRENT_SEASON_BANNER", "EXPLICIT_DASHAIN_COLLECTION_MEMBERSHIP"],
        campaign: {
          key: "sukumart-dashain-2026",
          title: "Sukumart Dashain Offer 2083",
          festivals: ["DASHAIN"],
          seasonAD: 2026,
          seasonBS: "2083",
          publishedAt: null,
          startsAt: null,
          endsAt: null,
          originalDateText: "dashain-offer-2083; banner uploaded 2026/09",
          dateCalendar: "BS",
          evidenceUrl: SUKUMART_HOME,
          membership: "EXPLICIT_PRODUCT",
        },
        product: {
          key: id,
          model: title.split("|")[0]!.trim(),
          variant: title,
          gtin: null,
          attributes: {},
        },
        merchant: "Sukumart",
        availability: card.hasClass("outofstock") ? "OUT_OF_STOCK" : "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: SUKUMART_HOME,
            fetchedAt,
            contentHash: campaignHash,
            excerpt: "dashain-offer-2083; 2026/09 campaign banner",
            path: "img.src",
            extractorVersion: "sukumart-v1",
            fields: ["campaign"],
          },
          {
            url,
            fetchedAt,
            contentHash: hash,
            excerpt: `${title}; sale NPR ${sale / 100}; reference NPR ${original / 100}; Dashain Offer collection`,
            path: `ul.products product=${id}`,
            extractorVersion: "sukumart-v1",
            fields: [
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
  const links = $(".woocommerce-pagination a.next");
  if (links.length > 1) return null;
  const next = links.attr("href");
  if (
    next &&
    !/^https:\/\/www\.sukumart\.com\/product-category\/offer\/dashain-offer\/page\/(?:[2-9]|1\d|20)\/\?orderby=date&v=4cc62c62baa2$/.test(
      next,
    )
  )
    return null;
  return invalid ? null : { offers, next: next ?? null };
}

export function createSukumartAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "sukumart",
    async scan(source) {
      if (
        source.id !== "sukumart" ||
        ![SUKUMART_HOME, SUKUMART_CAMPAIGN].every((u) => source.campaignEntryPoints?.includes(u))
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const home = await fetchPage(SUKUMART_HOME, source);
        if (home.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const fetchedAt = clock().toISOString();
        const offers: CandidateOffer[] = [];
        const visited = new Set<string>();
        let url: string | null = SUKUMART_CAMPAIGN;
        while (url) {
          if (visited.has(url) || visited.size >= 20)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          visited.add(url);
          const response = await fetchPage(url, source);
          if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const page = extractSukumartPage(response.body, home.body, url, fetchedAt);
          if (!page) return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push(...page.offers);
          url = page.next;
        }
        if (new Set(offers.map((o) => o.sourceOfferKey)).size !== offers.length)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        return { ok: true, offers, authoritative: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
