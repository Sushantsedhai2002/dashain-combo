import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
export const AC_GHAR_HOME = "https://www.acghar.com/";
export type AcGharMember = Readonly<{ url: string; title: string; original: number; sale: number }>;
export function acGharMembers(html: string): readonly AcGharMember[] | null {
  const $ = load(html);
  const visible = $.root().clone();
  visible.find("script,style").remove();
  if (!visible.text().replace(/\s+/g, " ").includes("सबै ब्रान्डका AIR CONDITIONERS")) return null;
  const members = new Map<string, AcGharMember>();
  for (const element of $(".product-item").toArray()) {
    const card = $(element),
      title = card.find("h4").text().trim();
    if (!/air conditioner/i.test(title)) continue;
    const original = parseNprPrice(card.find(".line-through").text()),
      sale = parseNprPrice(card.find(".font-bold.text-sm").text());
    if (original === null && sale !== null) continue;
    const href = card.find('a[href*="/product/"]').first().attr("href");
    if (
      !href ||
      original === null ||
      sale === null ||
      sale <= 0 ||
      original <= sale ||
      title.length > 300
    )
      return null;
    const url = new URL(href, AC_GHAR_HOME);
    if (
      url.origin !== new URL(AC_GHAR_HOME).origin ||
      !/^\/product\/[^/]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    const previous = members.get(url.href);
    if (
      previous &&
      (previous.title !== title || previous.original !== original || previous.sale !== sale)
    )
      return null;
    members.set(url.href, { url: url.href, title, original, sale });
  }
  return members.size && members.size <= 100 ? [...members.values()] : null;
}
export function extractAcGharProduct(
  homeHtml: string,
  html: string,
  member: AcGharMember,
  fetchedAt: string,
): CandidateOffer | null {
  if (
    !acGharMembers(homeHtml)?.some(
      (m) =>
        m.url === member.url &&
        m.title === member.title &&
        m.sale === member.sale &&
        m.original === member.original,
    )
  )
    return null;
  const $ = load(html),
    season = new Date(fetchedAt).getUTCFullYear();
  const headings = $("h1").filter((_i, e) => $(e).text().trim() === member.title);
  if (
    headings.length !== 1 ||
    $('link[rel="canonical"]').attr("href") !== member.url ||
    !$("img")
      .toArray()
      .some(
        (e) =>
          $(e).attr("src") ===
            `${AC_GHAR_HOME}uploads/promo/dashain-tihar-chhath-offer-${season + 57}-acghar.gif` &&
          $(e).attr("alt") === `Dashain Tihar Chhath Offer ${season + 57} - AC Ghar`,
      )
  )
    return null;
  const section = headings.parent();
  const festive = section
    .find("span")
    .filter((_i, e) => $(e).text().trim() === "Festive Offer Price");
  const mrp = section.find("span").filter((_i, e) => $(e).text().trim() === "MRP");
  const original = parseNprPrice(mrp.next("span").text()),
    sale = parseNprPrice(festive.next("span").text());
  if (
    festive.length !== 1 ||
    mrp.length !== 1 ||
    original !== member.original ||
    sale !== member.sale
  )
    return null;
  const products: Record<string, unknown>[] = [];
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    let value: unknown;
    try {
      value = JSON.parse($(script).text());
    } catch {
      return null;
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>)["@type"] === "Product" &&
      (value as Record<string, unknown>).name === member.title
    )
      products.push(value as Record<string, unknown>);
  }
  if (products.length !== 1) return null;
  const product = products[0]!,
    offer = product.offers as Record<string, unknown> | undefined,
    brand = product.brand as Record<string, unknown> | undefined;
  if (
    !offer ||
    offer.priceCurrency !== "NPR" ||
    offer.url !== member.url ||
    parseNprPrice(`NPR ${String(offer.price)}`) !== sale ||
    !brand ||
    typeof brand.name !== "string" ||
    !Array.isArray(product.additionalProperty)
  )
    return null;
  const properties = product.additionalProperty as Record<string, unknown>[];
  const models = properties.filter((p) => p && p.name === "Model" && typeof p.value === "string");
  if (models.length !== 1) return null;
  const model = String(models[0]!.value).trim();
  const modelLabels = section.find("span").filter((_i, e) => $(e).text().trim() === "Model :");
  if (
    !model ||
    model.length > 200 ||
    modelLabels.length !== 1 ||
    modelLabels.next("span").text().trim() !== model
  )
    return null;
  const availability = offer.availability;
  if (
    !["https://schema.org/InStock", "https://schema.org/OutOfStock"].includes(String(availability))
  )
    return null;
  const visibleText = section.clone();
  visibleText.find("script,style").remove();
  if (availability === "https://schema.org/InStock" && !/\bIn Stock\b/.test(visibleText.text()))
    return null;
  if (
    availability === "https://schema.org/OutOfStock" &&
    !/\bOut of Stock\b/i.test(visibleText.text())
  )
    return null;
  const campaignKey = `ac-ghar-dashain-${season}`;
  return {
    sourceOfferKey: `${campaignKey}:${new URL(member.url).pathname.slice(9)}`,
    title: member.title,
    productName: member.title.length <= 200 ? member.title : null,
    brandName: brand.name,
    category: "HOME_APPLIANCES",
    destinationUrl: member.url,
    originalPrice: { currency: "NPR", amountMinor: member.original },
    salePrice: { currency: "NPR", amountMinor: member.sale },
    discountPercent: Math.round((1 - member.sale / member.original) * 100),
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "CURRENT_DASHAIN_PRODUCT_BANNER",
        "EXPLICIT_FESTIVE_PRODUCT_PRICE",
        "VISIBLE_AND_STRUCTURED_PRICES_AGREE",
      ],
      campaign: {
        key: campaignKey,
        title: `AC Ghar Dashain ${season + 57}`,
        festivals: ["DASHAIN", "TIHAR"],
        seasonAD: season,
        seasonBS: String(season + 57),
        publishedAt: null,
        startsAt: null,
        endsAt: null,
        originalDateText: `Dashain Tihar Chhath Offer ${season + 57}`,
        dateCalendar: "BS",
        evidenceUrl: member.url,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: new URL(member.url).pathname,
        model,
        variant: member.title,
        gtin: null,
        attributes: {},
      },
      merchant: "AC Ghar",
      availability: availability === "https://schema.org/InStock" ? "IN_STOCK" : "OUT_OF_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [{ description: member.title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
      benefits: [],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      evidence: [
        {
          url: AC_GHAR_HOME,
          fetchedAt,
          contentHash: createHash("sha256").update(homeHtml).digest("hex"),
          excerpt: `${member.title}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}; all-brand air-conditioner Dashain offer`,
          path: ".product-item; all-brand AC campaign",
          extractorVersion: "ac-ghar-v1",
          fields: ["membership", "salePrice", "originalPrice"],
        },
        {
          url: member.url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${member.title}; model ${model}; Festive Offer Price NPR ${member.sale / 100}; MRP NPR ${member.original / 100}; Dashain Tihar Chhath Offer ${season + 57}`,
          path: "product banner; heading; festive price; Product JSON-LD",
          extractorVersion: "ac-ghar-v1",
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
  };
}
export function createAcGharAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "ac-ghar",
    async scan(source) {
      if (source.id !== "ac-ghar" || !source.campaignEntryPoints?.includes(AC_GHAR_HOME))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const root = await fetchPage(AC_GHAR_HOME, source);
        if (root.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const members = acGharMembers(root.body);
        if (!members) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        const fetchedAt = clock().toISOString();
        for (const member of members) {
          const page = await fetchPage(member.url, source);
          if (page.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const offer = extractAcGharProduct(root.body, page.body, member, fetchedAt);
          if (!offer) return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push(offer);
        }
        return { ok: true, offers, partial: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
