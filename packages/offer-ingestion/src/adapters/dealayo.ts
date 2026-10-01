import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

// The publisher retained the previous year's URL, but the displayed collection heading specifies its season.
export const DEALAYO_CAMPAIGN = "https://dealayo.com/dashain-offer-2082.html";
export function extractDealayoPage(html: string, url: string, fetchedAt: string) {
  const $ = load(html),
    season = new Date(fetchedAt).getUTCFullYear();
  const heading = `Dashain Offer ${season + 57}`;
  if ($("title").text().trim() !== heading || $("#maincontent h1").text().trim() !== heading)
    return null;
  const amount = $("#maincontent .toolbar-amount").first().text().trim().replace(/\s+/g, " ");
  const range = /^Items (\d+)-(\d+) of (\d+)$/.exec(amount);
  const page = new URL(url).searchParams.get("p") ?? "1";
  if (!/^\d+$/.test(page) || !range) return null;
  const start = Number(range[1]),
    end = Number(range[2]),
    total = Number(range[3]);
  const pageNumber = Number(page);
  const cards = $("#maincontent .products.wrapper.grid > ol.product-items > li.product-item");
  if (
    total > 1000 ||
    start !== (pageNumber - 1) * 24 + 1 ||
    end !== Math.min(pageNumber * 24, total) ||
    cards.length !== end - start + 1
  )
    return null;
  const nextLinks = $("#maincontent .pages-item-next a");
  const expectedNext = end < total ? `${DEALAYO_CAMPAIGN}?p=${pageNumber + 1}` : null;
  if (
    nextLinks.length !== (expectedNext ? 1 : 0) ||
    (expectedNext && nextLinks.attr("href") !== expectedNext)
  )
    return null;
  const ids: string[] = [],
    offers: CandidateOffer[] = [];
  const hash = createHash("sha256").update(html).digest("hex"),
    campaignKey = `dealayo-dashain-${season}`;
  for (const element of cards.toArray()) {
    const card = $(element),
      box = card.find(".price-box[data-product-id]"),
      id = box.attr("data-product-id");
    const links = card.find(".product-item-name .product-item-link"),
      name = links.text().trim().replace(/\s+/g, " "),
      href = links.attr("href");
    if (
      box.length !== 1 ||
      !id ||
      !/^\d+$/.test(id) ||
      ids.includes(id) ||
      links.length !== 1 ||
      !name ||
      name.length > 2000 ||
      !href
    )
      return null;
    ids.push(id);
    const destination = new URL(href, DEALAYO_CAMPAIGN);
    if (
      destination.origin !== new URL(DEALAYO_CAMPAIGN).origin ||
      !/^\/[^/]+\.html$/.test(destination.pathname) ||
      destination.search ||
      destination.hash
    )
      return null;
    const saleNode = card.find('.special-price [data-price-type="finalPrice"]'),
      refNode = card.find('.old-price [data-price-type="oldPrice"]');
    if (!saleNode.length && !refNode.length) continue;
    const sale = parseNprPrice(saleNode.find(".price").text()),
      original = parseNprPrice(refNode.find(".price").text());
    if (
      saleNode.length !== 1 ||
      refNode.length !== 1 ||
      sale === null ||
      original === null ||
      sale <= 0 ||
      original <= sale ||
      parseNprPrice(`NPR ${saleNode.attr("data-price-amount")}`) !== sale ||
      parseNprPrice(`NPR ${refNode.attr("data-price-amount")}`) !== original
    )
      return null;
    const form = card.find('form[data-role="tocart-form"]');
    if (
      form.length !== 1 ||
      form.find('[name="product"]').attr("value") !== id ||
      card.find('.swatch-attribute,[name^="super_attribute"]').length ||
      card.find(".stock.unavailable").length
    )
      continue;
    const model = name.split(/[|(]/)[0]!.trim(),
      title = name.length <= 300 ? name : model;
    if (!model || model.length > 200 || title.length > 300) continue;
    offers.push({
      sourceOfferKey: `${campaignKey}:${id}`,
      title,
      productName: model,
      ...inferProductDetails(name, "HOME_APPLIANCES"),
      destinationUrl: destination.href,
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
      discountPercent: Math.round((1 - sale / original) * 100),
      discovery: {
        offerType: "PRODUCT_DISCOUNT",
        qualification: "QUALIFIED",
        ruleVersion: "dashain-price-v2",
        reasons: ["EXPLICIT_CURRENT_SEASON_COLLECTION", "VISIBLE_AND_STRUCTURED_PRICES_AGREE"],
        campaign: {
          key: campaignKey,
          title: heading,
          festivals: ["DASHAIN"],
          seasonAD: season,
          seasonBS: String(season + 57),
          publishedAt: null,
          startsAt: null,
          endsAt: null,
          originalDateText: heading,
          dateCalendar: "BS",
          evidenceUrl: DEALAYO_CAMPAIGN,
          membership: "EXPLICIT_PRODUCT",
        },
        product: { key: id, model, variant: name, gtin: null, attributes: {} },
        merchant: "Dealayo Pvt Ltd",
        availability: "UNKNOWN",
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
            excerpt: `${heading}; ${name}; NPR ${sale / 100}; reference NPR ${original / 100}`,
            path: `current-season collection; product ${id}; price-box`,
            extractorVersion: "dealayo-v1",
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
  return { total, ids, offers, next: expectedNext };
}

export function createDealayoAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "dealayo",
    async scan(source) {
      if (source.id !== "dealayo" || !source.campaignEntryPoints?.includes(DEALAYO_CAMPAIGN))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          seen = new Set<string>(),
          paths = new Set<string>(),
          offers: CandidateOffer[] = [];
        let url: string | null = DEALAYO_CAMPAIGN,
          total: number | null = null,
          pages = 0;
        while (url) {
          if (++pages > 42) return { ok: false, reason: "STRUCTURE_CHANGED" };
          const r = await fetchPage(url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const page = extractDealayoPage(r.body, url, fetchedAt);
          if (!page || (total !== null && total !== page.total))
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          total = page.total;
          for (const id of page.ids) {
            if (seen.has(id)) return { ok: false, reason: "STRUCTURE_CHANGED" };
            seen.add(id);
          }
          for (const offer of page.offers) {
            if (paths.has(offer.destinationUrl)) return { ok: false, reason: "STRUCTURE_CHANGED" };
            paths.add(offer.destinationUrl);
            offers.push(offer);
          }
          url = page.next;
        }
        return seen.size === total && offers.length
          ? { ok: true, offers, partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
