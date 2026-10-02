import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { flightObjects, isRecord, readFlightRecords } from "./flight-records.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";

export const IT_MONSTER_CAMPAIGN_URL = "https://itmonster.com.np/dashain-offers";

function campaignDate(value: unknown, exclusiveEnd = false): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const date = `${match[3]}-${match[1]}-${match[2]}`;
  const time = new Date(`${date}T00:00:00+05:45`);
  if (!Number.isFinite(time.getTime())) return null;
  const localDate = new Date(time.getTime() + 345 * 60000).toISOString().slice(0, 10);
  if (localDate !== date) return null;
  return new Date(time.getTime() + (exclusiveEnd ? 86400000 : 0)).toISOString();
}

export function extractItMonsterCampaign(
  html: string,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  const records = readFlightRecords(html);
  if (!records) return null;
  const objects = flightObjects(records);
  // Only the retailer's Redux festival configuration establishes dates and season.
  const configs = objects
    .map((object) => object.reduxOptions)
    .filter(isRecord)
    .filter((config) => config.festival_mode_enabled === "1");
  if (configs.length !== 1) return null;
  const config = configs[0]!;
  const startsAt = campaignDate(config.festival_start_date);
  const endsAt = campaignDate(config.festival_end_date, true);
  if (
    !startsAt ||
    !endsAt ||
    startsAt >= endsAt ||
    new Date(startsAt).getUTCFullYear() !== new Date(fetchedAt).getUTCFullYear() ||
    !/dashami/i.test(String(config.festival_highlight_label))
  )
    return null;
  const $ = load(html);
  if ($("h2").filter((_i, el) => $(el).text().trim() === "Dashain Deals").length !== 1) return null;
  const products = objects.map((object) => object.product).filter(isRecord);
  const offers: CandidateOffer[] = [];
  const seen = new Set<string>();
  const hash = createHash("sha256").update(html).digest("hex");
  const season = new Date(startsAt).getUTCFullYear();
  const campaignKey = `it-monster-dashain-${season}`;
  let invalid = false;
  $("div.group.bg-card").each((_index, element) => {
    const card = $(element);
    if (
      !card
        .find("span")
        .toArray()
        .some((el) => $(el).text().trim() === "🪔DASHAIN")
    )
      return;
    const title = card.find("h3").text().trim().replace(/\s+/g, " ");
    const href = card.find("h3").parent("a").attr("href");
    const product = products.find(
      (entry) =>
        entry.url === href &&
        typeof entry.name === "string" &&
        entry.name.trim().replace(/\s+/g, " ") === title,
    );
    if (!product || !isRecord(product.price) || !href || !title || title.length > 300) {
      invalid = true;
      return;
    }
    const url = new URL(href, IT_MONSTER_CAMPAIGN_URL);
    const original = parseNprPrice(card.find("span.line-through").text());
    const sale = parseNprPrice(card.find("div.mt-2 > span.font-bold").text());
    if (
      url.origin !== new URL(IT_MONSTER_CAMPAIGN_URL).origin ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/product/") ||
      url.search ||
      original === null ||
      sale === null ||
      sale <= 0 ||
      original <= sale ||
      parseNprPrice(`NPR ${String(product.price.regular)}`) !== original ||
      parseNprPrice(`NPR ${String(product.price.sale)}`) !== sale ||
      seen.has(url.pathname)
    ) {
      invalid = true;
      return;
    }
    seen.add(url.pathname);
    const key = url.pathname;
    offers.push({
      sourceOfferKey: `${campaignKey}:${String(product.id)}`,
      title,
      productName: title.length <= 200 ? title : null,
      ...inferProductDetails(title, "COMPUTERS_AND_ACCESSORIES"),
      destinationUrl: url.href,
      imageUrl: sellerImageUrl(card.find("img").first().attr("src"), IT_MONSTER_CAMPAIGN_URL),
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      validityStartsAt: startsAt,
      explicitValidityEnd: { kind: "INSTANT", value: endsAt },
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["EXPLICIT_DASHAIN_PRODUCT_BADGE", "DATED_RETAILER_CAMPAIGN"],
        campaign: {
          key: campaignKey,
          title: `IT Monster Dashain ${season}`,
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: null,
          publishedAt: null,
          startsAt,
          endsAt,
          originalDateText: `${String(config.festival_start_date)} – ${String(config.festival_end_date)}`,
          dateCalendar: "AD",
          evidenceUrl: IT_MONSTER_CAMPAIGN_URL,
          membership: "EXPLICIT_PRODUCT",
        },
        product: {
          key,
          model: title.split("|")[0]!.trim(),
          variant: title,
          gtin: null,
          attributes: {},
        },
        merchant: "IT Monster",
        availability:
          product.inStock === false || product.stockStatus === "outofstock"
            ? "OUT_OF_STOCK"
            : product.inStock === true && Number(product.stockQuantity) > 0
              ? "IN_STOCK"
              : "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: IT_MONSTER_CAMPAIGN_URL,
            fetchedAt,
            contentHash: hash,
            excerpt: `${title}; ${card.find("div.mt-2 > span.font-bold").text()}; ${card.find("span.line-through").text()}; DASHAIN; ${String(config.festival_start_date)} – ${String(config.festival_end_date)}`,
            path: `Dashain Deals product=${String(product.id)}; reduxOptions.festival_*`,
            extractorVersion: "it-monster-v1",
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

export function createItMonsterAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "it-monster",
    async scan(source) {
      if (
        source.id !== "it-monster" ||
        !source.campaignEntryPoints?.includes(IT_MONSTER_CAMPAIGN_URL)
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const response = await fetchPage(IT_MONSTER_CAMPAIGN_URL, source);
        if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const offers = extractItMonsterCampaign(response.body, clock().toISOString());
        return offers
          ? { ok: true, offers, authoritative: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
