import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

export const INFOTECHS_CAMPAIGN = "https://infotechsnepal.com.np/dashain-offer/";
export const INFOTECHS_COLLECTIONS = ["laptop-delas", "monitor-deals", "accessories-deal"].map(
  (slug) => `https://infotechsnepal.com.np/offers/${slug}/`,
);

export function extractInfotechsCampaign(
  html: string,
  fetchedAt: string,
  context?: Readonly<{ campaignHtml: string; url: string }>,
): readonly CandidateOffer[] | null {
  const $ = load(html);
  const campaign = context ? load(context.campaignHtml) : $;
  const season = new Date(fetchedAt).getUTCFullYear();
  const updatedAt = campaign('meta[property="og:updated_time"]').attr("content");
  if (
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    Date.parse(updatedAt) > Date.parse(fetchedAt) ||
    new Date(updatedAt).getUTCFullYear() !== season ||
    !campaign("title").text().includes("Dashain Offer") ||
    !campaign(".offer-banner img")
      .toArray()
      .some(
        (e) =>
          campaign(e).attr("src") ===
          `https://infotechsnepal.com.np/wp-content/uploads/${season}/09/dashain.jpg`,
      )
  )
    return null;
  if (context) {
    const base = INFOTECHS_COLLECTIONS.find(
      (url) =>
        context.url === url ||
        new RegExp(`^${url.replaceAll(".", "\\.")}page/[2-9]/$`).test(context.url),
    );
    if (
      !base ||
      !campaign("a")
        .toArray()
        .some(
          (e) => campaign(e).text().trim() === "More Offers" && campaign(e).attr("href") === base,
        ) ||
      !/Dashain/i.test($("h1").parent().parent().text())
    )
      return null;
  }
  const cards = $(context ? ".product-grid > .product" : ".main-offers-section .product");
  if (!cards.length) return null;
  const hash = createHash("sha256").update(html).digest("hex");
  const offers: CandidateOffer[] = [];
  const identities = new Set<string>();
  let invalid = false;
  cards.each((_i, element) => {
    const card = $(element);
    const originalText = card.find(".product-price del .amount").text();
    const saleText = card.find(".product-price ins .amount").text();
    if (!originalText && !saleText) return;
    const title = card.find("a.main_product_title").text().trim().replace(/\s+/g, " ");
    const href = card.find("a.main_product_title").attr("href");
    const id = /(?:^|\s)post-(\d+)(?:\s|$)/.exec(card.attr("class") ?? "")?.[1];
    const original = parseNprPrice(originalText),
      sale = parseNprPrice(saleText);
    if (!card.hasClass("product-type-simple")) return;
    if (
      !href ||
      !id ||
      !title ||
      title.length > 300 ||
      original === null ||
      sale === null ||
      sale <= 0 ||
      original <= sale
    ) {
      invalid = true;
      return;
    }
    const destination = new URL(href);
    if (
      destination.origin !== new URL(INFOTECHS_CAMPAIGN).origin ||
      !destination.pathname.startsWith("/product/") ||
      destination.search ||
      destination.hash ||
      identities.has(id)
    ) {
      invalid = true;
      return;
    }
    identities.add(id);
    const campaignKey = `infotechs-dashain-${season}`;
    const bundle = /combo/i.test(title) && (title.includes(" + ") || title.split("|").length > 2);
    const components = bundle
      ? title
          .split(title.includes(" + ") ? " + " : "|")
          .map((part) => part.trim())
          .filter((part) => part && !/^(?:Inotek Combo Pack|Gaming Combo(?: Kit)?)$/i.test(part))
      : [title];
    if (bundle && components.length < 2) {
      invalid = true;
      return;
    }
    offers.push({
      sourceOfferKey: `${campaignKey}:${id}`,
      title,
      productName: title.length <= 200 ? title : null,
      ...inferProductDetails(title, "COMPUTERS_AND_ACCESSORIES"),
      destinationUrl: destination.href,
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      discovery: {
        offerType: bundle ? "BUNDLE" : "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["EXPLICIT_DASHAIN_PAGE_MEMBERSHIP", "CURRENT_CAMPAIGN_BANNER_AND_UPDATE_DATE"],
        campaign: {
          key: campaignKey,
          title: `InfoTechs Dashain ${season}`,
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: null,
          publishedAt: null,
          startsAt: null,
          endsAt: null,
          originalDateText: `Campaign page updated ${updatedAt}; banner uploaded ${season}/09`,
          dateCalendar: "AD",
          evidenceUrl: INFOTECHS_CAMPAIGN,
          membership: context ? "ELIGIBLE_CATEGORY" : "EXPLICIT_PRODUCT",
        },
        product: {
          key: id,
          model: title.split("|")[0]!.trim(),
          variant: title,
          gtin: null,
          attributes: {},
        },
        merchant: "InfoTechs Nepal",
        availability: card.hasClass("outofstock") ? "OUT_OF_STOCK" : "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: components.map((description, index) => ({
          description,
          quantity: bundle ? null : 1,
          unit: bundle ? null : "item",
          role: index === 0 ? "MAIN_ITEM" : "INCLUDED_ITEM",
        })),
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          ...(context
            ? [
                {
                  url: INFOTECHS_CAMPAIGN,
                  fetchedAt,
                  contentHash: createHash("sha256").update(context.campaignHtml).digest("hex"),
                  excerpt: `Dashain campaign updated ${updatedAt}; current ${season}/09 banner; More Offers links to ${context.url.split("/page/")[0]}`,
                  path: ".main-offers-section a; og:updated_time; .offer-banner",
                  extractorVersion: "infotechs-v2",
                  fields: ["campaign", "membership"],
                },
              ]
            : []),
          {
            url: context?.url ?? INFOTECHS_CAMPAIGN,
            fetchedAt,
            contentHash: hash,
            excerpt: `${title}; ${saleText}; reference ${originalText}; Dashain page updated ${updatedAt}; ${season}/09/dashain.jpg`,
            path: `${context ? ".product-grid" : ".main-offers-section"} post-${id}`,
            extractorVersion: "infotechs-v2",
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
  return invalid || (!context && !offers.length) ? null : offers;
}

export function createInfotechsAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "infotechs-nepal",
    async scan(source) {
      if (
        source.id !== "infotechs-nepal" ||
        !source.campaignEntryPoints?.includes(INFOTECHS_CAMPAIGN)
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const r = await fetchPage(INFOTECHS_CAMPAIGN, source);
        if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const fetchedAt = clock().toISOString();
        const initial = extractInfotechsCampaign(r.body, fetchedAt);
        if (!initial) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers = new Map(initial.map((o) => [o.sourceOfferKey, o]));
        for (const base of INFOTECHS_COLLECTIONS.filter((url) =>
          source.campaignEntryPoints?.includes(url),
        )) {
          const visited = new Set<string>();
          let url: string | null = base;
          while (url) {
            if (visited.has(url) || visited.size >= 9)
              return { ok: false, reason: "STRUCTURE_CHANGED" };
            visited.add(url);
            const response = await fetchPage(url, source);
            if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
            const extracted = extractInfotechsCampaign(response.body, fetchedAt, {
              campaignHtml: r.body,
              url,
            });
            if (!extracted) return { ok: false, reason: "STRUCTURE_CHANGED" };
            for (const offer of extracted) {
              const previous = offers.get(offer.sourceOfferKey);
              if (
                previous &&
                (previous.salePrice?.amountMinor !== offer.salePrice?.amountMinor ||
                  previous.originalPrice?.amountMinor !== offer.originalPrice?.amountMinor ||
                  previous.title !== offer.title)
              )
                return { ok: false, reason: "STRUCTURE_CHANGED" };
              if (!previous) offers.set(offer.sourceOfferKey, offer);
            }
            const page = load(response.body);
            const links = page(".woocommerce-pagination a.next");
            if (links.length > 1) return { ok: false, reason: "STRUCTURE_CHANGED" };
            const next = links.attr("href");
            if (next && !new RegExp(`^${base.replaceAll(".", "\\.")}page/[2-9]/$`).test(next))
              return { ok: false, reason: "STRUCTURE_CHANGED" };
            url = next ?? null;
          }
        }
        return { ok: true, offers: [...offers.values()], partial: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
