import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";

const ORIGIN = "https://maskqueenprofessional.com";
export const MASK_CAMPAIGN = `${ORIGIN}/pages/dashain-sale-2026-new`;
export const MASK_COLLECTION = `${ORIGIN}/collections/dashain-online-sale`;
type Member = Readonly<{ url: string; title: string; sale: number; original: number }>;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function maskCampaign(html: string, fetchedAt: string) {
  const $ = load(html),
    season = new Date(fetchedAt).getUTCFullYear();
  const body = $("main").text().replace(/\s+/g, " ");
  const date = `Sep 15 - Oct 10, ${season}`;
  if (
    !body.includes("DASHAINSALE") ||
    !body.includes(date) ||
    !$("main a")
      .toArray()
      .some((e) => $(e).attr("href") === "/collections/dashain-online-sale?sort_by=price-ascending")
  )
    return null;
  const startsAt = `${season}-09-14T18:15:00.000Z`,
    endsAt = `${season}-10-10T18:14:59.999Z`;
  if (Date.parse(fetchedAt) < Date.parse(startsAt) || Date.parse(fetchedAt) > Date.parse(endsAt))
    return null;
  return { season, startsAt, endsAt, date };
}
export function maskMembers(html: string): readonly Member[] | null {
  const $ = load(html),
    cards = $("#product-grid > li");
  if (!$("h1").text().includes("Dashain Online Sale") || !cards.length || cards.length > 20)
    return null;
  const members: Member[] = [],
    seen = new Set<string>();
  for (const e of cards.toArray()) {
    const c = $(e),
      a = c.find("h3.h5 a"),
      title = a.text().trim();
    const sale = parseNprPrice(c.find(".price-item--sale").text()),
      original = parseNprPrice(c.find(".price__sale s").text());
    // Omit from-prices, full-price products and zero/invalid compare-at placeholders.
    if (sale === null || original === null || sale <= 0 || original <= sale) continue;
    // A product can remain in the collection after its Dashain badge is removed.
    if (
      !c
        .find(".badge")
        .toArray()
        .some((e) => $(e).text().trim() === "Dashain Rate")
    )
      continue;
    const href = a.attr("href");
    if (a.length !== 1 || !href || !title || title.length > 200) return null;
    const url = new URL(href, ORIGIN);
    if (
      url.origin !== ORIGIN ||
      !/^\/products\/[^/]+$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      seen.has(url.href)
    )
      return null;
    seen.add(url.href);
    members.push({ url: url.href, title, sale, original });
  }
  return members;
}
export function extractMaskVariants(
  campaignHtml: string,
  html: string,
  member: Member,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  const campaign = maskCampaign(campaignHtml, fetchedAt);
  if (!campaign) return null;
  const $ = load(html),
    main = $("product-info");
  if (
    main.length !== 1 ||
    main.find("h1").text().trim() !== member.title ||
    $('link[rel="canonical"]').attr("href") !== member.url ||
    parseNprPrice(main.find(".price__sale .price-item--sale").first().text()) !== member.sale ||
    parseNprPrice(main.find(".price__sale s").first().text()) !== member.original
  )
    return null;
  const selector = main.find("variant-selects"),
    scripts = selector.find('script[type="application/json"]');
  let variants: unknown;
  try {
    variants = JSON.parse(scripts.text());
  } catch {
    return null;
  }
  if (
    scripts.length !== 1 ||
    !Array.isArray(variants) ||
    !variants.length ||
    variants.length > 100 ||
    selector.find("fieldset").length !== 1
  )
    return null;
  const radios = selector.find('input[type="radio"]');
  if (radios.length !== variants.length) return null;
  const data: Record<string, unknown>[] = [];
  for (const e of $('script[type="application/ld+json"]').toArray()) {
    try {
      const v: unknown = JSON.parse($(e).text());
      if (record(v) && v["@type"] === "Product") data.push(v);
    } catch {
      return null;
    }
  }
  const ld = data[0];
  if (
    data.length !== 1 ||
    !ld ||
    ld.name !== member.title ||
    ld.url !== member.url ||
    !Array.isArray(ld.offers) ||
    ld.offers.length !== variants.length ||
    !record(ld.brand) ||
    typeof ld.brand.name !== "string"
  )
    return null;
  const seen = new Set<number>(),
    options = new Set<string>(),
    offers: CandidateOffer[] = [];
  const campaignKey = `mask-queen-dashain-${campaign.season}`;
  for (const v of variants) {
    if (
      !record(v) ||
      typeof v.id !== "number" ||
      !Number.isSafeInteger(v.id) ||
      v.id <= 0 ||
      seen.has(v.id) ||
      typeof v.title !== "string" ||
      !v.title ||
      v.title.length > 200 ||
      options.has(v.title) ||
      !Array.isArray(v.options) ||
      v.options.length !== 1 ||
      v.options[0] !== v.title ||
      typeof v.available !== "boolean" ||
      v.price !== member.sale ||
      v.compare_at_price !== member.original ||
      v.requires_selling_plan !== false
    )
      return null;
    seen.add(v.id);
    options.add(v.title);
    const radiosForOption = radios.filter((_i, e) => $(e).attr("value") === v.title);
    const destinationUrl = `${member.url}?variant=${v.id}`;
    const records = ld.offers.filter((o: unknown) => record(o) && o.url === destinationUrl);
    const structured = records[0];
    if (
      radiosForOption.length !== 1 ||
      radiosForOption.hasClass("disabled") === v.available ||
      records.length !== 1 ||
      !record(structured) ||
      structured.priceCurrency !== "NPR" ||
      parseNprPrice(`NPR ${structured.price}`) !== member.sale ||
      structured.availability !== `http://schema.org/${v.available ? "InStock" : "OutOfStock"}`
    )
      return null;
    if (!v.available) continue;
    const title = `${member.title} | ${v.title}`;
    if (title.length > 300) return null;
    offers.push({
      sourceOfferKey: `${campaignKey}:${v.id}`,
      title,
      productName: member.title,
      brandName: ld.brand.name,
      category: "FASHION_AND_LIFESTYLE",
      destinationUrl,
      originalPrice: { currency: "NPR", amountMinor: member.original },
      salePrice: { currency: "NPR", amountMinor: member.sale },
      discountPercent: Math.round((1 - member.sale / member.original) * 100),
      explicitValidityEnd: { kind: "INSTANT", value: campaign.endsAt },
      terms: "Online sale only; sale items have no refund, return or exchange.",
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: [
          "DATED_DASHAIN_COLLECTION",
          "EXACT_AVAILABLE_VARIANT",
          "UNIFORM_VISIBLE_AND_STRUCTURED_PRICES_AGREE",
        ],
        campaign: {
          key: campaignKey,
          title: `Mask Queen Dashain ${campaign.season}`,
          festivals: ["DASHAIN"],
          seasonAD: campaign.season,
          seasonBS: null,
          publishedAt: null,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          originalDateText: campaign.date,
          dateCalendar: "AD",
          evidenceUrl: MASK_CAMPAIGN,
          membership: "EXPLICIT_PRODUCT",
        },
        product: {
          key: String(v.id),
          model: member.title,
          variant: v.title,
          gtin: null,
          attributes: { option: v.title },
        },
        merchant: "Mask Queen Nepal",
        availability: "IN_STOCK",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: MASK_CAMPAIGN,
            fetchedAt,
            contentHash: createHash("sha256").update(campaignHtml).digest("hex"),
            excerpt: `DASHAINSALE; ${campaign.date}; online only; no refund, return or exchange`,
            path: "dated Dashain Sale heading; collection link",
            extractorVersion: "mask-queen-v1",
            fields: ["campaign", "membership", "offerType", "eligibility"],
          },
          {
            url: member.url,
            fetchedAt,
            contentHash: createHash("sha256").update(html).digest("hex"),
            excerpt: `${title}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}; available variant ${v.id}`,
            path: "product-info; visible price; variant-selects JSON and options; matching JSON-LD variant offer",
            extractorVersion: "mask-queen-v1",
            fields: ["product", "salePrice", "originalPrice", "components"],
          },
        ],
      },
    });
  }
  return offers;
}
export function createMaskQueenAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "mask-queen-nepal",
    async scan(source) {
      if (
        source.id !== "mask-queen-nepal" ||
        !source.campaignEntryPoints?.includes(MASK_CAMPAIGN) ||
        !source.campaignEntryPoints.includes(MASK_COLLECTION)
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          campaign = await fetchPage(MASK_CAMPAIGN, source),
          collection = await fetchPage(MASK_COLLECTION, source);
        if (campaign.status !== 200 || collection.status !== 200)
          return { ok: false, reason: "NETWORK_ERROR" };
        const members = maskMembers(collection.body);
        if (!maskCampaign(campaign.body, fetchedAt) || !members)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members) {
          const r = await fetchPage(member.url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const extracted = extractMaskVariants(campaign.body, r.body, member, fetchedAt);
          if (!extracted) continue;
          offers.push(...extracted);
        }
        // This bounded pilot reads only the first collection page, so absence never proves withdrawal.
        return offers.length
          ? { ok: true, offers, partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
