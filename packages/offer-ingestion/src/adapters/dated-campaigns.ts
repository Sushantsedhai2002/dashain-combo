import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { flightObjects, readFlightRecords } from "./flight-records.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";

export const DATED_CAMPAIGNS = [
  { id: "maxell", merchant: "Maxell", url: "https://maxell.com.np/dashain-tihar-offer" },
  {
    id: "proud-nepal",
    merchant: "Proud Nepal",
    url: "https://proudnepal.com.np/offers/dashian-tihar-offer",
  },
] as const;
export const MAXELL_COLLECTION = "https://maxell.com.np/category/dashain-offer";
type Profile = (typeof DATED_CAMPAIGNS)[number];

export function extractDatedCampaign(
  profile: Profile,
  html: string,
  fetchedAt: string,
  context?: Readonly<{ campaignHtml: string; url: string }>,
): readonly CandidateOffer[] | null {
  const records = readFlightRecords(html);
  if (!records) return null;
  const objects = flightObjects(records);
  const $ = load(html);
  const campaignObjects = context
    ? flightObjects(readFlightRecords(context.campaignHtml) ?? [])
    : objects;
  if (context) {
    const url = new URL(context.url);
    const root = load(context.campaignHtml);
    if (
      profile.id !== "maxell" ||
      url.origin !== new URL(MAXELL_COLLECTION).origin ||
      url.pathname !== new URL(MAXELL_COLLECTION).pathname ||
      url.hash ||
      !/^(?:|\?page=[2-5])$/.test(url.search) ||
      $("h1").text().trim() !== "Dashain Offer" ||
      !root('a[href="/category/dashain-offer"]')
        .toArray()
        .some((e) => root(e).text().trim() === "Dashain Offer")
    )
      return null;
  }
  let startsAt: string | null = null;
  let endsAt: string;
  let originalDateText: string;
  if (profile.id === "maxell") {
    const campaigns = campaignObjects.filter(
      (o) =>
        o.slug === "dashain-tihar-offer" &&
        typeof o.starts_at === "string" &&
        typeof o.ends_at === "string" &&
        /dashain/i.test(String(o.name)),
    );
    if (campaigns.length !== 1) return null;
    if (
      ![campaigns[0]!.starts_at, campaigns[0]!.ends_at].every((value) =>
        Number.isFinite(Date.parse(String(value))),
      )
    )
      return null;
    startsAt = new Date(String(campaigns[0]!.starts_at)).toISOString();
    endsAt = new Date(String(campaigns[0]!.ends_at)).toISOString();
    originalDateText = `${String(campaigns[0]!.starts_at)} – ${String(campaigns[0]!.ends_at)}`;
  } else {
    const campaigns = campaignObjects.filter(
      (o) =>
        o.style === "dashain-tihar" &&
        o.link === new URL(profile.url).pathname &&
        typeof o.endsAt === "string",
    );
    if (campaigns.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(String(campaigns[0]!.endsAt)))
      return null;
    originalDateText = String(campaigns[0]!.endsAt);
    const end = new Date(`${originalDateText}T00:00:00+05:45`);
    if (
      !Number.isFinite(end.getTime()) ||
      new Date(end.getTime() + 345 * 60000).toISOString().slice(0, 10) !== originalDateText
    )
      return null;
    endsAt = new Date(end.getTime() + 86400000).toISOString();
    const displayedEnd = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kathmandu",
    }).format(end);
    if (
      $("h1").text().trim() !== "Dashian - Tihar Offer" ||
      !$("main").text().includes(`Ends ${displayedEnd}`)
    )
      return null;
  }
  const season = new Date(endsAt).getUTCFullYear();
  if (season !== new Date(fetchedAt).getUTCFullYear() || (startsAt && startsAt >= endsAt))
    return null;
  const hash = createHash("sha256").update(html).digest("hex");
  const campaignKey = `${profile.id}-dashain-${season}`;
  const offers: CandidateOffer[] = [];
  const seen = new Set<string>();
  let invalid = false;
  $("article").each((_i, element) => {
    const card = $(element);
    const title = card.find("h3").text().trim();
    const variant = profile.id === "maxell" ? title : (card.find("h3").attr("title") ?? title);
    const href = card.find('a[href^="/product"]').first().attr("href");
    if (!href || !title) return;
    const product = objects.find(
      (o) =>
        typeof o.slug === "string" &&
        href === `/product/${o.slug}` &&
        o.name === title &&
        (context || o.campaign_badge === "Dashain Tihar Offer"),
    );
    if (profile.id === "maxell" && !product) {
      if (context) invalid = true;
      return;
    }
    // A category's unselected variable products cannot provide exact SKU prices.
    if (context && product && (product.type !== "simple" || product.variants_count !== 0)) return;
    if (
      profile.id === "proud-nepal" &&
      !card
        .find("span")
        .toArray()
        .some((e) => $(e).text().trim() === "Dashain-Tihar offer")
    )
      return;
    const original = parseNprPrice(
      card.find(profile.id === "maxell" ? ".line-through" : "del").text(),
    );
    const sale = parseNprPrice(
      card
        .find(profile.id === "maxell" ? '[itemprop="offers"] p' : "span.text-brand-navy.font-bold")
        .text(),
    );
    if (context && card.text().includes("Price unavailable") && original === null && sale === null)
      return;
    // Full-price campaign members do not become discounted offers.
    if (original === null && sale !== null) return;
    const url = new URL(href, profile.url);
    if (
      original === null ||
      sale === null ||
      sale <= 0 ||
      original <= sale ||
      title.length > 300 ||
      url.origin !== new URL(profile.url).origin ||
      url.search ||
      url.hash ||
      seen.has(url.pathname) ||
      (product &&
        (parseNprPrice(`NPR ${String(product.price)}`) !== sale ||
          parseNprPrice(`NPR ${String(product.compare_price)}`) !== original ||
          product.type !== "simple" ||
          product.variants_count !== 0))
    ) {
      invalid = true;
      return;
    }
    seen.add(url.pathname);
    const outOfStock =
      product?.is_in_stock === false ||
      product?.stock_status === "out_of_stock" ||
      /out of stock/i.test(card.text());
    offers.push({
      sourceOfferKey: `${campaignKey}:${product ? String(product.id) : url.pathname}`,
      title,
      productName: title.length <= 200 ? title : null,
      ...inferProductDetails(title, "COMPUTERS_AND_ACCESSORIES"),
      destinationUrl: url.href,
      imageUrl: sellerImageUrl(card.find("img").first().attr("src"), context?.url ?? profile.url),
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      validityStartsAt: startsAt,
      explicitValidityEnd: { kind: "INSTANT", value: endsAt },
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["EXPLICIT_DASHAIN_PRODUCT_MEMBERSHIP", "DATED_RETAILER_CAMPAIGN"],
        campaign: {
          key: campaignKey,
          title: `${profile.merchant} Dashain ${season}`,
          festivals: ["DASHAIN", "TIHAR"],
          seasonAD: season,
          seasonBS: null,
          publishedAt: null,
          startsAt,
          endsAt,
          originalDateText,
          dateCalendar: "AD",
          evidenceUrl: profile.url,
          membership: context ? "ELIGIBLE_CATEGORY" : "EXPLICIT_PRODUCT",
        },
        product: {
          key: url.pathname,
          model: title.split("|")[0]!.trim(),
          variant,
          gtin: null,
          attributes: {},
        },
        merchant: profile.merchant,
        availability: outOfStock ? "OUT_OF_STOCK" : "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          ...(context
            ? [
                {
                  url: profile.url,
                  fetchedAt,
                  contentHash: createHash("sha256").update(context.campaignHtml).digest("hex"),
                  excerpt: `Dashain campaign ${originalDateText}; Dashain Offer collection ${MAXELL_COLLECTION}`,
                  path: "dated campaign; Dashain Offer link",
                  extractorVersion: "maxell-v2",
                  fields: ["campaign", "membership"],
                },
              ]
            : []),
          {
            url: context?.url ?? profile.url,
            fetchedAt,
            contentHash: hash,
            excerpt: `${title}; NPR ${sale / 100}; reference NPR ${original / 100}; Dashain; ${originalDateText}`,
            path: `campaign product ${url.pathname}`,
            extractorVersion: `${profile.id}-v2`,
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
  return invalid || !offers.length ? null : offers;
}

export function createDatedCampaignAdapter(
  profile: Profile,
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: profile.id,
    async scan(source) {
      if (source.id !== profile.id || !source.campaignEntryPoints?.includes(profile.url))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const response = await fetchPage(profile.url, source);
        if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const offers = extractDatedCampaign(profile, response.body, clock().toISOString());
        if (!offers) return { ok: false, reason: "STRUCTURE_CHANGED" };
        if (profile.id !== "maxell" || !source.campaignEntryPoints.includes(MAXELL_COLLECTION))
          return { ok: true, offers, authoritative: true };
        const combined = new Map(offers.map((o) => [o.sourceOfferKey, o]));
        const members = new Set<string>();
        let total: number | null = null;
        for (let pageNumber = 1; pageNumber <= 5; pageNumber++) {
          const url =
            pageNumber === 1 ? MAXELL_COLLECTION : `${MAXELL_COLLECTION}?page=${pageNumber}`;
          const r = await fetchPage(url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const metadata = flightObjects(readFlightRecords(r.body) ?? []).filter(
            (o) =>
              o.current_page === pageNumber &&
              Number.isInteger(o.last_page) &&
              Number.isInteger(o.total) &&
              o.per_page === 20,
          );
          if (
            metadata.length !== 1 ||
            Number(metadata[0]!.last_page) < pageNumber ||
            Number(metadata[0]!.last_page) > 5 ||
            (total !== null && total !== metadata[0]!.total)
          )
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          total = Number(metadata[0]!.total);
          const $ = load(r.body);
          for (const card of $("article").toArray()) {
            const href = $(card).find('a[href^="/product/"]').first().attr("href");
            if (!href) continue;
            if (members.has(href)) return { ok: false, reason: "STRUCTURE_CHANGED" };
            members.add(href);
          }
          const extracted = extractDatedCampaign(profile, r.body, clock().toISOString(), {
            campaignHtml: response.body,
            url,
          });
          if (!extracted) return { ok: false, reason: "STRUCTURE_CHANGED" };
          for (const offer of extracted) {
            const previous = combined.get(offer.sourceOfferKey);
            if (
              previous &&
              (previous.title !== offer.title ||
                previous.salePrice?.amountMinor !== offer.salePrice?.amountMinor ||
                previous.originalPrice?.amountMinor !== offer.originalPrice?.amountMinor ||
                previous.discovery?.availability !== offer.discovery?.availability)
            )
              return { ok: false, reason: "STRUCTURE_CHANGED" };
            if (!previous) combined.set(offer.sourceOfferKey, offer);
          }
          if (pageNumber === metadata[0]!.last_page) {
            if (members.size !== total) return { ok: false, reason: "STRUCTURE_CHANGED" };
            return { ok: true, offers: [...combined.values()], authoritative: true };
          }
          if (
            !$("a")
              .toArray()
              .some((e) => $(e).attr("href") === `/category/dashain-offer?page=${pageNumber + 1}`)
          )
            return { ok: false, reason: "STRUCTURE_CHANGED" };
        }
        return { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
