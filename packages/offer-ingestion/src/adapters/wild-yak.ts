import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
export const WILD_YAK_HOME = "https://wildyakgear.com/";

export function wildYakMembers(html: string, fetchedAt: string): readonly string[] | null {
  const $ = load(html);
  const season = new Date(fetchedAt).getUTCFullYear();
  const headings = $("h2,h3").filter(
    (_i, e) => $(e).text().trim() === `DASHAIN SALE ${season + 57}`,
  );
  if (headings.length !== 1) return null;
  const cards = headings.closest(".e-con-inner").find("li.product");
  if (!cards.length || cards.length > 100) return null;
  const urls: string[] = [];
  for (const card of cards.toArray()) {
    const href = $(card).find("a.woocommerce-LoopProduct-link").first().attr("href");
    if (!href) return null;
    const url = new URL(href, WILD_YAK_HOME);
    if (
      url.origin !== new URL(WILD_YAK_HOME).origin ||
      !/^\/product\/[^/]+\/$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      urls.includes(url.href)
    )
      return null;
    urls.push(url.href);
  }
  return urls;
}

export function extractWildYakVariants(
  homeHtml: string,
  html: string,
  url: string,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  if (!wildYakMembers(homeHtml, fetchedAt)?.includes(url)) return null;
  const $ = load(html);
  const forms = $("form.variations_form");
  const name = $("h1.product_title").text().trim();
  const canonical = $('link[rel="canonical"]').attr("href");
  const raw = forms.attr("data-product_variations");
  if (
    forms.length !== 1 ||
    !name ||
    name.length > 200 ||
    canonical !== url ||
    !raw ||
    raw.length > 1_000_000
  )
    return null;
  let variants: unknown;
  try {
    variants = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(variants) || !variants.length || variants.length > 100) return null;
  const original = parseNprPrice($(".summary > .price del .amount").text());
  const sale = parseNprPrice($(".summary > .price ins .amount").text());
  if (original === null || sale === null || sale <= 0 || original <= sale) return null;
  const selectors = new Map<string, Map<string, string>>();
  for (const select of forms.find("select[name]").toArray()) {
    const attribute = $(select).attr("name")!;
    const values = new Map<string, string>();
    for (const option of $(select).find("option[value]").toArray()) {
      const value = $(option).attr("value")!;
      if (value) values.set(value, $(option).text().trim());
    }
    if (
      !/^attribute_pa_(?:colors|size)$/.test(attribute) ||
      !values.size ||
      selectors.has(attribute)
    )
      return null;
    selectors.set(attribute, values);
  }
  if (selectors.size !== 2) return null;
  const season = new Date(fetchedAt).getUTCFullYear();
  const campaignKey = `wild-yak-dashain-${season}`;
  const identities = new Set<number>();
  const selected = new Set<string>();
  const offers: CandidateOffer[] = [];
  for (const value of variants) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (
      typeof v.variation_id !== "number" ||
      !Number.isSafeInteger(v.variation_id) ||
      v.variation_id <= 0 ||
      identities.has(v.variation_id) ||
      typeof v.is_in_stock !== "boolean" ||
      !v.attributes ||
      typeof v.attributes !== "object" ||
      Array.isArray(v.attributes)
    )
      return null;
    identities.add(v.variation_id);
    if (
      v.variation_is_active !== true ||
      v.variation_is_visible !== true ||
      v.is_purchasable !== true
    )
      continue;
    // Uniform visible parent prices must agree with each exact variant's structured prices.
    if (
      typeof v.display_price !== "number" ||
      typeof v.display_regular_price !== "number" ||
      parseNprPrice(`NPR ${v.display_price}`) !== sale ||
      parseNprPrice(`NPR ${v.display_regular_price}`) !== original
    )
      return null;
    const attributes = v.attributes as Record<string, unknown>;
    if (Object.keys(attributes).length !== selectors.size) return null;
    const destination = new URL(url);
    const labels: string[] = [];
    const productAttributes: Record<string, string> = {};
    for (const [attribute, options] of selectors) {
      const choice = attributes[attribute];
      if (typeof choice !== "string" || !options.has(choice)) return null;
      destination.searchParams.set(attribute, choice);
      labels.push(
        `${attribute === "attribute_pa_colors" ? "Color" : "Size"}: ${options.get(choice)}`,
      );
      productAttributes[attribute === "attribute_pa_colors" ? "color" : "size"] =
        options.get(choice)!;
    }
    const variant = labels.join(" | ");
    if (selected.has(variant)) return null;
    selected.add(variant);
    const title = `${name} | ${variant}`;
    if (title.length > 300) return null;
    offers.push({
      sourceOfferKey: `${campaignKey}:${v.variation_id}`,
      title,
      productName: name,
      brandName: "Wild Yak",
      category: "FASHION_AND_LIFESTYLE",
      destinationUrl: destination.href,
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["EXPLICIT_CURRENT_DASHAIN_SECTION", "EXACT_SELECTED_VARIANT_PRICE"],
        campaign: {
          key: campaignKey,
          title: `Wild Yak Dashain ${season + 57}`,
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: String(season + 57),
          publishedAt: null,
          startsAt: null,
          endsAt: null,
          originalDateText: `DASHAIN SALE ${season + 57}`,
          dateCalendar: "BS",
          evidenceUrl: WILD_YAK_HOME,
          membership: "EXPLICIT_PRODUCT",
        },
        product: {
          key: String(v.variation_id),
          model: name,
          variant,
          gtin: null,
          attributes: productAttributes,
        },
        merchant: "Wild Yak Gear",
        availability: v.is_in_stock ? "IN_STOCK" : "OUT_OF_STOCK",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: WILD_YAK_HOME,
            fetchedAt,
            contentHash: createHash("sha256").update(homeHtml).digest("hex"),
            excerpt: `DASHAIN SALE ${season + 57}; ${name}; ${url}`,
            path: "current Dashain section",
            extractorVersion: "wild-yak-v1",
            fields: ["campaign", "membership"],
          },
          {
            url,
            fetchedAt,
            contentHash: createHash("sha256").update(html).digest("hex"),
            excerpt: `${name}; ${variant}; NPR ${sale / 100}; reference NPR ${original / 100}; variation ${v.variation_id}`,
            path: "form.variations_form data-product_variations; .summary > .price",
            extractorVersion: "wild-yak-v1",
            fields: ["product", "salePrice", "originalPrice", "offerType", "components"],
          },
        ],
      },
    });
  }
  return offers.length ? offers : null;
}
export function createWildYakAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "wild-yak-gear",
    async scan(source) {
      if (source.id !== "wild-yak-gear" || !source.campaignEntryPoints?.includes(WILD_YAK_HOME))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const root = await fetchPage(WILD_YAK_HOME, source);
        if (root.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const fetchedAt = clock().toISOString();
        const members = wildYakMembers(root.body, fetchedAt);
        if (!members) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const url of members) {
          const page = await fetchPage(url, source);
          if (page.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const variants = extractWildYakVariants(root.body, page.body, url, fetchedAt);
          if (!variants) return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push(...variants);
        }
        return { ok: true, offers, partial: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
