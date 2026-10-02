import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";
export const MAAKE_ROOT = "https://maakebeautynepal.com/";
type Member = Readonly<{ url: string; title: string; id: string; sale: number; original: number }>;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function maakeCampaign(html: string, fetchedAt: string) {
  const $ = load(html),
    sections = $("section[x-data]").filter(
      (_i, e) =>
        $(e).find(".mb-flash-sale__title").text().trim() === "DASHAIN & TIHAR Special – 10% Off",
    );
  if (
    sections.length !== 1 ||
    sections.find(".mb-flash-sale__eyebrow").text().trim() !== "Sale is Live" ||
    !sections
      .find(".mb-flash-sale__desc")
      .text()
      .includes("10% off on your entire order (minimum spend Rs.500)")
  )
    return null;
  const match = /^flashSaleTimer\((\{.*\})\)$/.exec(sections.attr("x-data") ?? "");
  let data: unknown;
  try {
    data = JSON.parse(match?.[1] ?? "");
  } catch {
    return null;
  }
  if (
    !record(data) ||
    data.mode !== "ends" ||
    typeof data.ends_at !== "string" ||
    data.target_at !== data.ends_at ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:45$/.test(data.ends_at) ||
    !Number.isFinite(Date.parse(data.ends_at))
  )
    return null;
  const season = new Date(fetchedAt).getUTCFullYear();
  if (
    new Date(data.ends_at).getUTCFullYear() !== season ||
    Date.parse(data.ends_at) <= Date.parse(fetchedAt)
  )
    return null;
  return { season, endsAt: new Date(data.ends_at).toISOString(), date: data.ends_at };
}
export function maakeMembers(html: string): readonly Member[] | null {
  const $ = load(html),
    cards = $(".bs-product"),
    members = new Map<string, Member>();
  if (!cards.length || cards.length > 100) return null;
  for (const e of cards.toArray()) {
    const c = $(e),
      a = c.find(".bs-product__name a"),
      id = /^addToCartFromBtn\((\d+), event\)$/.exec(
        c.find(".bs-product__cart-btn").attr("onclick") ?? "",
      )?.[1];
    // A variation-specific or choice-based button cannot establish a simple product identity.
    if (!id) continue;
    const sale = parseNprPrice(c.find(".bs-product__price-current").text()),
      original = parseNprPrice(c.find(".bs-product__price-mrp").text());
    if (sale === null || original === null || sale <= 0 || original <= sale) continue;
    const title = a.text().trim(),
      href = a.attr("href");
    if (a.length !== 1 || !href || !title || title.length > 200) return null;
    const url = new URL(href, MAAKE_ROOT);
    if (
      url.origin !== new URL(MAAKE_ROOT).origin ||
      !/^\/product\/[a-z0-9-]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    const previous = members.get(url.href);
    if (
      previous &&
      (previous.id !== id ||
        previous.sale !== sale ||
        previous.original !== original ||
        previous.title !== title)
    )
      return null;
    members.set(url.href, { url: url.href, title, id, sale, original });
  }
  return [...members.values()];
}
export function extractMaake(
  campaignHtml: string,
  html: string,
  member: Member,
  fetchedAt: string,
): CandidateOffer | null {
  const campaign = maakeCampaign(campaignHtml, fetchedAt);
  if (!campaign) return null;
  const $ = load(html),
    main = $(".bs-pdp__info");
  if (
    main.length !== 1 ||
    main.find("h1").text().trim() !== member.title ||
    $('link[rel="canonical"]').attr("href") !== member.url
  )
    return null;
  // Cheerio keeps HTML template contents in separate document fragments; read the simple-product fallback explicitly.
  const fallback = load(
    main.find('template[x-if="!hasVariations && displayPrice === null"]').html() ?? "",
  );
  const saleNodes = fallback(".bs-pdp__price"),
    refNodes = main.find(".bs-pdp__mrp").filter((_i, e) => $(e).text().trim() !== "");
  if (
    saleNodes.length !== 1 ||
    refNodes.length !== 1 ||
    parseNprPrice(saleNodes.text()) !== member.sale ||
    parseNprPrice(refNodes.text().replace(/^MRP\s+/, "")) !== member.original
  )
    return null;
  const args = $("[x-data]")
    .map((_i, e) => $(e).attr("x-data") ?? "")
    .get()
    .filter((a) => a.startsWith("productPage("));
  let config: unknown;
  let images: unknown;
  try {
    const arg = args[0];
    if (args.length !== 1 || !arg || arg.length > 50_000 || !arg.endsWith(")")) return null;
    const decoded: unknown = JSON.parse("[" + arg.slice("productPage(".length, -1) + "]");
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    images = decoded[0];
    config = decoded[1];
  } catch {
    return null;
  }
  if (
    !record(config) ||
    !Array.isArray(config.attributes) ||
    config.attributes.length ||
    !Array.isArray(config.variations) ||
    config.variations.length ||
    typeof config.base_stock !== "number" ||
    !Number.isSafeInteger(config.base_stock) ||
    config.base_stock <= 0
  )
    return null;
  const purchase = load(main.find('template[x-if="inStock"]').html() ?? "");
  if (
    !purchase("button")
      .toArray()
      .some(
        (e) =>
          purchase(e).attr("@click") ===
          `addToCartFromBtn(${member.id}, $event, selectedVariationId)`,
      )
  )
    return null;
  const coupons = main
    .find(".bs-coupon-card")
    .filter((_i, e) => $(e).find(".bs-coupon-card__code").text().trim() === "CODE : DASHAIN10");
  const condition = "DASHAIN AND TIHAR — Shop for Rs. 500.00 & Get FLAT 10% OFF";
  if (coupons.length !== 1 || coupons.find(".bs-coupon-card__offer").text().trim() !== condition)
    return null;
  const key = `maake-dashain-${campaign.season}`,
    terms =
      "Displayed product sale price; DASHAIN10 advertises a conditional 10% checkout discount on orders of at least NPR 500. Coupon savings are not applied to this observed price; combination rules are unknown.";
  return {
    sourceOfferKey: `${key}:${member.id}`,
    title: member.title,
    productName: member.title,
    brandName: "Maake Beauty",
    category: "FASHION_AND_LIFESTYLE",
    destinationUrl: member.url,
    imageUrl: sellerImageUrl(
      Array.isArray(images) && typeof images[0] === "string" ? images[0] : undefined,
      member.url,
    ),
    originalPrice: { currency: "NPR", amountMinor: member.original },
    salePrice: { currency: "NPR", amountMinor: member.sale },
    discountPercent: Math.round((1 - member.sale / member.original) * 100),
    terms,
    explicitValidityEnd: { kind: "INSTANT", value: campaign.endsAt },
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "DATED_DASHAIN_SITEWIDE_PROMOTION",
        "EXPLICIT_PRODUCT_DASHAIN_OFFER",
        "OBSERVED_PRODUCT_DISCOUNT_INDEPENDENT_OF_COUPON",
        "VISIBLE_HOME_AND_DETAIL_PRICES_AGREE",
      ],
      campaign: {
        key,
        title: `Maake Beauty Dashain/Tihar ${campaign.season}`,
        festivals: ["DASHAIN", "TIHAR"],
        seasonAD: campaign.season,
        seasonBS: null,
        publishedAt: null,
        startsAt: null,
        endsAt: campaign.endsAt,
        originalDateText: campaign.date,
        dateCalendar: "AD",
        evidenceUrl: MAAKE_ROOT,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: member.id,
        model: member.title,
        variant: member.title,
        gtin: null,
        attributes: {},
      },
      merchant: "Maake Beauty Nepal",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [{ description: member.title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [
        {
          type: "COUPON",
          description: "DASHAIN10: conditional 10% checkout discount",
          status: "CONDITIONAL",
          amountMinor: null,
          percent: 10,
          capMinor: null,
          eligibleProductKeys: [member.id],
          conditions:
            "DASHAIN10 code; order minimum NPR 500; combination rules unknown; not applied to observed price",
        },
      ],
      evidence: [
        {
          url: MAAKE_ROOT,
          fetchedAt,
          contentHash: createHash("sha256").update(campaignHtml).digest("hex"),
          excerpt: `DASHAIN & TIHAR Special; Sale is Live; deadline ${campaign.date}; ${member.title}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}`,
          path: "dated flashSaleTimer JSON; simple product card",
          extractorVersion: "maake-v1",
          fields: ["campaign", "membership", "offerType", "product", "salePrice", "originalPrice"],
        },
        {
          url: member.url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${member.title}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}; ${condition}; ${terms}`,
          path: "productPage JSON arguments; simple product/cart identity; displayed price/MRP; explicit product DASHAIN10 offer",
          extractorVersion: "maake-v1",
          fields: [
            "membership",
            "product",
            "salePrice",
            "originalPrice",
            "components",
            "benefits",
            "eligibility",
          ],
        },
      ],
    },
  };
}
export function createMaakeAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "maake-beauty-nepal",
    async scan(source) {
      if (source.id !== "maake-beauty-nepal" || !source.campaignEntryPoints?.includes(MAAKE_ROOT))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          root = await fetchPage(MAAKE_ROOT, source);
        if (root.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const members = maakeMembers(root.body);
        if (!maakeCampaign(root.body, fetchedAt) || !members)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members) {
          const r = await fetchPage(member.url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const o = extractMaake(root.body, r.body, member, fetchedAt);
          if (o) offers.push(o);
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
