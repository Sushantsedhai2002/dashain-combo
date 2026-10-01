import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
export const SABKO_CAMPAIGN = "https://sabkophone.com/sabko-phone-dashain-offer-2083/";
export const SABKO_SHOP = "https://sabkophone.com/shop/";
export type SabkoMember = Readonly<{
  url: string;
  title: string;
  id: string;
  price: number;
  original: number;
}>;
const phoneName =
  /^(?:(?:Apple )?iPhone|Samsung|(?:Google )?Pixel|OnePlus|Honor|Nothing Phone|Redmi|Vivo|Oppo|POCO|Realme)\b/i;
export function sabkoCampaign(html: string, fetchedAt: string): string | null {
  const $ = load(html),
    season = new Date(fetchedAt).getUTCFullYear();
  const published = $('meta[property="article:published_time"]').attr("content");
  if (
    !published ||
    !Number.isFinite(Date.parse(published)) ||
    new Date(published).getUTCFullYear() !== season ||
    Date.parse(published) > Date.parse(fetchedAt) ||
    !$("h1")
      .text()
      .includes(`Sabko Phone Dashain Offer ${season + 57}`)
  )
    return null;
  const paragraphs = $("p")
    .map((_i, e) => $(e).text().trim().replace(/\s+/g, " "))
    .get();
  if (
    !paragraphs.some((p) =>
      p.includes(
        "All smartphones worth more than Rs:40000 sold during the Dashain Offer come with an exclusive 6-month warranty",
      ),
    )
  )
    return null;
  return published;
}
export function sabkoMembers(html: string): readonly SabkoMember[] | null {
  const $ = load(html),
    cards = $("ul.products li.product");
  if (!cards.length) return null;
  const members: SabkoMember[] = [];
  const seen = new Set<string>();
  for (const e of cards.toArray()) {
    const c = $(e),
      title = c.find("h2").text().trim().replace(/\s+/g, " ");
    if (!phoneName.test(title) || !c.hasClass("instock") || !c.hasClass("product-type-simple"))
      continue;
    const saleText = c.find(".price ins .amount").text();
    if (!saleText) continue;
    const price = parseNprPrice(saleText);
    const original = parseNprPrice(c.find(".price del .amount").text());
    if (price === null || original === null || original <= price) return null;
    if (price <= 4000000) continue;
    const href = c.find("a").first().attr("href"),
      id = /(?:^|\s)post-(\d+)(?:\s|$)/.exec(c.attr("class") ?? "")?.[1];
    if (!href || !id || title.length > 200) return null;
    const url = new URL(href, SABKO_SHOP);
    if (
      url.origin !== new URL(SABKO_SHOP).origin ||
      !/^\/product\/[^/]+\/$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      seen.has(id)
    )
      return null;
    seen.add(id);
    members.push({ url: url.href, title, id, price, original });
  }
  return members;
}
export function extractSabkoPhone(
  campaignHtml: string,
  html: string,
  member: SabkoMember,
  fetchedAt: string,
): CandidateOffer | null {
  const published = sabkoCampaign(campaignHtml, fetchedAt);
  if (!published) return null;
  const $ = load(html),
    main = $(`div.product.post-${member.id}`).first(),
    summary = main.find(".summary").first();
  if (
    !main.hasClass("product-type-simple") ||
    !main.hasClass("instock") ||
    $("h1").length !== 1 ||
    $("h1").text().trim() !== member.title ||
    $('link[rel="canonical"]').attr("href") !== member.url ||
    summary.find('button[name="add-to-cart"]').attr("value") !== member.id
  )
    return null;
  const original = parseNprPrice(summary.find(".price del .amount").text()),
    sale = parseNprPrice(summary.find(".price ins .amount").text());
  if (
    original === null ||
    sale === null ||
    sale !== member.price ||
    original !== member.original ||
    sale <= 4000000 ||
    original <= sale
  )
    return null;
  const description = main.find("#tab-description"),
    paragraphs = description
      .find("p")
      .map((_i, e) => $(e).text().trim().replace(/\s+/g, " "))
      .get();
  if (!paragraphs.includes("Refurbished note:")) return null;
  const unit = paragraphs.find((p) => /^p\d+$/i.test(p));
  const condition = paragraphs.find((p) => p.startsWith("The phone (") && /refurbish/i.test(p));
  const cells = description
    .find("td")
    .map((_i, e) => $(e).text().trim().replace(/\s+/g, " "))
    .get();
  const storage = cells.filter((t) => /^Storage:\s*\d+(?:GB|TB)$/i.test(t)),
    ram = cells.filter((t) => /^Ram:\s*\d+GB$/i.test(t));
  const colors = description
    .find("tr")
    .filter((_i, e) => $(e).find("td").first().text().trim() === "Color");
  const color = colors.find("td").eq(1).text().trim().replace(/\s+/g, " ");
  if (
    !unit ||
    !condition ||
    condition.length > 1200 ||
    storage.length !== 1 ||
    ram.length !== 1 ||
    colors.length !== 1 ||
    !color ||
    color.length > 100
  )
    return null;
  const productKey = `${member.id}:${unit.toUpperCase()}`,
    season = new Date(fetchedAt).getUTCFullYear(),
    campaignKey = `sabko-dashain-${season}`;
  const title = `${member.title} | Refurbished | ${storage[0]} | ${color} | ${unit.toUpperCase()}`;
  const variant = `${ram[0]} | ${storage[0]} | ${color} | Refurbished unit ${unit.toUpperCase()} | ${condition}`;
  if (title.length > 300 || variant.length > 2000) return null;
  return {
    sourceOfferKey: `${campaignKey}:${productKey}`,
    title,
    productName: member.title,
    ...inferProductDetails(member.title, "MOBILE_AND_TABLETS"),
    brandName: /^(?:Apple )?iPhone\b/i.test(member.title)
      ? "Apple"
      : inferProductDetails(member.title, "MOBILE_AND_TABLETS").brandName,
    category: "MOBILE_AND_TABLETS",
    destinationUrl: member.url,
    originalPrice: { currency: "NPR", amountMinor: original },
    salePrice: { currency: "NPR", amountMinor: sale },
    discountPercent: Math.round((1 - sale / original) * 100),
    terms: condition,
    discovery: {
      offerType: "SERVICE_BENEFIT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "DATED_DASHAIN_WARRANTY_CAMPAIGN",
        "EXPLICIT_PHONE_PRICE_THRESHOLD",
        "OBSERVED_DISCOUNTED_EXACT_REFURBISHED_UNIT",
      ],
      campaign: {
        key: campaignKey,
        title: `Sabko Phone Dashain ${season + 57}`,
        festivals: ["DASHAIN"],
        seasonAD: season,
        seasonBS: String(season + 57),
        publishedAt: published,
        startsAt: null,
        endsAt: null,
        originalDateText: `Published ${published}; Dashain ${season + 57}`,
        dateCalendar: "AD",
        evidenceUrl: SABKO_CAMPAIGN,
        membership: "ELIGIBLE_CATEGORY",
      },
      product: {
        key: productKey,
        model: member.title,
        variant,
        gtin: null,
        attributes: {
          condition: "REFURBISHED",
          inventoryUnit: unit.toUpperCase(),
          storage: storage[0]!.replace(/^Storage:\s*/i, ""),
          ram: ram[0]!.replace(/^Ram:\s*/i, ""),
          color,
          conditionNote: condition,
        },
      },
      merchant: "Sabko Phone",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [{ description: title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
      benefits: [
        {
          type: "SERVICE_BENEFIT",
          description: "6-month Dashain warranty for smartphones priced above NPR 40,000",
          status: "CONDITIONAL",
          amountMinor: null,
          percent: null,
          capMinor: null,
          eligibleProductKeys: [productKey],
          conditions: "Smartphones worth more than NPR 40,000 sold during the Dashain Offer",
        },
      ],
      eligibility: { ...UNKNOWN_ELIGIBILITY, minimumSpendMinor: 4000001 },
      evidence: [
        {
          url: SABKO_CAMPAIGN,
          fetchedAt,
          contentHash: createHash("sha256").update(campaignHtml).digest("hex"),
          excerpt: `Dashain ${season + 57}; published ${published}; all smartphones worth more than NPR 40,000; 6-month warranty`,
          path: "dated campaign heading; warranty paragraph",
          extractorVersion: "sabko-v1",
          fields: ["campaign", "membership", "offerType", "benefits", "eligibility"],
        },
        {
          url: member.url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${title}; ${ram[0]}; NPR ${sale / 100}; reference NPR ${original / 100}; ${condition}`,
          path: `post-${member.id} .summary; #tab-description inventory and specifications`,
          extractorVersion: "sabko-v1",
          fields: ["product", "salePrice", "originalPrice", "components"],
        },
      ],
    },
  };
}
export function createSabkoAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "sabko-phone",
    async scan(source) {
      if (
        source.id !== "sabko-phone" ||
        !source.campaignEntryPoints?.includes(SABKO_CAMPAIGN) ||
        !source.campaignEntryPoints.includes(SABKO_SHOP)
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const campaign = await fetchPage(SABKO_CAMPAIGN, source);
        if (campaign.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const fetchedAt = clock().toISOString();
        if (!sabkoCampaign(campaign.body, fetchedAt))
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const members = new Map<string, SabkoMember>();
        const visited = new Set<string>();
        let url: string | null = SABKO_SHOP;
        while (url) {
          if (visited.has(url) || visited.size >= 20)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          visited.add(url);
          const r = await fetchPage(url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const extracted = sabkoMembers(r.body);
          if (!extracted) return { ok: false, reason: "STRUCTURE_CHANGED" };
          for (const member of extracted) {
            if (members.has(member.id)) return { ok: false, reason: "STRUCTURE_CHANGED" };
            members.set(member.id, member);
          }
          const $ = load(r.body),
            links = $(".woocommerce-pagination a.next");
          if (links.length > 1) return { ok: false, reason: "STRUCTURE_CHANGED" };
          const next = links.attr("href");
          if (next && !/^\/shop\/\?product-page=(?:[2-9]|1\d|20)$/.test(next))
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          url = next ? new URL(next, SABKO_SHOP).href : null;
        }
        if (!members.size || members.size > 100) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members.values()) {
          const r = await fetchPage(member.url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const offer = extractSabkoPhone(campaign.body, r.body, member, fetchedAt);
          if (offer) offers.push(offer);
        }
        return offers.length
          ? { ok: true, offers, partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
