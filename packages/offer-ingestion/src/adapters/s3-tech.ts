import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
export const S3_ROOT = "https://sthree.tech/";
export const S3_PATHS = [
  "koorui-e2711f-27-inch-fhd-100hz-ips-gaming-office-monitor",
  "ziasys-ritmo-9-wireless-headphone",
  "havit-ms73-gaming-mouse-with-side-button",
] as const;
type Member = Readonly<{ url: string; title: string; id: string; original: number; sale: number }>;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function s3Campaign(html: string, fetchedAt: string): boolean {
  const $ = load(html);
  // Current campaign year is explicit in the shared first-party offer modal, not the footer.
  return (
    Number.isFinite(Date.parse(fetchedAt)) &&
    new Date(fetchedAt).getUTCFullYear() === 2026 &&
    $("#festiveOffersModalLabel").length === 1 &&
    $("#festiveOffersModalLabel").text().trim() === "बडा दशैं तथा दीपावली २०८३ महा-अफर"
  );
}
export function s3Members(html: string): readonly Member[] | null {
  const $ = load(html),
    members = new Map<string, Member>(),
    cards = $(".product__item");
  if (!cards.length || cards.length > 200) return null;
  for (const e of cards.toArray()) {
    const c = $(e),
      a = c.find("h6.title a"),
      url = a.attr("href");
    if (!url || !S3_PATHS.some((p) => url === `${S3_ROOT}product/details/${p}`)) continue;
    if (
      c.find('.festive-badge[title="दशैं-तिहार विशेष छुट"] .festive-tag-text').text().trim() !==
      "दशैं अफर"
    )
      return null;
    const price = c.find(".price"),
      refs = price.find("del"),
      title = a.text().trim(),
      original = parseNprPrice(refs.text()),
      sale = parseNprPrice(price.clone().find("del").remove().end().text()),
      cart = c.find(".add-to-cart[data-product_id]"),
      id = cart.attr("data-product_id");
    if (
      a.length !== 1 ||
      price.length !== 1 ||
      refs.length !== 1 ||
      cart.length !== 1 ||
      !id ||
      !/^\d+$/.test(id) ||
      !title ||
      title.length > 250 ||
      sale === null ||
      original === null ||
      sale <= 0 ||
      original <= sale ||
      c.find(".stock-dot--in").length !== 1
    )
      return null;
    const member = { url, title, id, original, sale },
      previous = members.get(url);
    if (previous && JSON.stringify(previous) !== JSON.stringify(member)) return null;
    members.set(url, member);
  }
  return members.size === S3_PATHS.length
    ? S3_PATHS.map((p) => members.get(`${S3_ROOT}product/details/${p}`)!)
    : null;
}
export function extractS3(
  root: string,
  html: string,
  member: Member,
  fetchedAt: string,
): CandidateOffer | null {
  if (!s3Campaign(root, fetchedAt) || !s3Campaign(html, fetchedAt)) return null;
  const $ = load(html),
    main = $(".product-details-content"),
    sale = main.find(".current-product-price"),
    ref = main.find(".product-price del"),
    cart = main.find(".add-to-cart[data-product_id]"),
    quantity = main.find(".quantity--amount .amount").text().trim();
  if (
    main.length !== 1 ||
    main.find("h1").text().trim() !== member.title ||
    $('link[rel="canonical"]').attr("href") !== member.url ||
    sale.length !== 1 ||
    ref.length !== 1 ||
    parseNprPrice(sale.text()) !== member.sale ||
    parseNprPrice(ref.text()) !== member.original ||
    cart.length !== 1 ||
    cart.attr("data-product_id") !== member.id ||
    cart.hasClass("disabled") ||
    cart.attr("disabled") !== undefined ||
    main.find(".badge--success").text().trim() !== "In Stock" ||
    !/^\d+$/.test(quantity) ||
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) <= 0 ||
    main.find('select, input:not([name="quantity"]), [data-attribute], .variation, .variant').length
  )
    return null;
  const products: Record<string, unknown>[] = [];
  try {
    for (const script of $('script[type="application/ld+json"]').toArray()) {
      const raw = $(script).text();
      if (raw.length > 100_000) return null;
      const v: unknown = JSON.parse(raw);
      if (record(v) && v["@type"] === "Product") products.push(v);
    }
  } catch {
    return null;
  }
  const p = products[0];
  if (
    products.length !== 1 ||
    !p ||
    p.name !== member.title ||
    p["@id"] !== `${member.url}#product` ||
    typeof p.sku !== "string" ||
    !/^[A-Z0-9-]{3,80}$/.test(p.sku) ||
    !record(p.brand) ||
    typeof p.brand.name !== "string" ||
    !p.brand.name ||
    !record(p.offers) ||
    p.offers.priceCurrency !== "NPR" ||
    typeof p.offers.price !== "string" ||
    parseNprPrice(`NPR ${p.offers.price}`) !== member.sale ||
    p.offers.url !== member.url ||
    p.offers.availability !== "https://schema.org/InStock" ||
    p.offers.itemCondition !== "https://schema.org/NewCondition" ||
    !record(p.offers.seller) ||
    p.offers.seller.name !== "S3 TECH - PREMIUM PC BUILD IN NEPAL"
  )
    return null;
  const terms =
    "Displayed Dashain product discount. Separate festive coupons and custom PC-build bonuses are not deducted from this observed price. No additional warranty duration is inferred.";
  const key = "s3-tech-dashain-tihar-2083";
  return {
    sourceOfferKey: `${key}:${member.id}`,
    title: member.title,
    productName: member.title,
    brandName: p.brand.name,
    category: member.id === "404" ? "CONSUMER_ELECTRONICS" : "COMPUTERS_AND_ACCESSORIES",
    destinationUrl: member.url,
    originalPrice: { currency: "NPR", amountMinor: member.original },
    salePrice: { currency: "NPR", amountMinor: member.sale },
    discountPercent: Math.round((1 - member.sale / member.original) * 100),
    terms,
    explicitValidityEnd: null,
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "EXPLICIT_CURRENT_2083_CAMPAIGN",
        "EXPLICIT_PRODUCT_DASHAIN_BADGE",
        "VISIBLE_HOME_AND_DETAIL_PRICES_AGREE",
        "EXACT_CART_SKU_AND_STOCK_AGREE",
      ],
      campaign: {
        key,
        title: "S3 TECH Dashain/Tihar 2083",
        festivals: ["DASHAIN", "TIHAR"],
        seasonAD: 2026,
        seasonBS: "2083",
        publishedAt: null,
        startsAt: null,
        endsAt: null,
        originalDateText: null,
        dateCalendar: "UNKNOWN",
        evidenceUrl: S3_ROOT,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: member.id,
        model: p.sku,
        variant: member.title,
        gtin: null,
        attributes: { condition: "New" },
      },
      merchant: "S3 TECH",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [{ description: member.title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: S3_ROOT,
          fetchedAt,
          contentHash: createHash("sha256").update(root).digest("hex"),
          excerpt: `बडा दशैं तथा दीपावली २०८३ महा-अफर; दशैं अफर; ${member.title}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}`,
          path: "current festive modal; exact product badge and card prices/cart identity",
          extractorVersion: "s3-tech-v1",
          fields: ["campaign", "membership", "offerType", "product", "salePrice", "originalPrice"],
        },
        {
          url: member.url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${member.title}; SKU ${p.sku}; NPR ${member.sale / 100}; reference NPR ${member.original / 100}; In Stock; ${terms}`,
          path: "visible detail price pair; simple cart identity/stock; matching NPR Product JSON-LD",
          extractorVersion: "s3-tech-v1",
          fields: ["product", "salePrice", "originalPrice", "components", "eligibility"],
        },
      ],
    },
  };
}
export function createS3TechAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "s3-tech",
    async scan(source) {
      if (source.id !== "s3-tech" || !source.campaignEntryPoints?.includes(S3_ROOT))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          root = await fetchPage(S3_ROOT, source);
        if (root.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const members = s3Members(root.body);
        if (!members || !s3Campaign(root.body, fetchedAt))
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members) {
          const r = await fetchPage(member.url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const o = extractS3(root.body, r.body, member, fetchedAt);
          if (!o) return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push(o);
        }
        return { ok: true, offers, partial: true };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
