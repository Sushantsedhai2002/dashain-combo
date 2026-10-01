import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { parseNprPrice } from "./product-details.ts";
export const MAKKUSE_FEED =
  "https://www.daraz.com.np/makkus%C3%A9-124624095/?ajax=true&sort=newest";
export const MAKKUSE_DETAIL =
  "https://www.daraz.com.np/products/makkuse-dashain-ashirbaad-pack-2083-i1548175752-s12376453054.html";
const TITLE = "Makkusé Dashain Ashirbaad Pack 2083",
  ITEM = "1548175752",
  SKU = "12376453054",
  SELLER = "900156015986";
function rec(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function empty(v: unknown) {
  return Array.isArray(v) && v.length === 0;
}
function parse(raw: string): Record<string, unknown> | null {
  try {
    if (raw.length > 500_000) return null;
    const v: unknown = JSON.parse(raw);
    return rec(v) ? v : null;
  } catch {
    return null;
  }
}
export function extractMakkuse(
  feed: string,
  html: string,
  fetchedAt: string,
): CandidateOffer | null {
  if (!Number.isFinite(Date.parse(fetchedAt)) || new Date(fetchedAt).getUTCFullYear() !== 2026)
    return null;
  const v = parse(feed),
    $ = load(html);
  if (
    !v ||
    !rec(v.mainInfo) ||
    v.mainInfo.venture !== "NP" ||
    v.mainInfo.bizCode !== 0 ||
    v.mainInfo.errorMsg !== "" ||
    v.mainInfo.pageType !== "SearchListBrand" ||
    !rec(v.mainInfo.selectedFilters) ||
    v.mainInfo.selectedFilters.brand !== "124624095" ||
    !rec(v.mods) ||
    !Array.isArray(v.mods.listItems) ||
    v.mods.listItems.length > 100 ||
    $("h1").text().trim() !== TITLE
  )
    return null;
  const members = v.mods.listItems.filter((x) => rec(x) && x.itemId === ITEM);
  const m: unknown = members[0];
  if (
    members.length !== 1 ||
    !rec(m) ||
    m.name !== TITLE ||
    m.nid !== ITEM ||
    m.sellerName !== "Makkuse" ||
    m.sellerId !== SELLER ||
    m.brandId !== "124624095" ||
    m.skuId !== SKU ||
    m.cheapest_sku !== `${ITEM}_NP-${SKU}` ||
    m.inStock !== true ||
    !Array.isArray(m.skus) ||
    m.skus.length !== 1 ||
    !rec(m.skus[0]) ||
    m.skus[0].id !== `${ITEM}_NP-${SKU}` ||
    m.itemUrl !==
      "//www.daraz.com.np/products/makkuse-dashain-ashirbaad-pack-2083-i1548175752.html" ||
    typeof m.price !== "string" ||
    typeof m.originalPrice !== "string" ||
    typeof m.priceShow !== "string"
  )
    return null;
  const sale = parseNprPrice(`NPR ${m.price}`),
    original = parseNprPrice(`NPR ${m.originalPrice}`);
  if (
    sale === null ||
    original === null ||
    sale <= 0 ||
    original <= sale ||
    parseNprPrice(m.priceShow) !== sale
  )
    return null;
  // Parse only the bounded literal JSON assignment; surrounding JavaScript is never executed.
  const matches = $("script")
    .toArray()
    .flatMap((e) => {
      const match = /(?:^|\n)\s*var __moduleData__ = (\{[^\n]*\});(?:\r?\n|$)/.exec($(e).text());
      return match?.[1] ? [match[1]] : [];
    });
  if (matches.length !== 1) return null;
  const module = parse(matches[0]!),
    data = module?.data;
  if (!rec(data) || !rec(data.root) || !rec(data.root.fields)) return null;
  const f = data.root.fields,
    option = f.productOption,
    p = f.product,
    config = f.globalConfig,
    key = f.primaryKey;
  if (
    !rec(option) ||
    !empty(option.options) ||
    !rec(option.skuBase) ||
    !empty(option.skuBase.properties) ||
    !Array.isArray(option.skuBase.skus) ||
    option.skuBase.skus.length !== 1 ||
    !rec(p) ||
    p.title !== TITLE ||
    !rec(p.brand) ||
    p.brand.name !== "Makkusé" ||
    !rec(config) ||
    config.currency !== "NPR" ||
    config.country !== "NP" ||
    !rec(key) ||
    key.itemId !== ITEM ||
    key.skuId !== SKU ||
    key.sellerId !== SELLER ||
    key.defaultSkuId !== SKU ||
    !Array.isArray(key.loadedSkuIds) ||
    key.loadedSkuIds.length !== 1 ||
    key.loadedSkuIds[0] !== SKU ||
    !empty(key.skuNames) ||
    !rec(f.skuInfos) ||
    !rec(f.tracking) ||
    parseNprPrice(String(f.tracking.pdt_price)) !== original
  )
    return null;
  const sku: unknown = option.skuBase.skus[0],
    info = f.skuInfos[SKU];
  if (
    !rec(sku) ||
    sku.itemId !== ITEM ||
    sku.skuId !== SKU ||
    sku.sellerId !== SELLER ||
    sku.cartSkuId !== SKU ||
    sku.innerSkuId !== `${ITEM}_NP-${SKU}` ||
    !rec(info) ||
    info.itemId !== ITEM ||
    info.skuId !== SKU ||
    info.sellerId !== SELLER ||
    info.preSaleTag !== false ||
    !rec(info.operation) ||
    info.operation.disable !== false ||
    !rec(info.quantity) ||
    !rec(info.quantity.limit) ||
    typeof info.quantity.limit.max !== "number" ||
    info.quantity.limit.max < 1 ||
    typeof p.desc !== "string"
  )
    return null;
  const desc = load(p.desc).text().replace(/\s+/g, " ");
  if (
    !["20 pcs Regular Pustakari", "20 pcs Coffee Pustakari", "20 pcs Chewy Pustakari"].every((x) =>
      desc.includes(x),
    )
  )
    return null;
  const terms =
    "Makkuse seller ID 900156015986 on Daraz. Exact single SKU 12376453054; 20 regular, 20 coffee and 20 chewy Pustakari pieces. Public brand listing supplies the observed original/sale prices; product data independently confirms seller/SKU, no selectable options and enabled purchase. Delivery, coins, payment vouchers and rewards are excluded.";
  const keyName = "makkuse-dashain-2083";
  return {
    sourceOfferKey: `${keyName}:${SKU}`,
    title: TITLE,
    productName: TITLE,
    brandName: "Makkusé",
    category: "FOOD_AND_DELIVERY",
    destinationUrl: MAKKUSE_DETAIL,
    originalPrice: { currency: "NPR", amountMinor: original },
    salePrice: { currency: "NPR", amountMinor: sale },
    discountPercent: Math.round((1 - sale / original) * 100),
    terms,
    explicitValidityEnd: null,
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "EXPLICIT_PRODUCT_DASHAIN_2083",
        "PUBLIC_NAMED_SELLER_PRICE_PAIR",
        "DETAIL_SINGLE_SKU_AND_SELLER_CORROBORATION",
      ],
      campaign: {
        key: keyName,
        title: "Makkusé Dashain packs 2083",
        festivals: ["DASHAIN"],
        seasonAD: 2026,
        seasonBS: "2083",
        publishedAt: null,
        startsAt: null,
        endsAt: null,
        originalDateText: null,
        dateCalendar: "UNKNOWN",
        evidenceUrl: MAKKUSE_FEED,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: ITEM,
        model: "Makkusé Ashirbaad Pack",
        variant: "60 pieces: 20 regular / 20 coffee / 20 chewy Pustakari",
        gtin: null,
        attributes: { sellerId: SELLER, sku: SKU },
      },
      merchant: "Makkuse",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [
        { description: "Regular Pustakari", quantity: 20, unit: "piece", role: "MAIN_ITEM" },
        { description: "Coffee Pustakari", quantity: 20, unit: "piece", role: "MAIN_ITEM" },
        { description: "Chewy Pustakari", quantity: 20, unit: "piece", role: "MAIN_ITEM" },
      ],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: MAKKUSE_FEED,
          fetchedAt,
          contentHash: createHash("sha256").update(feed).digest("hex"),
          excerpt: `${TITLE}; seller Makkuse ${SELLER}; single SKU ${SKU}; NPR ${sale / 100}, original NPR ${original / 100}; in stock`,
          path: "reviewed public brand JSON listing, exact product record",
          extractorVersion: "makkuse-daraz-v1",
          fields: ["campaign", "membership", "offerType", "product", "originalPrice", "salePrice"],
        },
        {
          url: MAKKUSE_DETAIL,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${TITLE}; matching seller ${SELLER} and only SKU ${SKU}; no options; purchase enabled; ${desc.slice(0, 700)}`,
          path: "visible title and literal product/skuBase/primaryKey/skuInfos JSON",
          extractorVersion: "makkuse-daraz-v1",
          fields: ["product", "components", "eligibility"],
        },
      ],
    },
  };
}
export function createMakkuseAdapter(fetch: PageFetcher, clock = () => new Date()): SourceAdapter {
  return {
    sourceId: "makkuse-daraz",
    async scan(source) {
      if (source.id !== "makkuse-daraz" || !source.publicEvidenceFeeds?.includes(MAKKUSE_FEED))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const at = clock().toISOString(),
          feed = await fetch(MAKKUSE_FEED, source),
          detail = await fetch(MAKKUSE_DETAIL, source);
        if (feed.status !== 200 || detail.status !== 200)
          return { ok: false, reason: "NETWORK_ERROR" };
        const o = extractMakkuse(feed.body, detail.body, at);
        return o
          ? { ok: true, offers: [o], partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
