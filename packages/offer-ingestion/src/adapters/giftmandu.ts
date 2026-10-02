import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
import { sellerImageUrl } from "./product-image.ts";

export const GIFTMANDU_ROOT = "https://www.giftmandu.com/";
export const GIFTMANDU_COLLECTION = `${GIFTMANDU_ROOT}occasions/dashain/dashain-offers/`;
type Member = Readonly<{ id: string; title: string; url: string; original: number; sale: number }>;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function giftmanduCampaign(html: string, fetchedAt: string) {
  const $ = load(html);
  const scripts = $("script:not([src])")
    .map((_i, e) => $(e).text())
    .get();
  // Read the site's literal scene schedule without executing JavaScript. NPT is defined
  // by the merchant as Nepal midnight. Comments and unrelated seasonal rows do not count.
  const schedules = scripts.flatMap((s) => [...s.matchAll(/var CALENDAR\s*=\s*\[([\s\S]*?)\];/g)]);
  const match =
    schedules.length === 1
      ? /\{\s*scene:'dashain',\s*start:NPT\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\),\s*end:NPT\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)\s*\}/.exec(
          schedules[0]![1]!,
        )
      : null;
  if (
    !match ||
    !scripts.some(
      (s) =>
        /var COPY_DAS\s*=\s*\{\s*eyebrow:'Dashain Gifts 2083'/.test(s) &&
        /dashain:\s*\{[^}]*copy:COPY_DAS,[^}]*shopAll:'\/dashain-gifts\/'/.test(s),
    )
  )
    return null;
  const parts = match.slice(1).map(Number);
  const [y, m, d, ey, em, ed] = parts as [number, number, number, number, number, number];
  if (
    y !== 2026 ||
    ey !== y ||
    [m, em].some((v) => v < 1 || v > 12) ||
    [d, ed].some((v) => v < 1 || v > 31)
  )
    return null;
  const start = Date.UTC(y, m - 1, d) - 345 * 60_000;
  const end = Date.UTC(ey, em - 1, ed) - 345 * 60_000;
  const now = Date.parse(fetchedAt);
  if (
    !Number.isFinite(now) ||
    new Date(fetchedAt).getUTCFullYear() !== y ||
    now < start ||
    now >= end ||
    end <= start
  )
    return null;
  return {
    season: y,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end - 1).toISOString(),
    originalDateText: match[0],
  };
}
export function giftmanduMembers(html: string): readonly Member[] | null {
  const $ = load(html);
  if ($("h1").text().trim() !== "Dashain Offers") return null;
  const cards = $(".productGrid > .product");
  if (!cards.length || cards.length > 100) return null;
  const members = new Map<string, Member>();
  for (const e of cards.toArray()) {
    const c = $(e),
      a = c.find("h3.card-title a");
    const sale = parseNprPrice(c.find("[data-product-price-without-tax]").text());
    const original = parseNprPrice(c.find("[data-product-non-sale-price-without-tax]").text());
    if (sale === null || original === null || sale <= 0 || original <= sale) continue;
    const title = a.text().trim(),
      href = a.attr("href"),
      cart = c.find('[data-button-type="add-cart"]');
    if (
      a.length !== 1 ||
      !href ||
      !title ||
      title.length > 200 ||
      cart.length !== 1 ||
      !/statue|frame/i.test(title)
    )
      continue;
    const url = new URL(href, GIFTMANDU_ROOT),
      cartUrl = new URL(cart.attr("href") ?? "", GIFTMANDU_ROOT),
      id = cartUrl.searchParams.get("product_id");
    if (
      url.origin !== new URL(GIFTMANDU_ROOT).origin ||
      url.search ||
      url.hash ||
      !/^\/[a-z0-9-]+$/.test(url.pathname) ||
      cartUrl.origin !== url.origin ||
      cartUrl.pathname !== "/cart.php" ||
      cartUrl.searchParams.get("action") !== "add" ||
      !id ||
      !/^\d+$/.test(id) ||
      c
        .find("[data-product-id]")
        .toArray()
        .some((n) => $(n).attr("data-product-id") !== id)
    )
      return null;
    // We inspect the published cart identity but never request an add-to-cart URL.
    if (members.has(url.href)) return null;
    members.set(url.href, { id, title, url: url.href, sale, original });
  }
  return [...members.values()];
}
export function extractGiftmandu(
  root: string,
  collection: string,
  html: string,
  member: Member,
  fetchedAt: string,
): CandidateOffer | null {
  const campaign = giftmanduCampaign(root, fetchedAt);
  if (!campaign) return null;
  const $ = load(html),
    view = $(".productView").first(),
    form = view.find("form[data-cart-item-add]");
  if (
    $('link[rel="canonical"]').attr("href") !== member.url ||
    view.find("h1.productView-title").text().trim() !== member.title ||
    form.length !== 1 ||
    form.find('input[name="product_id"]').attr("value") !== member.id ||
    form.find("[data-product-option-change]").children().length ||
    form.find("#form-action-addToCart").length !== 1 ||
    form.find("#form-action-addToCart").attr("disabled") !== undefined ||
    !$(".breadcrumbs a")
      .toArray()
      .some((e) => $(e).attr("href") === GIFTMANDU_COLLECTION)
  )
    return null;
  const prices = view.find(".productView-price");
  if (
    parseNprPrice(prices.find("[data-product-price-without-tax]").text()) !== member.sale ||
    parseNprPrice(prices.find("[data-product-non-sale-price-without-tax]").text()) !==
      member.original
  )
    return null;
  const dataScripts = $("script:not([src])")
    .map((_i, e) => $(e).text())
    .get()
    .filter((s) => /^\s*var BCData\s*=/.test(s));
  let data: unknown;
  try {
    if (dataScripts.length !== 1 || dataScripts[0]!.length > 100_000) return null;
    const m = /^\s*var BCData\s*=\s*(\{[\s\S]*\});\s*$/.exec(dataScripts[0]!);
    data = JSON.parse(m?.[1] ?? "");
  } catch {
    return null;
  }
  if (!record(data) || !record(data.product_attributes)) return null;
  const attrs = data.product_attributes;
  if (
    attrs.base !== true ||
    attrs.instock !== true ||
    attrs.purchasable !== true ||
    typeof attrs.sku !== "string" ||
    !attrs.sku ||
    !Array.isArray(attrs.available_modifier_values) ||
    attrs.available_modifier_values.length ||
    !record(attrs.price)
  )
    return null;
  for (const [field, expected] of [
    ["without_tax", member.sale],
    ["sale_price_without_tax", member.sale],
    ["non_sale_price_without_tax", member.original],
  ] as const) {
    const p = attrs.price[field];
    if (
      !record(p) ||
      p.currency !== "NPR" ||
      typeof p.value !== "number" ||
      Math.round(p.value * 100) !== expected
    )
      return null;
  }
  const schemas: unknown[] = [];
  for (const e of $('script[type="application/ld+json"]').toArray()) {
    try {
      schemas.push(JSON.parse($(e).text()));
    } catch {
      /* unrelated malformed schema is not product evidence */
    }
  }
  const products = schemas.filter((s) => record(s) && s["@type"] === "Product");
  if (!products.length || products.length > 3) return null;
  for (const p of products) {
    if (
      !record(p) ||
      p.name !== member.title ||
      (p.url !== undefined && p.url !== member.url) ||
      p.sku !== attrs.sku ||
      !record(p.offers) ||
      p.offers.priceCurrency !== "NPR" ||
      p.offers.url !== member.url ||
      p.offers.availability !== "https://schema.org/InStock" ||
      parseNprPrice(`NPR ${String(p.offers.price)}`) !== member.sale
    )
      return null;
  }
  const key = `giftmandu-dashain-${campaign.season}`,
    terms =
      "Observed product discount in Dashain Offers. Extra hamper/multi-item promotions are conditional and are not applied to this price. Design may vary where stated by the seller.";
  const image = $('meta[property="og:image"]').attr("content");
  let imageUrl = sellerImageUrl(image, member.url);
  if (!imageUrl && image) {
    try {
      const cdn = new URL(image);
      if (
        cdn.protocol === "https:" &&
        cdn.hostname === "cdn11.bigcommerce.com" &&
        cdn.pathname.startsWith(`/s-tgrcca6nho/products/${member.id}/images/`) &&
        !cdn.username &&
        !cdn.password
      )
        imageUrl = cdn.href;
    } catch {
      // An invalid image does not invalidate observed prices.
    }
  }
  return {
    sourceOfferKey: `${key}:${member.id}`,
    title: member.title,
    productName: member.title,
    brandName: null,
    category: "HOME_AND_FURNITURE",
    destinationUrl: member.url,
    imageUrl,
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
        "DATED_DASHAIN_SCENE_SCHEDULE",
        "EXPLICIT_DASHAIN_COLLECTION_MEMBER",
        "DETAIL_VISIBLE_JSON_PRICES_AND_STOCK_AGREE",
      ],
      campaign: {
        key,
        title: "Giftmandu Dashain Gifts 2083",
        festivals: ["DASHAIN"],
        seasonAD: campaign.season,
        seasonBS: "2083",
        publishedAt: null,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        originalDateText: campaign.originalDateText,
        dateCalendar: "AD",
        evidenceUrl: GIFTMANDU_ROOT,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: member.id,
        model: attrs.sku,
        variant: member.title,
        gtin: null,
        attributes: { sku: attrs.sku },
      },
      merchant: "Giftmandu",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [{ description: member.title, quantity: 1, unit: "item", role: "MAIN_ITEM" }],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: GIFTMANDU_ROOT,
          fetchedAt,
          contentHash: createHash("sha256").update(root).digest("hex"),
          excerpt: `Dashain Gifts 2083; active literal scene schedule ${campaign.originalDateText}`,
          path: "COPY_DAS; SCENES.dashain; CALENDAR literal NPT schedule",
          extractorVersion: "giftmandu-v1",
          fields: ["campaign"],
        },
        {
          url: GIFTMANDU_COLLECTION,
          fetchedAt,
          contentHash: createHash("sha256").update(collection).digest("hex"),
          excerpt: `Dashain Offers; ${member.title}; original NPR ${member.original / 100}; sale NPR ${member.sale / 100}; product ${member.id}`,
          path: "productGrid exact card and cart identity",
          extractorVersion: "giftmandu-v1",
          fields: ["membership", "offerType", "product", "originalPrice", "salePrice"],
        },
        {
          url: member.url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${member.title}; SKU ${attrs.sku}; original NPR ${member.original / 100}; sale NPR ${member.sale / 100}; in stock; ${terms}`,
          path: "productView prices; simple form; BCData JSON; matching JSON-LD",
          extractorVersion: "giftmandu-v1",
          fields: ["product", "originalPrice", "salePrice", "components", "eligibility"],
        },
      ],
    },
  };
}
export function createGiftmanduAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "giftmandu",
    async scan(source) {
      if (source.id !== "giftmandu" || !source.campaignEntryPoints?.includes(GIFTMANDU_COLLECTION))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          root = await fetchPage(GIFTMANDU_ROOT, source),
          collection = await fetchPage(GIFTMANDU_COLLECTION, source);
        if (root.status !== 200 || collection.status !== 200)
          return { ok: false, reason: "NETWORK_ERROR" };
        const members = giftmanduMembers(collection.body);
        if (!giftmanduCampaign(root.body, fetchedAt) || !members)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members) {
          const r = await fetchPage(member.url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const o = extractGiftmandu(root.body, collection.body, r.body, member, fetchedAt);
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
