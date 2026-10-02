import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";
export const MUDITA_CAMPAIGN = "https://mudita.com.np/dashain-offer";
export function extractMuditaCampaign(
  html: string,
  fetchedAt: string,
): readonly CandidateOffer[] | null {
  const $ = load(html);
  if ($("title").text().trim() !== "Mudita's Dashain Offer on Laptops & Electronics") return null;
  const clocks = $(".mgz-countdown").filter(
    (_i, e) =>
      $(e).find(".mgz-countdown-heading").text().replace(/\s+/g, " ").trim() === "DASHAIN DEALS" &&
      $(e).find(".mgz-countdown-link").attr("href") === MUDITA_CAMPAIGN,
  );
  if (clocks.length !== 1) return null;
  let config: unknown;
  try {
    config = JSON.parse(clocks.attr("data-mage-init") ?? "");
  } catch {
    return null;
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const countdown = (config as Record<string, unknown>)["Magezon_Builder/js/countdown"];
  if (!countdown || typeof countdown !== "object" || Array.isArray(countdown)) return null;
  const rawEnd = (countdown as Record<string, unknown>).time;
  if (
    typeof rawEnd !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T00:00:00\+00:00$/.test(rawEnd) ||
    !Number.isFinite(Date.parse(rawEnd))
  )
    return null;
  const end = new Date(rawEnd),
    season = end.getUTCFullYear();
  if (season !== new Date(fetchedAt).getUTCFullYear() || end.getTime() <= Date.parse(fetchedAt))
    return null;
  const headings = $("#maincontent h2").filter((_i, e) => $(e).text().trim() === "Dashain Deals");
  if (headings.length !== 1) return null;
  const cards = headings.closest(".mgz-element-column").find(".product-item");
  if (!cards.length || cards.length > 1000) return null;
  const endsAt = end.toISOString(),
    campaignKey = `mudita-dashain-${season}`,
    hash = createHash("sha256").update(html).digest("hex");
  const offers = new Map<string, CandidateOffer>();
  const identities = new Map<string, string>();
  for (const element of cards.toArray()) {
    const card = $(element),
      timer = card.find(".deals-timer-wrap .mgz-countdown");
    if (!timer.length) continue;
    // Product clocks without timezone confirm the campaign day; the campaign's explicit UTC deadline controls validity.
    let productClock: unknown;
    try {
      productClock = JSON.parse(timer.attr("data-mage-init") ?? "");
    } catch {
      return null;
    }
    const settings =
      productClock && typeof productClock === "object" && !Array.isArray(productClock)
        ? (productClock as Record<string, unknown>)["Magezon_Builder/js/countdown"]
        : null;
    if (
      timer.length !== 1 ||
      !settings ||
      typeof settings !== "object" ||
      Array.isArray(settings) ||
      typeof (settings as Record<string, unknown>).time !== "string"
    )
      return null;
    // A separate product deadline does not establish membership in this dated campaign.
    if (
      (settings as Record<string, unknown>).time !==
      `${rawEnd.slice(0, 10).replaceAll("-", "/")} 00:00:00`
    )
      continue;
    const saleWrapper = card.find('.special-price [data-price-type="finalPrice"]'),
      originalWrapper = card.find('.old-price [data-price-type="oldPrice"]');
    if (!saleWrapper.length && !originalWrapper.length) continue;
    const links = card.find(".product-item-name .product-item-link"),
      full = links.text().trim().replace(/\s+/g, " "),
      href = links.attr("href");
    const sale = parseNprPrice(saleWrapper.find(".price").text()),
      original = parseNprPrice(originalWrapper.find(".price").text());
    const boxes = card.find(".price-box[data-product-id]"),
      id = boxes.attr("data-product-id");
    if (
      links.length !== 1 ||
      !full ||
      full.length > 2000 ||
      !href ||
      boxes.length !== 1 ||
      !id ||
      !/^\d+$/.test(id) ||
      saleWrapper.length !== 1 ||
      originalWrapper.length !== 1 ||
      sale === null ||
      original === null ||
      sale <= 0 ||
      original <= sale ||
      parseNprPrice(`NPR ${saleWrapper.attr("data-price-amount")}`) !== sale ||
      parseNprPrice(`NPR ${originalWrapper.attr("data-price-amount")}`) !== original
    )
      return null;
    // Omit cards requiring a choice or without a directly listed product identity.
    const form = card.find('form[data-role="tocart-form"]');
    if (
      form.length !== 1 ||
      form.find('[name="product"]').attr("value") !== id ||
      card.find('.swatch-attribute,[name^="super_attribute"]').length
    )
      continue;
    const url = new URL(href, MUDITA_CAMPAIGN);
    if (
      url.origin !== new URL(MUDITA_CAMPAIGN).origin ||
      !/^\/[^/]+\.html$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    const model = full.split(/[|(]/)[0]!.trim();
    const title = full.length <= 300 ? full : model;
    if (!model || model.length > 200 || title.length > 300) return null;
    if (identities.has(url.pathname) && identities.get(url.pathname) !== id) return null;
    identities.set(url.pathname, id);
    const previous = offers.get(id);
    if (
      previous &&
      (previous.title !== title ||
        previous.discovery?.product?.variant !== full ||
        previous.destinationUrl !== url.href ||
        previous.salePrice?.amountMinor !== sale ||
        previous.originalPrice?.amountMinor !== original)
    )
      return null;
    if (previous) continue;
    offers.set(id, {
      sourceOfferKey: `${campaignKey}:${id}`,
      title,
      productName: model,
      ...inferProductDetails(full, "COMPUTERS_AND_ACCESSORIES"),
      destinationUrl: url.href,
      imageUrl: sellerImageUrl(card.find("img").first().attr("src"), MUDITA_CAMPAIGN),
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      explicitValidityEnd: { kind: "INSTANT", value: endsAt },
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: [
          "EXPLICIT_DATED_DASHAIN_SECTION",
          "MATCHING_PRODUCT_CAMPAIGN_CLOCK",
          "VISIBLE_AND_STRUCTURED_PRICES_AGREE",
        ],
        campaign: {
          key: campaignKey,
          title: `Mudita Dashain ${season}`,
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: null,
          publishedAt: null,
          startsAt: null,
          endsAt,
          originalDateText: rawEnd,
          dateCalendar: "AD",
          evidenceUrl: MUDITA_CAMPAIGN,
          membership: "EXPLICIT_PRODUCT",
        },
        product: { key: id, model, variant: full, gtin: null, attributes: {} },
        merchant: "Mudita Store",
        availability: "UNKNOWN",
        lastVerifiedAt: fetchedAt,
        priceObservedAt: fetchedAt,
        components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
        benefits: [],
        eligibility: { ...UNKNOWN_ELIGIBILITY },
        evidence: [
          {
            url: MUDITA_CAMPAIGN,
            fetchedAt,
            contentHash: hash,
            excerpt: `${full}; NPR ${sale / 100}; reference NPR ${original / 100}; Dashain Deals; campaign deadline ${rawEnd}`,
            path: `Dashain Deals product ${id}; price-box; dated campaign countdown`,
            extractorVersion: "mudita-v1",
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
  return offers.size ? [...offers.values()] : null;
}
export function createMuditaAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "mudita-store",
    async scan(source) {
      if (source.id !== "mudita-store" || !source.campaignEntryPoints?.includes(MUDITA_CAMPAIGN))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const r = await fetchPage(MUDITA_CAMPAIGN, source);
        if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const offers = extractMuditaCampaign(r.body, clock().toISOString());
        return offers
          ? { ok: true, offers, partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
